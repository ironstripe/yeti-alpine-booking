-- Booking-Corner Apply: first-write before-image ledger + operator-only recovery DRY-RUN.
-- STATUS: PENDING REVIEW. Not applied. Additive + re-runnable (IF NOT EXISTS / OR REPLACE).
-- Rollback: supabase/rollback/bc_import_ledger_rollback.sql (restores live bc_apply_batch,
--   sha256 of captured definition a20fda4afafe3d8e1d23b13c01abe7a6d11a315cc4f4062fff141b0f38c5de57).
-- Changes vs live bc_apply_batch (only):
--   (a) every existing target (review link OR existing source link) is locked FOR UPDATE before the guard;
--   (b) right before the instructors UPDATE, the exact full instructors row + HR-private, source-link,
--       deployment-window and photo-metadata state (absent rows recorded explicitly) is written to the ledger;
--   (c) after a real INSERT (new UUID) a 'created' provenance row is written. Reimport/old link = never 'created'.
--   (d) same-run retry guard: if the source link was last written by THIS run, the row is re-applied only when
--       every import-owned field still equals what this run wrote (ledger pre-image + payload); otherwise
--       'edited_since_same_run_apply' conflict and nothing is touched. A link from an earlier run (separately
--       reviewed reimport) keeps the Booking-authoritative semantics unchanged.
--   (e) link detection uses the link's primary key (record IS NOT NULL is false when any column is NULL,
--       e.g. last_import_run_id after ON DELETE SET NULL).
-- Both happen inside the existing per-row BEGIN..EXCEPTION subtransaction: a failed row leaves no ledger row.
-- ON CONFLICT (run_id, instructor_id) DO NOTHING: retries never overwrite the first image.
-- Ledger: service_role write, super_admin read, no anon/teacher/office/admin, not in Realtime, immutable.

-- 1. Ledger table ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instructor_import_ledger (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.instructor_import_runs(id) ON DELETE RESTRICT,
  staging_id         uuid NOT NULL REFERENCES public.instructor_import_staging(id) ON DELETE RESTRICT,
  source_id          text NOT NULL,
  instructor_id      uuid NOT NULL,            -- no FK on purpose: provenance must survive any later delete
  kind               text NOT NULL CHECK (kind IN ('updated','created')),
  instructor_row     jsonb,                    -- exact to_jsonb(instructors) before mutation ('updated' only)
  hr_private_present boolean,
  hr_private_row     jsonb,
  source_link_present boolean,
  source_link_row    jsonb,
  window_rows        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [] = explicitly none
  photo_rows         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- metadata only, never image bytes
  row_sha256         text NOT NULL,
  captured_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, instructor_id),
  UNIQUE (run_id, source_id),
  CHECK ((kind = 'updated') = (instructor_row IS NOT NULL)),
  CHECK (kind = 'created' OR (hr_private_present IS NOT NULL AND source_link_present IS NOT NULL))
);

REVOKE ALL ON public.instructor_import_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_import_ledger TO authenticated;          -- filtered by RLS to super_admin
GRANT SELECT, INSERT ON public.instructor_import_ledger TO service_role;  -- no UPDATE/DELETE grant
ALTER TABLE public.instructor_import_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bc_ledger_super_admin_read" ON public.instructor_import_ledger;
CREATE POLICY "bc_ledger_super_admin_read" ON public.instructor_import_ledger
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.bc_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'ledger_immutable' USING ERRCODE = '42501'; END $$;
REVOKE ALL ON FUNCTION public.bc_ledger_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_bc_ledger_immutable ON public.instructor_import_ledger;
CREATE TRIGGER trg_bc_ledger_immutable BEFORE UPDATE OR DELETE ON public.instructor_import_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bc_ledger_immutable();
DROP TRIGGER IF EXISTS trg_bc_ledger_no_truncate ON public.instructor_import_ledger;
CREATE TRIGGER trg_bc_ledger_no_truncate BEFORE TRUNCATE ON public.instructor_import_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.bc_ledger_immutable();

