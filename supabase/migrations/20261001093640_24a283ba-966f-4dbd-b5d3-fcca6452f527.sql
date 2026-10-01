
-- 1. Staging: status values reconciled atomically
ALTER TABLE public.instructor_import_staging DROP CONSTRAINT instructor_import_staging_batch_status_check;
UPDATE public.instructor_import_staging SET batch_status = 'applied' WHERE batch_status = 'done';
ALTER TABLE public.instructor_import_staging ADD CONSTRAINT instructor_import_staging_batch_status_check
  CHECK (batch_status IN ('pending','applied','skipped','conflict','failed'));
ALTER TABLE public.instructor_import_staging
  ADD COLUMN assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN apply_payload jsonb,
  ADD COLUMN review_snapshot jsonb,
  ADD COLUMN photo_status text NOT NULL DEFAULT 'none' CHECK (photo_status IN ('none','pending','applied','kept_manual','failed')),
  ADD COLUMN applied_instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  ADD COLUMN applied_at timestamptz;

ALTER TABLE public.instructor_import_runs
  ADD COLUMN apply_started_by uuid,
  ADD COLUMN apply_started_at timestamptz;

-- 2. Private HR: raw assignments with provenance
ALTER TABLE public.instructor_hr_private
  ADD COLUMN assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Apply one batch of reviewed rows; each row in its own subtransaction.
