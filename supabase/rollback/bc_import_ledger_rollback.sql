-- EMERGENCY rollback for supabase/pending/bc_import_ledger.sql.
-- Restores bc_apply_batch byte-for-byte as captured live on 2026-10-01 (before the ledger change).
-- Ledger table is RETAINED by default (contains the only before-images); drop it only by a separate owner decision.
BEGIN;
CREATE OR REPLACE FUNCTION public.bc_apply_batch(p_run uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run record; r record; v_target uuid; v_p jsonb; v_snap jsonb; v_cur jsonb; v_link record;
  v_applied int := 0; v_conflict int := 0; v_failed int := 0; v_skipped int := 0; v_code text; w jsonb;
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
      IF v_link IS NOT NULL THEN
        v_target := v_link.instructor_id;           -- retry / reimport: stable UUID
      ELSIF r.decision = 'link' THEN
        v_target := r.target_instructor_id;
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
      ELSE
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
END $function$

;
REVOKE ALL ON FUNCTION public.bc_apply_batch(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_apply_batch(uuid, integer) TO service_role;
DROP FUNCTION IF EXISTS public.bc_recovery_dry_run(uuid, uuid[]);
-- Optional, ONLY after owner decision and after exporting the ledger: DROP TABLE public.instructor_import_ledger;
COMMIT;