-- 2. bc_apply_batch (live body + ledger) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_apply_batch(p_run uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run record; r record; v_target uuid; v_p jsonb; v_snap jsonb; v_cur jsonb; v_link record;
  v_applied int := 0; v_conflict int := 0; v_failed int := 0; v_skipped int := 0; v_code text; w jsonb;
  v_pre jsonb; v_hr jsonb; v_sl jsonb; v_win jsonb; v_ph jsonb; v_led record; v_drift boolean;
  c_apply constant text[] := ARRAY['first_name','last_name','email','phone','birth_date','gender','street','zip','city','country'];
BEGIN
  SELECT * INTO v_run FROM instructor_import_runs WHERE id = p_run FOR UPDATE;
  IF v_run IS NULL OR v_run.status <> 'applying' THEN RAISE EXCEPTION 'run_not_applying'; END IF;

  FOR r IN SELECT * FROM instructor_import_staging
           WHERE run_id = p_run AND batch_status IN ('pending','failed') AND decision IS NOT NULL
           ORDER BY source_id LIMIT greatest(1, least(p_limit, 50)) FOR UPDATE
  LOOP
    BEGIN
      v_code := NULL;
      IF r.decision = 'skip' THEN
        UPDATE instructor_import_staging SET batch_status='skipped', error=NULL WHERE id=r.id;
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;
      v_p := r.apply_payload;
      IF v_p IS NULL THEN RAISE EXCEPTION 'payload_missing'; END IF;

      SELECT * INTO v_link FROM instructor_source_links
        WHERE source_system=v_run.source_system AND rollout=v_run.rollout AND source_id=r.source_id;
      IF v_link.id IS NOT NULL THEN
        v_target := v_link.instructor_id;           -- retry / reimport: stable UUID
        PERFORM 1 FROM instructors WHERE id=v_target FOR UPDATE;
        IF v_link.last_import_run_id = p_run THEN   -- same-run retry: never overwrite an intervening edit
          SELECT * INTO v_led FROM instructor_import_ledger WHERE run_id=p_run AND instructor_id=v_target;
          IF v_led.id IS NULL THEN
            v_code := 'same_run_ledger_missing';
          ELSE
            SELECT coalesce(bool_or((to_jsonb(i) ->> k) IS DISTINCT FROM
                     CASE WHEN v_led.kind = 'created' THEN v_p ->> k
                          ELSE coalesce(v_p ->> k, v_led.instructor_row ->> k) END), true)
              INTO v_drift FROM instructors i, unnest(c_apply) k WHERE i.id = v_target;
            IF v_drift THEN v_code := 'edited_since_same_run_apply'; END IF;
          END IF;
        END IF;
      ELSIF r.decision = 'link' THEN
        v_target := r.target_instructor_id;
        IF v_target IS NOT NULL THEN PERFORM 1 FROM instructors WHERE id=v_target FOR UPDATE; END IF;
        IF v_target IS NULL OR NOT EXISTS (SELECT 1 FROM instructors WHERE id=v_target) THEN v_code := 'target_missing';
        ELSIF EXISTS (SELECT 1 FROM instructor_source_links WHERE instructor_id=v_target
                        AND source_system=v_run.source_system AND rollout=v_run.rollout) THEN v_code := 'target_already_linked';
        ELSE
          SELECT jsonb_object_agg(k, to_jsonb(i) ->> k) INTO v_cur
            FROM instructors i, jsonb_object_keys(coalesce(r.review_snapshot,'{}'::jsonb)) k WHERE i.id=v_target;
          IF coalesce(v_cur,'{}'::jsonb) <> coalesce(r.review_snapshot,'{}'::jsonb) THEN v_code := 'target_changed_since_review'; END IF;
        END IF;
      ELSE
        v_target := NULL;
      END IF;

      IF v_code IS NULL AND (v_p->>'email') IS NOT NULL AND EXISTS (
          SELECT 1 FROM instructors WHERE lower(email)=lower(v_p->>'email') AND id IS DISTINCT FROM v_target) THEN
        v_code := 'email_collision';
      END IF;
      IF v_code IS NULL AND v_target IS NULL AND ((v_p->>'first_name') IS NULL OR (v_p->>'last_name') IS NULL) THEN
        v_code := 'name_missing';
      END IF;
      IF v_code IS NOT NULL THEN
        UPDATE instructor_import_staging SET batch_status='conflict', error=v_code WHERE id=r.id;
        v_conflict := v_conflict + 1; CONTINUE;
      END IF;

      IF v_target IS NULL THEN
        INSERT INTO instructors (first_name, last_name, email, phone, birth_date, gender, street, zip, city, country,
                                 hourly_rate, languages, specialization, entry_date, show_on_website, status)
        VALUES (v_p->>'first_name', v_p->>'last_name', v_p->>'email', v_p->>'phone', (v_p->>'birth_date')::date,
                v_p->>'gender', v_p->>'street', v_p->>'zip', v_p->>'city', v_p->>'country',
                NULL, '{}'::text[], NULL, NULL, false, 'active')
        RETURNING id INTO v_target;
        -- provenance for a REAL new UUID only
        INSERT INTO instructor_import_ledger (run_id, staging_id, source_id, instructor_id, kind, row_sha256)
        VALUES (p_run, r.id, r.source_id, v_target, 'created',
                encode(sha256(convert_to(p_run::text||r.source_id||v_target::text, 'UTF8')), 'hex'))
        ON CONFLICT (run_id, instructor_id) DO NOTHING;
      ELSE
        -- exact first pre-mutation image (row is locked above)
        SELECT to_jsonb(i) INTO v_pre FROM instructors i WHERE i.id = v_target;
        SELECT to_jsonb(h) INTO v_hr FROM instructor_hr_private h WHERE h.instructor_id = v_target;
        SELECT to_jsonb(s) INTO v_sl FROM instructor_source_links s
          WHERE s.instructor_id = v_target AND s.source_system=v_run.source_system AND s.rollout=v_run.rollout;
        SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) INTO v_win
          FROM instructor_deployment_windows d WHERE d.instructor_id = v_target;
        SELECT coalesce(jsonb_agg(to_jsonb(ph) ORDER BY ph.id), '[]'::jsonb) INTO v_ph
          FROM instructor_photos ph WHERE ph.instructor_id = v_target;
        INSERT INTO instructor_import_ledger (run_id, staging_id, source_id, instructor_id, kind, instructor_row,
            hr_private_present, hr_private_row, source_link_present, source_link_row, window_rows, photo_rows, row_sha256)
        VALUES (p_run, r.id, r.source_id, v_target, 'updated', v_pre,
            v_hr IS NOT NULL, v_hr, v_sl IS NOT NULL, v_sl, v_win, v_ph,
            encode(sha256(convert_to(jsonb_build_array(v_pre, v_hr, v_sl, v_win, v_ph)::text, 'UTF8')), 'hex'))
        ON CONFLICT (run_id, instructor_id) DO NOTHING;

        -- Source is authoritative for non-empty values; empty source never erases. UUID/status/flags/avatar untouched.
        UPDATE instructors SET
          first_name = coalesce(v_p->>'first_name', first_name),
          last_name  = coalesce(v_p->>'last_name', last_name),
          email      = coalesce(v_p->>'email', email),
          phone      = coalesce(v_p->>'phone', phone),
          birth_date = coalesce((v_p->>'birth_date')::date, birth_date),
          gender     = coalesce(v_p->>'gender', gender),
          street     = coalesce(v_p->>'street', street),
          zip        = coalesce(v_p->>'zip', zip),
          city       = coalesce(v_p->>'city', city),
          country    = coalesce(v_p->>'country', country)
        WHERE id = v_target;
      END IF;

      INSERT INTO instructor_source_links (source_system, rollout, source_id, instructor_id, source_checksum, last_import_run_id)
      VALUES (v_run.source_system, v_run.rollout, r.source_id, v_target, r.source_checksum, p_run)
      ON CONFLICT (source_system, rollout, source_id)
      DO UPDATE SET source_checksum=EXCLUDED.source_checksum, last_import_run_id=p_run, updated_at=now();

      INSERT INTO instructor_hr_private (instructor_id, wage_raw, bank_raw, ahv_raw, unresolved, assignments, source_provenance, source_import_run_id, updated_at)
      VALUES (v_target, r.private_payload->>'wage_raw', r.private_payload->>'bank_raw', r.private_payload->>'ahv_raw',
              coalesce(r.private_payload->'unresolved','{}'::jsonb), r.assignments,
              jsonb_build_object('source_system', v_run.source_system, 'rollout', v_run.rollout, 'source_id', r.source_id,
                                 'run_id', p_run, 'xlsx_sha256', v_run.xlsx_sha256, 'assignments_mapped', false), p_run, now())
      ON CONFLICT (instructor_id) DO UPDATE SET
        wage_raw = coalesce(EXCLUDED.wage_raw, instructor_hr_private.wage_raw),
        bank_raw = coalesce(EXCLUDED.bank_raw, instructor_hr_private.bank_raw),
        ahv_raw  = coalesce(EXCLUDED.ahv_raw, instructor_hr_private.ahv_raw),
        unresolved = instructor_hr_private.unresolved || EXCLUDED.unresolved,
        assignments = EXCLUDED.assignments, source_provenance = EXCLUDED.source_provenance,
        source_import_run_id = p_run, updated_at = now();

      FOR w IN SELECT * FROM jsonb_array_elements(coalesce(v_p->'windows','[]'::jsonb)) LOOP
        INSERT INTO instructor_deployment_windows (instructor_id, valid_from, valid_until, source, import_run_id)
        VALUES (v_target, (w->>'from')::date, (w->>'until')::date, 'booking_corner', p_run)
        ON CONFLICT (instructor_id, valid_from, valid_until, source) DO NOTHING;
      END LOOP;

      UPDATE instructor_import_staging SET batch_status='applied', error=NULL, applied_instructor_id=v_target, applied_at=now()
        WHERE id=r.id;
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE instructor_import_staging SET batch_status='failed', error=left(SQLERRM, 200) WHERE id=r.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied, 'conflict', v_conflict, 'failed', v_failed, 'skipped', v_skipped,
    'remaining', (SELECT count(*) FROM instructor_import_staging WHERE run_id=p_run AND batch_status='pending'));