CREATE OR REPLACE FUNCTION public.bc_apply_batch(p_run uuid, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- 4. Photos. A current manual photo or an existing manual avatar always wins.
CREATE OR REPLACE FUNCTION public.bc_register_import_photo(p_run uuid, p_source_id text, p_path text, p_sha text, p_width int, p_height int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst uuid; v_manual boolean; v_cur record;
BEGIN
  SELECT applied_instructor_id INTO v_inst FROM instructor_import_staging
   WHERE run_id=p_run AND source_id=p_source_id AND batch_status='applied';
  IF v_inst IS NULL THEN RAISE EXCEPTION 'row_not_applied'; END IF;
  IF p_path !~ ('^' || v_inst::text || '/import-[0-9a-f]{64}\.jpg$') THEN RAISE EXCEPTION 'bad_path'; END IF;
  PERFORM 1 FROM instructors WHERE id=v_inst FOR UPDATE;
  SELECT * INTO v_cur FROM instructor_photos WHERE instructor_id=v_inst AND is_current;
  v_manual := (v_cur.origin = 'manual_upload')
           OR EXISTS (SELECT 1 FROM instructors WHERE id=v_inst AND avatar_url IS NOT NULL);
  IF EXISTS (SELECT 1 FROM instructor_photos WHERE instructor_id=v_inst AND storage_path=p_path) THEN
    NULL; -- idempotent
  ELSIF v_manual THEN
    INSERT INTO instructor_photos (instructor_id, storage_path, origin, source_sha256, width, height, is_current)
    VALUES (v_inst, p_path, 'booking_import', p_sha, p_width, p_height, false);
  ELSE
    UPDATE instructor_photos SET is_current=false WHERE instructor_id=v_inst AND is_current;
    INSERT INTO instructor_photos (instructor_id, storage_path, origin, source_sha256, width, height, is_current)
    VALUES (v_inst, p_path, 'booking_import', p_sha, p_width, p_height, true);
  END IF;
  UPDATE instructor_import_staging SET photo_status = CASE WHEN v_manual THEN 'kept_manual' ELSE 'applied' END
   WHERE run_id=p_run AND source_id=p_source_id;
  RETURN CASE WHEN v_manual THEN 'kept_manual' ELSE 'applied' END;
END $$;

CREATE OR REPLACE FUNCTION public.bc_register_manual_photo(p_instructor uuid, p_path text, p_width int, p_height int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_path !~ ('^' || p_instructor::text || '/manual-[0-9a-f]{64}\.jpg$') THEN RAISE EXCEPTION 'bad_path'; END IF;
  PERFORM 1 FROM instructors WHERE id=p_instructor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instructor_missing'; END IF;
  UPDATE instructor_photos SET is_current=false WHERE instructor_id=p_instructor AND is_current;
  INSERT INTO instructor_photos (instructor_id, storage_path, origin, width, height, is_current)
  VALUES (p_instructor, p_path, 'manual_upload', p_width, p_height, true) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.bc_finish_run(p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_object_agg(batch_status, n) INTO v FROM (
    SELECT batch_status, count(*) n FROM instructor_import_staging WHERE run_id=p_run GROUP BY 1) s;
  IF EXISTS (SELECT 1 FROM instructor_import_staging WHERE run_id=p_run
             AND (batch_status IN ('pending','conflict','failed') OR photo_status IN ('pending','failed'))) THEN
    RETURN jsonb_build_object('finished', false, 'status', v);
  END IF;
  UPDATE instructor_import_runs SET status='applied', applied_at=now(), updated_at=now() WHERE id=p_run AND status='applying';
  RETURN jsonb_build_object('finished', true, 'status', v);
END $$;

REVOKE EXECUTE ON FUNCTION public.bc_apply_batch(uuid,int), public.bc_register_import_photo(uuid,text,text,text,int,int),
  public.bc_register_manual_photo(uuid,text,int,int), public.bc_finish_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_apply_batch(uuid,int), public.bc_register_import_photo(uuid,text,text,text,int,int),
  public.bc_register_manual_photo(uuid,text,int,int), public.bc_finish_run(uuid) TO service_role;

-- 5. Bookability: linked people only inside a window; unlinked legacy YETI people unchanged.
CREATE OR REPLACE FUNCTION public.pa_slot_conflicts(p_instructor uuid, p_date date, p_start time without time zone, p_end time without time zone, p_exclude_appointment uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, ref_id uuid, time_start time without time zone, time_end time without time zone)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT 'booking'::text, ti.id, ti.time_start::time, ti.time_end::time
  FROM public.ticket_items ti
  WHERE ti.instructor_id = p_instructor AND ti.date = p_date
    AND coalesce(ti.status,'') <> 'cancelled'
    AND ti.time_start IS NOT NULL AND ti.time_end IS NOT NULL
    AND ti.time_start::time < p_end AND ti.time_end::time > p_start
    AND (p_exclude_appointment IS NULL OR ti.appointment_id IS DISTINCT FROM p_exclude_appointment)
  UNION ALL
  SELECT 'appointment', pa.id, pa.time_start, pa.time_end
  FROM public.private_appointments pa
  WHERE pa.instructor_id = p_instructor AND pa.date = p_date AND pa.status <> 'cancelled'
    AND pa.time_start < p_end AND pa.time_end > p_start
    AND (p_exclude_appointment IS NULL OR pa.id <> p_exclude_appointment)
  UNION ALL
  SELECT 'absence', ab.id, ab.time_start, ab.time_end
  FROM public.instructor_absences ab
  WHERE ab.instructor_id = p_instructor
    AND p_date BETWEEN ab.start_date AND ab.end_date
    AND coalesce(ab.status,'confirmed') NOT IN ('rejected','cancelled')
    AND (coalesce(ab.is_full_day, true) OR ab.time_start IS NULL OR ab.time_end IS NULL
         OR (ab.time_start < p_end AND ab.time_end > p_start))
  UNION ALL
  SELECT 'recurring_block', rb.id, rb.start_time, rb.end_time
  FROM public.instructor_recurring_blocks rb
  WHERE rb.instructor_id = p_instructor
    AND coalesce(rb.is_active, true)
    AND coalesce(rb.status,'approved') NOT IN ('rejected','cancelled')
    AND p_date >= rb.valid_from AND (rb.valid_until IS NULL OR p_date <= rb.valid_until)
    AND extract(dow FROM p_date)::int = ANY(rb.weekdays)
    AND rb.start_time < p_end AND rb.end_time > p_start
  UNION ALL
  SELECT 'not_deployed', p_instructor, p_start, p_end
  WHERE NOT public.instructor_is_deployed(p_instructor, p_date)
$function$;

DO $$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef('public.create_provisional_reservation'::regproc);
  n := (length(d) - length(replace(d, 'WHERE i.status = ''active''', ''))) / length('WHERE i.status = ''active''');
  IF n <> 1 THEN RAISE EXCEPTION 'reservation_patch_anchor_count:%', n; END IF;
  EXECUTE replace(d, 'WHERE i.status = ''active''', 'WHERE i.status = ''active'' AND public.instructor_is_deployed(i.id, v_date)');
END $$;

-- 6. Staff read helper for scheduler gating (no HR data, only dates).
CREATE OR REPLACE FUNCTION public.instructor_deployment_gates()
RETURNS TABLE(instructor_id uuid, valid_from date, valid_until date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, w.valid_from, w.valid_until
  FROM (SELECT instructor_id id FROM instructor_source_links UNION SELECT instructor_id FROM instructor_deployment_windows) g
  LEFT JOIN instructor_deployment_windows w ON w.instructor_id = g.id
  WHERE public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_deployment_gates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_deployment_gates() TO authenticated, service_role;