END $function$;
REVOKE ALL ON FUNCTION public.bc_apply_batch(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_apply_batch(uuid, integer) TO service_role;

-- 3. Operator-only recovery DRY-RUN (reads only; returns field NAMES and verdicts, never values) ----
CREATE OR REPLACE FUNCTION public.bc_recovery_dry_run(p_run uuid, p_instructor_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  L record; s record; v_cur jsonb; v_out jsonb := '[]'::jsonb; v_reasons text[]; v_fields jsonb; k text;
  v_before text; v_written text; v_now text; v_n bigint; fk record; v_refs jsonb;
  c_apply constant text[] := ARRAY['first_name','last_name','email','phone','birth_date','gender','street','zip','city','country'];
  c_pay   constant text[] := ARRAY['hourly_rate','bank_name','iban','ahv_number'];
  c_vol   constant text[] := ARRAY['real_time_status'];
  v_ok int := 0; v_stop int := 0; v_run record; v_hrdiff text[]; v_capids uuid[];
BEGIN
  SELECT * INTO v_run FROM instructor_import_runs WHERE id = p_run;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'run_not_found'; END IF;

  FOR L IN SELECT * FROM instructor_import_ledger
           WHERE run_id = p_run AND (p_instructor_ids IS NULL OR instructor_id = ANY(p_instructor_ids))
           ORDER BY source_id
  LOOP
    v_reasons := '{}'; v_fields := '[]'::jsonb; v_refs := '{}'::jsonb;
    SELECT * INTO s FROM instructor_import_staging WHERE id = L.staging_id;
    SELECT to_jsonb(i) INTO v_cur FROM instructors i WHERE i.id = L.instructor_id;

    IF v_cur IS NULL THEN
      v_reasons := v_reasons || 'instructor_no_longer_exists';
    ELSIF L.kind = 'updated' THEN
      FOREACH k IN ARRAY c_apply LOOP
        v_before  := L.instructor_row ->> k;
        v_written := coalesce(s.apply_payload ->> k, v_before);
        v_now     := v_cur ->> k;
        v_fields := v_fields || jsonb_build_object('field', k, 'status',
          CASE WHEN v_written IS NOT DISTINCT FROM v_before THEN 'not_changed_by_import'
               WHEN v_now IS NOT DISTINCT FROM v_written THEN 'restorable'
               ELSE 'edited_after_import' END);
        IF v_written IS DISTINCT FROM v_before AND v_now IS DISTINCT FROM v_written THEN
          v_reasons := v_reasons || ('edited_after_import:' || k);
        END IF;
      END LOOP;
      FOR k IN SELECT jsonb_object_keys(v_cur) LOOP
        CONTINUE WHEN k = ANY(c_apply) OR k = ANY(c_vol);
        IF (v_cur -> k) IS DISTINCT FROM (L.instructor_row -> k) THEN
          v_reasons := v_reasons || (CASE WHEN k = ANY(c_pay) THEN 'pay_changed:' ELSE 'profile_changed:' END || k);
        END IF;
      END LOOP;
      -- HR: compare the live row with exactly what this run wrote (ledger before-image + staging payload,
      -- same expressions as bc_apply_batch). No time window; updated_at ignored.
      SELECT array_agg(f ORDER BY f) INTO v_hrdiff FROM (
        SELECT f FROM instructor_hr_private h,
          LATERAL (VALUES
            ('wage_raw',   to_jsonb(h.wage_raw)  IS DISTINCT FROM to_jsonb(coalesce(s.private_payload->>'wage_raw', L.hr_private_row->>'wage_raw'))),
            ('bank_raw',   to_jsonb(h.bank_raw)  IS DISTINCT FROM to_jsonb(coalesce(s.private_payload->>'bank_raw', L.hr_private_row->>'bank_raw'))),
            ('ahv_raw',    to_jsonb(h.ahv_raw)   IS DISTINCT FROM to_jsonb(coalesce(s.private_payload->>'ahv_raw',  L.hr_private_row->>'ahv_raw'))),
            ('unresolved', h.unresolved IS DISTINCT FROM (coalesce(L.hr_private_row->'unresolved','{}'::jsonb) || coalesce(s.private_payload->'unresolved','{}'::jsonb))),
            ('assignments', h.assignments IS DISTINCT FROM s.assignments),
            ('source_provenance', h.source_provenance IS DISTINCT FROM jsonb_build_object('source_system', v_run.source_system, 'rollout', v_run.rollout,
                 'source_id', L.source_id, 'run_id', p_run, 'xlsx_sha256', v_run.xlsx_sha256, 'assignments_mapped', false)),
            ('source_import_run_id', h.source_import_run_id IS DISTINCT FROM p_run)) AS c(f, changed)
        WHERE h.instructor_id = L.instructor_id AND c.changed
        UNION ALL SELECT 'row_missing' WHERE NOT EXISTS (SELECT 1 FROM instructor_hr_private h WHERE h.instructor_id = L.instructor_id)) z;
      IF v_hrdiff IS NOT NULL THEN
        v_reasons := v_reasons || ARRAY(SELECT 'hr_private_changed_after_import:' || x FROM unnest(v_hrdiff) x);
      END IF;
    END IF;

    IF v_cur IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM instructor_source_links sl WHERE sl.instructor_id = L.instructor_id
                 AND sl.last_import_run_id IS DISTINCT FROM p_run) THEN
        v_reasons := v_reasons || 'later_import_touched'::text;
      END IF;
      -- Photos: identity/metadata comparison against the captured photo_rows (no wall-clock ordering).
      SELECT coalesce(array_agg((e->>'id')::uuid), '{}') INTO v_capids FROM jsonb_array_elements(L.photo_rows) e;
      IF EXISTS (SELECT 1 FROM instructor_photos ph WHERE ph.instructor_id = L.instructor_id
                 AND ph.origin = 'manual_upload' AND NOT (ph.id = ANY(v_capids))) THEN
        v_reasons := v_reasons || 'manual_photo_after_import'::text;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(L.photo_rows) e
                 LEFT JOIN instructor_photos ph ON ph.id = (e->>'id')::uuid
                 WHERE ph.id IS NULL OR (to_jsonb(ph) - 'is_current') IS DISTINCT FROM (e - 'is_current')) THEN
        v_reasons := v_reasons || 'photo_metadata_changed'::text;
      END IF;
      IF L.kind = 'updated'
         AND NOT (s.photo_status = 'applied' AND (SELECT count(*) = 1 AND coalesce(bool_and(ph.origin = 'booking_import' AND NOT (ph.id = ANY(v_capids))), false)
                  FROM instructor_photos ph WHERE ph.instructor_id = L.instructor_id AND ph.is_current))
         AND (SELECT coalesce(array_agg(ph.id ORDER BY ph.id) FILTER (WHERE ph.is_current), '{}')
                FROM instructor_photos ph WHERE ph.instructor_id = L.instructor_id)
             IS DISTINCT FROM
             (SELECT coalesce(array_agg((e->>'id')::uuid ORDER BY (e->>'id')::uuid) FILTER (WHERE (e->>'is_current')::boolean), '{}')
                FROM jsonb_array_elements(L.photo_rows) e) THEN
        v_reasons := v_reasons || 'photo_current_changed'::text;
      END IF;
      SELECT count(*) INTO v_n FROM ticket_items t WHERE t.instructor_id = L.instructor_id AND t.created_at >= L.captured_at;
      IF v_n > 0 THEN v_reasons := v_reasons || 'bookings_since_import'::text; END IF;
      SELECT count(*) INTO v_n FROM private_appointments pa WHERE pa.instructor_id = L.instructor_id AND pa.created_at >= L.captured_at;
      IF v_n > 0 THEN v_reasons := v_reasons || 'private_appointments_since_import'::text; END IF;

      IF L.kind = 'created' THEN
        -- every FK onto instructors except rows this run itself owns
        FOR fk IN SELECT c.conrelid::regclass AS tbl, a.attname AS col
                  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                  WHERE c.contype = 'f' AND c.confrelid = 'public.instructors'::regclass AND array_length(c.conkey,1) = 1
        LOOP
          CONTINUE WHEN fk.tbl::text IN ('instructor_source_links','instructor_hr_private','instructor_import_staging','instructor_live_status');
          IF fk.tbl::text = 'instructor_deployment_windows' THEN
            SELECT count(*) INTO v_n FROM instructor_deployment_windows WHERE instructor_id = L.instructor_id AND import_run_id IS DISTINCT FROM p_run;
          ELSIF fk.tbl::text = 'instructor_photos' THEN
            SELECT count(*) INTO v_n FROM instructor_photos WHERE instructor_id = L.instructor_id AND origin <> 'booking_import';
          ELSE
            EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', fk.tbl, fk.col) INTO v_n USING L.instructor_id;
          END IF;
          IF v_n > 0 THEN v_refs := v_refs || jsonb_build_object(fk.tbl::text || '.' || fk.col, v_n); END IF;
        END LOOP;
        IF v_refs <> '{}'::jsonb THEN v_reasons := v_reasons || 'referenced_cannot_delete'::text; END IF;
      END IF;
    END IF;

    v_reasons := ARRAY(SELECT DISTINCT unnest(v_reasons) ORDER BY 1);
    IF cardinality(v_reasons) > 0 THEN v_stop := v_stop + 1;
    ELSE v_ok := v_ok + 1; END IF;

    v_out := v_out || jsonb_build_object(
      'source_id', L.source_id, 'instructor_id', L.instructor_id, 'kind', L.kind, 'captured_at', L.captured_at,
      'verdict', CASE WHEN cardinality(v_reasons) > 0 THEN 'stop'
                      WHEN L.kind = 'created' THEN 'unreferenced_create_candidate'
                      ELSE 'restorable' END,
      'reasons', to_jsonb(v_reasons), 'fields', v_fields, 'references', v_refs,
      'would_remove', jsonb_build_object(
        'source_link', L.kind = 'created' OR NOT coalesce(L.source_link_present, false),
        'deployment_windows', (SELECT count(*) FROM instructor_deployment_windows d WHERE d.instructor_id = L.instructor_id AND d.import_run_id = p_run),
        'import_photos', (SELECT count(*) FROM instructor_photos ph WHERE ph.instructor_id = L.instructor_id AND ph.origin = 'booking_import'
                           AND NOT (ph.id = ANY(coalesce(ARRAY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(L.photo_rows) e), '{}'))))));
  END LOOP;

  RETURN jsonb_build_object('mode', 'dry_run_only', 'run_id', p_run,
    'counts', jsonb_build_object('ledger_rows', jsonb_array_length(v_out), 'stop', v_stop, 'restorable_or_candidate', v_ok,
      'staging_applied', (SELECT count(*) FROM instructor_import_staging WHERE run_id = p_run AND batch_status = 'applied'),
      'applied_without_ledger', (SELECT count(*) FROM instructor_import_staging st WHERE st.run_id = p_run AND st.batch_status = 'applied'
                                 AND NOT EXISTS (SELECT 1 FROM instructor_import_ledger l WHERE l.run_id = p_run AND l.source_id = st.source_id))),
    'rows', v_out);
END $function$;
REVOKE ALL ON FUNCTION public.bc_recovery_dry_run(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_recovery_dry_run(uuid, uuid[]) TO service_role;
