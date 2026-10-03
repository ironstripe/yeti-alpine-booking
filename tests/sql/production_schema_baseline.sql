-- Schema-only snapshot of the production public schema (pg_dump --schema-only, NO data), 2026-10-03.
-- Used only to run pending SQL against faithful constraints/triggers/functions in a throwaway local DB.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = off;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET escape_string_warning = off;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'office',
    'teacher',
    'super_admin'
);


--
-- Name: instructor_role_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instructor_role_type AS ENUM (
    'teacher',
    'assistant'
);


--
-- Name: inventory_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_condition AS ENUM (
    'Neu',
    'Ok',
    'Ausgebleicht',
    'Ersetzen'
);


--
-- Name: inventory_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_item_status AS ENUM (
    'Verfügbar',
    'Ausgeliehen',
    'Verloren',
    'In Reparatur'
);


--
-- Name: rental_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rental_item_status AS ENUM (
    'Ausgeliehen',
    'Rückgabe initiiert',
    'Zurückgegeben',
    'Verloren gemeldet'
);


--
-- Name: rental_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rental_status AS ENUM (
    'Wartet auf Quittierung',
    'Ausgeliehen',
    'Teilweise zurückgegeben',
    'Abgeschlossen'
);


--
-- Name: return_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_condition AS ENUM (
    'Ok',
    'Beschädigt',
    'Verloren'
);


--
-- Name: assign_instructor_to_course_week(uuid, date, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_instructor_to_course_week(p_course_id uuid, p_week_start_date date, p_instructor_id uuid, p_assistant_instructor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_week_end_date DATE;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can assign instructors.'
    );
  END IF;

  v_week_end_date := p_week_start_date + 6;

  -- Update all instances for the given course in the given week
  UPDATE public.group_course_instances
  SET 
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id
  WHERE course_id = p_course_id
    AND date >= p_week_start_date
    AND date <= v_week_end_date;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments updated.',
    'instances_updated', v_updated_count,
    'course_id', p_course_id,
    'instructor_id', p_instructor_id,
    'assistant_instructor_id', p_assistant_instructor_id
  );
END;
$$;


--
-- Name: auto_assign_ticket_season(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_assign_ticket_season() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id
    FROM public.seasons
    WHERE NEW.created_at::date >= start_date
      AND NEW.created_at::date <= end_date
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: bc_apply_batch(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_apply_batch(p_run uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        -- Existing YETI test hourly rates must not appear as verified 26/27 Booking pay after a FIRST link.
        -- The preimage above retains the original; later imports preserve manually confirmed hourly_rate.
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
          country    = coalesce(v_p->>'country', country),
          hourly_rate = CASE WHEN v_link.id IS NULL THEN NULL ELSE hourly_rate END
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


--
-- Name: bc_finish_run(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_finish_run(p_run uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: bc_ledger_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_ledger_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN RAISE EXCEPTION 'ledger_immutable' USING ERRCODE = '42501'; END $$;


--
-- Name: bc_photo_path_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_photo_path_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.storage_path ILIKE 'instructor-avatars/%' THEN
    RAISE EXCEPTION 'photo_must_use_private_bucket';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: bc_recovery_dry_run(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_recovery_dry_run(p_run uuid, p_instructor_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
        IF (v_cur -> k) IS DISTINCT FROM
           (CASE WHEN k = 'hourly_rate' AND NOT coalesce(L.source_link_present, false)
                 THEN 'null'::jsonb ELSE L.instructor_row -> k END) THEN
          v_reasons := v_reasons || (CASE WHEN k = ANY(c_pay) THEN 'pay_changed:' ELSE 'profile_changed:' END || k);
        END IF;
      END LOOP;
    END IF;

    IF v_cur IS NOT NULL THEN
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
                                 AND NOT EXISTS (SELECT 1 FROM instructor_import_ledger ledger_lookup WHERE ledger_lookup.run_id = p_run AND ledger_lookup.source_id = st.source_id))),
    'rows', v_out);
END $_$;


--
-- Name: bc_register_import_photo(uuid, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_register_import_photo(p_run uuid, p_source_id text, p_path text, p_sha text, p_width integer, p_height integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: bc_register_manual_photo(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bc_register_manual_photo(p_instructor uuid, p_path text, p_width integer, p_height integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE v_id uuid;
BEGIN
  IF p_path !~ ('^' || p_instructor::text || '/manual-[0-9a-f]{64}\.jpg$') THEN RAISE EXCEPTION 'bad_path'; END IF;
  PERFORM 1 FROM instructors WHERE id=p_instructor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instructor_missing'; END IF;
  UPDATE instructor_photos SET is_current=false WHERE instructor_id=p_instructor AND is_current;
  INSERT INTO instructor_photos (instructor_id, storage_path, origin, width, height, is_current)
  VALUES (p_instructor, p_path, 'manual_upload', p_width, p_height, true) RETURNING id INTO v_id;
  RETURN v_id;
END $_$;


--
-- Name: cancel_participant_transfer_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_participant_transfer_request(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_instructor_id UUID;
  v_request RECORD;
BEGIN
  -- Get the instructor ID of the currently authenticated user
  v_instructor_id := public.get_instructor_for_user(auth.uid());

  IF v_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Fetch the request
  SELECT * INTO v_request
  FROM public.participant_transfer_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  -- Authorization: Only the requesting instructor can cancel
  IF v_request.requesting_instructor_id != v_instructor_id THEN
    RAISE EXCEPTION 'You can only cancel your own transfer requests';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be canceled';
  END IF;

  -- Update the status
  UPDATE public.participant_transfer_requests
  SET status = 'canceled'
  WHERE id = p_request_id;

  RETURN jsonb_build_object('status', 'success', 'new_status', 'canceled');
END;
$$;


--
-- Name: check_recurring_block_conflicts(uuid, time without time zone, time without time zone, integer[], date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_recurring_block_conflicts(p_instructor_id uuid, p_start_time time without time zone, p_end_time time without time zone, p_weekdays integer[], p_valid_from date, p_valid_until date) RETURNS TABLE(booking_id uuid, booking_date date, time_start time without time zone, time_end time without time zone, participant_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_admin_or_office(auth.uid())
          OR (auth.uid() IS NOT NULL AND p_instructor_id = public.get_instructor_for_user(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT 
    ti.id,
    ti.date,
    ti.time_start::TIME,
    ti.time_end::TIME,
    COALESCE(cp.first_name || ' ' || cp.last_name, 'Unbekannt')
  FROM public.ticket_items ti
  LEFT JOIN public.customer_participants cp ON cp.id = ti.participant_id
  WHERE ti.instructor_id = p_instructor_id
    AND ti.date >= p_valid_from
    AND (p_valid_until IS NULL OR ti.date <= p_valid_until)
    AND EXTRACT(DOW FROM ti.date)::INTEGER = ANY(p_weekdays)
    AND ti.time_start::TIME < p_end_time
    AND ti.time_end::TIME > p_start_time
    AND ti.status NOT IN ('cancelled');
END;
$$;


--
-- Name: copy_instructor_assignments_from_previous_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.copy_instructor_assignments_from_previous_week(p_target_week_start_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_source_week_start DATE;
  v_source_week_end DATE;
  v_target_week_end DATE;
  v_assignment_record RECORD;
  v_copied_count INT := 0;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can copy assignments.'
    );
  END IF;

  v_source_week_start := p_target_week_start_date - 7;
  v_source_week_end := v_source_week_start + 6;
  v_target_week_end := p_target_week_start_date + 6;

  -- Loop through distinct course assignments from the source week
  FOR v_assignment_record IN
    SELECT DISTINCT 
      course_id,
      instructor_id,
      assistant_instructor_id
    FROM public.group_course_instances
    WHERE date >= v_source_week_start
      AND date <= v_source_week_end
      AND instructor_id IS NOT NULL
  LOOP
    -- Apply the assignment to all instances of this course in target week
    UPDATE public.group_course_instances
    SET 
      instructor_id = v_assignment_record.instructor_id,
      assistant_instructor_id = v_assignment_record.assistant_instructor_id
    WHERE course_id = v_assignment_record.course_id
      AND date >= p_target_week_start_date
      AND date <= v_target_week_end;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count > 0 THEN
      v_copied_count := v_copied_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments copied from previous week.',
    'courses_copied', v_copied_count,
    'source_week', v_source_week_start,
    'target_week', p_target_week_start_date
  );
END;
$$;


--
-- Name: create_next_friday_race_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_next_friday_race_event() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  next_friday DATE;
  new_event_id UUID;
BEGIN
  -- Security check
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied. Only admin or office staff can create events.';
  END IF;

  -- Find next Friday
  next_friday := date_trunc('week', CURRENT_DATE) + INTERVAL '4 days';
  IF next_friday <= CURRENT_DATE THEN
    next_friday := next_friday + INTERVAL '7 days';
  END IF;
  
  -- Check if event already exists
  SELECT id INTO new_event_id FROM public.events WHERE event_date = next_friday;
  IF new_event_id IS NOT NULL THEN
    RETURN new_event_id;
  END IF;
  
  -- Create new event
  INSERT INTO public.events (name, event_date, status, instructor_deadline)
  VALUES (
    'Gästeskirennen',
    next_friday,
    'registration_open',
    next_friday - INTERVAL '2 days' + TIME '18:00'
  )
  RETURNING id INTO new_event_id;
  
  RETURN new_event_id;
END;
$$;


--
-- Name: create_participant_transfer_request(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_participant_transfer_request(p_source_group_id uuid, p_target_group_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_requesting_instructor_id UUID;
  v_new_request_id UUID;
BEGIN
  -- Get the instructor ID of the currently authenticated user
  v_requesting_instructor_id := public.get_instructor_for_user(auth.uid());

  -- Authorization Check: Ensure the user is an instructor
  IF v_requesting_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Authorization Check: Ensure the instructor is the leader of the source group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_course_instances
    WHERE id = p_source_group_id
      AND instructor_id = v_requesting_instructor_id
  ) THEN
    RAISE EXCEPTION 'You are not the leader of the source group';
  END IF;

  -- Insert the new request
  INSERT INTO public.participant_transfer_requests (
    source_group_id,
    target_group_id,
    participant_id,
    requesting_instructor_id
  )
  VALUES (
    p_source_group_id,
    p_target_group_id,
    p_participant_id,
    v_requesting_instructor_id
  )
  RETURNING id INTO v_new_request_id;

  -- Return the ID of the newly created request
  RETURN jsonb_build_object('status', 'success', 'request_id', v_new_request_id);
END;
$$;


--
-- Name: create_provisional_reservation(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_provisional_reservation(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_customer jsonb := p_payload->'customer';
  v_items jsonb := p_payload->'items';
  v_product_id uuid := (p_payload->>'product_id')::uuid;
  v_hold_minutes int := COALESCE((p_payload->>'hold_minutes')::int, 15);
  v_source text := COALESCE(p_payload->>'source', 'website');
  v_notes text := p_payload->>'notes';

  v_product RECORD;
  v_item jsonb;

  v_n_days int;
  v_total_hours numeric := 0;
  v_participant_count int;
  v_total_amount numeric := 0;
  v_tier_price numeric;

  v_slot_instructor uuid;
  v_inst RECORD;
  v_conflict boolean;
  v_date date;
  v_start time;
  v_end time;
  v_hours numeric;
  v_unit_price numeric;
  v_i int;

  v_slot_key text;
  v_ticket_id uuid;
  v_ticket_number text;
  v_token text;
  v_expires_at timestamptz;
  v_assigned jsonb := '[]'::jsonb;
BEGIN
  -- participant_count is authoritative; legacy payloads may still send participants
  v_participant_count := COALESCE(
    (p_payload->>'participant_count')::int,
    CASE WHEN jsonb_typeof(p_payload->'participants') = 'array'
         THEN jsonb_array_length(p_payload->'participants') END
  );

  IF v_participant_count IS NULL OR v_participant_count < 1 OR v_participant_count > 20 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'participant_count must be between 1 and 20');
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'at least one date/time slot is required');
  END IF;

  SELECT string_agg((it->>'date') || '|' || (it->>'time_start') || '|' || (it->>'time_end'), ';' ORDER BY (it->>'date'), (it->>'time_start'))
  INTO v_slot_key
  FROM jsonb_array_elements(v_items) it;

  PERFORM pg_advisory_xact_lock(hashtextextended('reservation:' || COALESCE(p_payload->>'slot_key', v_slot_key), 0));

  SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND is_active = true;
  IF v_product IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'product not found or inactive');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    IF v_date < CURRENT_DATE THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'date ' || v_date || ' is in the past');
    END IF;
    IF v_end <= v_start THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'end_time must be after start_time');
    END IF;
    v_total_hours := v_total_hours + (EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0);
  END LOOP;

  v_n_days := (SELECT count(DISTINCT (it->>'date')) FROM jsonb_array_elements(v_items) it);

  IF v_product.pricing_type = 'tiered' THEN
    SELECT cumulative_price INTO v_tier_price
    FROM public.product_price_tiers
    WHERE product_id = v_product.id AND day_count <= v_n_days
    ORDER BY day_count DESC LIMIT 1;
    v_total_amount := COALESCE(v_tier_price, v_product.price * v_n_days) * v_participant_count;
  ELSIF v_product.pricing_type = 'hourly' THEN
    v_total_amount := v_product.price * v_total_hours;
  ELSE
    v_total_amount := v_product.price * v_participant_count;
  END IF;

  v_ticket_number := public.generate_ticket_number();
  v_expires_at := now() + make_interval(mins => v_hold_minutes);

  INSERT INTO public.tickets (ticket_number, customer_id, status, notes, ticket_type, source,
                              total_amount, paid_amount, reservation_expires_at, participant_count)
  VALUES (v_ticket_number, NULL, 'provisional', v_notes, 'standard', v_source,
          v_total_amount, 0, v_expires_at, v_participant_count)
  RETURNING id, reservation_token INTO v_ticket_id, v_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    v_hours := EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0;

    IF v_product.pricing_type = 'hourly' THEN
      v_unit_price := v_product.price * v_hours;
    ELSE
      v_unit_price := v_product.price;
    END IF;

    v_slot_instructor := NULL;
    FOR v_inst IN
      SELECT i.id,
        (SELECT count(*) FROM public.ticket_items ti
         JOIN public.tickets t ON t.id = ti.ticket_id
         WHERE ti.instructor_id = i.id AND ti.date = v_date
           AND COALESCE(ti.status, '') NOT IN ('cancelled', 'storno')
           AND t.status NOT IN ('cancelled', 'storno', 'expired')) AS day_load
      FROM public.instructors i
      WHERE i.status = 'active' AND public.instructor_is_deployed(i.id, v_date)
        AND (i.roles IS NULL OR i.roles && ARRAY['ski','snowboard','telemark','langlauf'])
      ORDER BY day_load ASC, i.id
    LOOP
      v_conflict := false;

      IF EXISTS (
        SELECT 1 FROM public.ticket_items ti
        JOIN public.tickets t ON t.id = ti.ticket_id
        WHERE ti.instructor_id = v_inst.id
          AND ti.date = v_date
          AND ti.time_start < v_end AND ti.time_end > v_start
          AND COALESCE(ti.status, '') NOT IN ('cancelled', 'storno')
          AND t.status NOT IN ('cancelled', 'storno', 'expired')
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.instructor_absences a
        WHERE a.instructor_id = v_inst.id
          AND COALESCE(a.status, 'pending') NOT IN ('rejected', 'declined', 'cancelled', 'abgelehnt')
          AND a.start_date <= v_date AND a.end_date >= v_date
          AND (COALESCE(a.is_full_day, true) OR (a.time_start < v_end AND a.time_end > v_start))
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.instructor_recurring_blocks rb
        WHERE rb.instructor_id = v_inst.id
          AND rb.is_active = true
          AND COALESCE(rb.status, 'pending') NOT IN ('rejected', 'declined', 'cancelled', 'abgelehnt')
          AND rb.valid_from <= v_date
          AND (rb.valid_until IS NULL OR rb.valid_until >= v_date)
          AND EXTRACT(DOW FROM v_date)::int = ANY(rb.weekdays)
          AND rb.start_time < v_end AND rb.end_time > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.group_course_instances gi
        WHERE (gi.instructor_id = v_inst.id OR gi.assistant_instructor_id = v_inst.id)
          AND gi.date = v_date
          AND COALESCE(gi.status, '') NOT IN ('cancelled', 'storno')
          AND gi.start_time < v_end AND gi.end_time > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.office_hour_blocks ob
        WHERE ob.instructor_id = v_inst.id
          AND ob.date = v_date
          AND ob.time_start < v_end AND ob.time_end > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict THEN
        v_slot_instructor := v_inst.id;
        EXIT;
      END IF;
    END LOOP;

    IF v_slot_instructor IS NULL THEN
      RAISE EXCEPTION 'slot_unavailable: no instructor available on % %-%', v_date, v_start, v_end;
    END IF;

    v_assigned := v_assigned || jsonb_build_object('date', v_date, 'time_start', v_start, 'time_end', v_end, 'instructor_id', v_slot_instructor);

    FOR v_i IN 1..v_participant_count LOOP
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id,
                                       date, time_start, time_end, unit_price, quantity, item_type, status)
      VALUES (v_ticket_id, v_product.id, NULL, v_slot_instructor,
              v_date, v_start, v_end, v_unit_price, 1, 'participant', 'booked');
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_number,
    'reservation_token', v_token,
    'reservation_expires_at', v_expires_at,
    'total_amount', v_total_amount,
    'currency', COALESCE(v_product.currency, 'CHF'),
    'participant_count', v_participant_count,
    'assignments', v_assigned
  );

EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'slot_unavailable%' THEN
      RETURN jsonb_build_object('status', 'error', 'code', 'slot_unavailable', 'message', SQLERRM);
    END IF;
    RAISE;
END;
$$;


--
-- Name: duplicate_products_for_season(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.duplicate_products_for_season(p_source_season_id uuid, p_target_season_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer := 0;
  v_product RECORD;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR v_product IN
    SELECT * FROM public.products WHERE season_id = p_source_season_id
  LOOP
    INSERT INTO public.products (
      season_id, name, description, type, price, currency, vat_rate,
      duration_minutes, min_age, max_age, is_active, sort_order, pricing_type,
      is_training_product, discipline, audience, reporting_category
    ) VALUES (
      p_target_season_id, v_product.name, v_product.description, v_product.type,
      v_product.price, v_product.currency, v_product.vat_rate, v_product.duration_minutes,
      v_product.min_age, v_product.max_age, v_product.is_active, v_product.sort_order,
      v_product.pricing_type, v_product.is_training_product,
      v_product.discipline, v_product.audience, v_product.reporting_category
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.product_price_tiers (product_id, min_participants, max_participants, price, sort_order)
    SELECT v_new_id, min_participants, max_participants, price, sort_order
    FROM public.product_price_tiers WHERE product_id = v_product.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: enforce_ticket_customer_required(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_ticket_customer_required() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.customer_id IS NULL
     AND COALESCE(NEW.status, '') NOT IN ('provisional', 'payment_pending', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'customer_id is required for tickets in status %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: ensure_single_primary_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_primary_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE customer_contacts 
    SET is_primary = false 
    WHERE customer_id = NEW.customer_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: expire_reservations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_reservations() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.tickets
  SET status = 'expired', updated_at = now()
  WHERE status IN ('provisional', 'payment_pending')
    AND reservation_expires_at IS NOT NULL
    AND reservation_expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: finalize_provisional_reservation(uuid, text, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_provisional_reservation(p_ticket_id uuid, p_token text, p_customer jsonb, p_participants jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket RECORD;
  v_customer_id uuid;
  v_participant_id uuid;
  v_participant_ids uuid[] := '{}';
  v_p jsonb;
  v_count int;
  v_email text;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket IS NULL OR v_ticket.reservation_token IS DISTINCT FROM p_token THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'not_found', 'message', 'Reservation not found');
  END IF;

  IF v_ticket.finalized_at IS NOT NULL AND v_ticket.customer_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'already_finalized', true,
                              'customer_id', v_ticket.customer_id, 'ticket_id', v_ticket.id);
  END IF;

  IF v_ticket.status = 'expired'
     OR (v_ticket.reservation_expires_at IS NOT NULL AND v_ticket.reservation_expires_at < now()) THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'expired', 'message', 'Reservation expired');
  END IF;

  IF v_ticket.status NOT IN ('provisional', 'payment_pending') THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_status', 'message', v_ticket.status);
  END IF;

  IF p_customer IS NULL OR COALESCE(p_customer->>'email', '') = '' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_customer', 'message', 'customer with email is required');
  END IF;

  IF jsonb_typeof(p_participants) <> 'array' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_participants', 'message', 'participants array is required');
  END IF;

  v_count := jsonb_array_length(p_participants);
  IF COALESCE(v_ticket.participant_count, v_count) <> v_count THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'participant_count_mismatch',
                              'message', format('expected %s participants, got %s', v_ticket.participant_count, v_count));
  END IF;

  v_email := LOWER(TRIM(p_customer->>'email'));

  SELECT id INTO v_customer_id FROM public.customers WHERE LOWER(email) = v_email LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (first_name, last_name, email, phone, street, zip, city, country, holiday_address, customer_type)
    VALUES (p_customer->>'first_name', p_customer->>'last_name', v_email,
            p_customer->>'phone', p_customer->>'street', p_customer->>'zip', p_customer->>'city',
            COALESCE(p_customer->>'country', 'CH'), '', 'private')
    RETURNING id INTO v_customer_id;
  END IF;

  FOR v_p IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    SELECT id INTO v_participant_id FROM public.customer_participants
    WHERE customer_id = v_customer_id
      AND first_name = v_p->>'first_name'
      AND COALESCE(last_name, '') = COALESCE(v_p->>'last_name', '')
      AND birth_date = (v_p->>'birth_date')::date
    LIMIT 1;

    IF v_participant_id IS NULL THEN
      INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport, level_current_season)
      VALUES (v_customer_id, v_p->>'first_name', v_p->>'last_name', (v_p->>'birth_date')::date,
              v_p->>'discipline', v_p->>'skill_level')
      RETURNING id INTO v_participant_id;
    END IF;

    v_participant_ids := v_participant_ids || v_participant_id;
  END LOOP;

  UPDATE public.tickets
  SET customer_id = v_customer_id,
      notes = COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), notes),
      finalized_at = now(),
      updated_at = now()
  WHERE id = p_ticket_id;

  UPDATE public.ticket_items ti
  SET participant_id = v_participant_ids[r.rn]
  FROM (
    SELECT id, row_number() OVER (PARTITION BY date, time_start, time_end ORDER BY created_at, id) AS rn
    FROM public.ticket_items
    WHERE ticket_id = p_ticket_id
  ) r
  WHERE ti.id = r.id AND r.rn <= array_length(v_participant_ids, 1);

  RETURN jsonb_build_object('status', 'success', 'ticket_id', p_ticket_id, 'customer_id', v_customer_id,
                            'participant_ids', to_jsonb(v_participant_ids));
END;
$$;


--
-- Name: generate_customer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_customer_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := 'KD-' || LPAD(nextval('public.customer_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_group_course_instances_for_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_group_course_instances_for_week(p_week_start_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_week_end_date DATE;
  v_instance_count INT := 0;
  v_schedule_record RECORD;
  v_instance_date DATE;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can generate instances.'
    );
  END IF;

  -- Calculate week boundaries (Monday to Sunday)
  v_week_end_date := p_week_start_date + 6;

  -- Loop through all active schedules for active group courses
  FOR v_schedule_record IN
    SELECT 
      s.id AS schedule_id,
      s.course_id,
      s.day_of_week,
      s.start_time,
      s.end_time
    FROM public.group_course_schedules s
    JOIN public.group_courses c ON s.course_id = c.id
    WHERE c.is_active = TRUE
      AND s.is_active = TRUE
      AND c.course_type = 'weekly'
  LOOP
    -- Calculate the actual date: week_start (Monday) + day_of_week offset
    -- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
    -- Adjust calculation: if day_of_week=0 (Sunday), it's +6 from Monday
    IF v_schedule_record.day_of_week = 0 THEN
      v_instance_date := p_week_start_date + 6;
    ELSE
      v_instance_date := p_week_start_date + (v_schedule_record.day_of_week - 1);
    END IF;

    -- Insert the instance if it doesn't already exist
    INSERT INTO public.group_course_instances (
      course_id,
      schedule_id,
      date,
      start_time,
      end_time,
      instructor_id,
      assistant_instructor_id,
      status,
      current_participants,
      notes
    )
    VALUES (
      v_schedule_record.course_id,
      v_schedule_record.schedule_id,
      v_instance_date,
      v_schedule_record.start_time,
      v_schedule_record.end_time,
      NULL,
      NULL,
      'scheduled',
      0,
      NULL
    )
    ON CONFLICT (course_id, date, start_time) DO NOTHING;

    -- Check if a row was inserted
    IF FOUND THEN
      v_instance_count := v_instance_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Week generation complete.',
    'instances_created', v_instance_count,
    'week_start', p_week_start_date,
    'week_end', v_week_end_date
  );
END;
$$;


--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'R-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number LIKE 'R-' || year_str || '-%';
  
  NEW.invoice_number := 'R-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_request_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_request_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(request_number FROM 'ANF-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.booking_requests
  WHERE request_number LIKE 'ANF-' || year_str || '-%';
  
  NEW.request_number := 'ANF-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_shop_transaction_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_shop_transaction_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.shop_transactions;
  
  NEW.transaction_number := 'S-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ticket_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  year_num integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  year_str text := to_char(CURRENT_DATE, 'YYYY');
  max_existing integer := 0;
  next_num integer;
BEGIN
  INSERT INTO public.ticket_number_counters (year, last_number)
  VALUES (year_num, 0)
  ON CONFLICT (year) DO NOTHING;

  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '^T-' || year_str || '-(\d+)$') AS integer)), 0)
  INTO max_existing
  FROM public.tickets
  WHERE ticket_number ~ ('^T-' || year_str || '-\d+$');

  UPDATE public.ticket_number_counters
  SET last_number = GREATEST(last_number, max_existing) + 1,
      updated_at = now()
  WHERE year = year_num
  RETURNING last_number INTO next_num;

  RETURN 'T-' || year_str || '-' || LPAD(next_num::text, 6, '0');
END;
$_$;


--
-- Name: generate_training_groups_for_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_training_groups_for_week(p_week_start date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  course_record RECORD;
  new_group_id UUID;
  groups_created INTEGER := 0;
  enrollments_assigned INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- For each active weekly course with instances in this week
  FOR course_record IN 
    SELECT DISTINCT gc.id as course_id, gc.name as course_name
    FROM group_courses gc
    JOIN group_course_instances gci ON gci.course_id = gc.id
    WHERE gci.date >= p_week_start 
      AND gci.date < p_week_start + INTERVAL '7 days'
      AND gc.course_type = 'weekly'
      AND gc.is_active = true
  LOOP
    -- Check if group 1 already exists
    SELECT id INTO new_group_id
    FROM training_groups
    WHERE course_id = course_record.course_id
      AND week_start = p_week_start
      AND group_number = 1;
    
    -- Create group 1 if not exists
    IF new_group_id IS NULL THEN
      INSERT INTO training_groups (course_id, week_start, group_number)
      VALUES (course_record.course_id, p_week_start, 1)
      RETURNING id INTO new_group_id;
      
      groups_created := groups_created + 1;
    END IF;
    
    -- Assign enrollments without a training_group_id to this group
    UPDATE group_course_enrollments e
    SET training_group_id = new_group_id
    FROM group_course_instances i
    WHERE e.instance_id = i.id
      AND i.course_id = course_record.course_id
      AND i.date >= p_week_start 
      AND i.date < p_week_start + INTERVAL '7 days'
      AND e.training_group_id IS NULL;
    
    enrollments_assigned := enrollments_assigned + (SELECT COUNT(*) FROM group_course_enrollments WHERE training_group_id = new_group_id);
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'groups_created', groups_created,
    'enrollments_assigned', enrollments_assigned
  );
END;
$$;


--
-- Name: generate_voucher_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_voucher_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  current_year TEXT;
  next_num INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 9) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.vouchers
  WHERE code LIKE 'GS-' || current_year || '-%';
  
  NEW.code := 'GS-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;


--
-- Name: get_instructor_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_instructor_for_user(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT l.instructor_id FROM public.instructor_user_links l WHERE l.user_id = _user_id),
    (SELECT CASE WHEN count(*) = 1 THEN min(i.id::text)::uuid END
       FROM public.instructors i JOIN auth.users u ON lower(u.email) = lower(i.email)
      WHERE u.id = _user_id
        AND NOT EXISTS (SELECT 1 FROM public.instructor_user_links l2 WHERE l2.instructor_id = i.id))
  )
$$;


--
-- Name: guard_teacher_absence_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_teacher_absence_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.is_staff(auth.uid()) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.instructor_id IS DISTINCT FROM OLD.instructor_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    THEN RAISE EXCEPTION 'teacher_cannot_change_absence_approval_or_owner' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: handle_group_instance_instructor_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_group_instance_instructor_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_course_name TEXT;
BEGIN
  -- Get course name once
  SELECT name INTO v_course_name 
  FROM public.group_courses 
  WHERE id = NEW.course_id;

  -- Notify main instructor when newly assigned
  IF NEW.instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.instructor_id IS DISTINCT FROM NEW.instructor_id AND OLD.instructor_id IS NULL)) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', COALESCE(v_course_name, 'Gruppenkurs'),
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', COALESCE(NEW.start_time::text, '') || ' - ' || COALESCE(NEW.end_time::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  -- Notify assistant instructor when newly assigned
  IF NEW.assistant_instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assistant_instructor_id IS DISTINCT FROM NEW.assistant_instructor_id AND OLD.assistant_instructor_id IS NULL)) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.assistant_instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', COALESCE(v_course_name, 'Gruppenkurs') || ' (Hilfskraft)',
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', COALESCE(NEW.start_time::text, '') || ' - ' || COALESCE(NEW.end_time::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_ticket_item_instructor_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_ticket_item_instructor_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_product_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM bc_transfer_20261003.active_tx a
             WHERE a.txid = txid_current() AND a.target_ticket_id = NEW.ticket_id) THEN
    RETURN NEW;
  END IF;

  -- Skip if no instructor assigned
  IF NEW.instructor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name 
  FROM public.products 
  WHERE id = NEW.product_id;

  -- Case 1: New Assignment (instructor_id was NULL, now has value)
  IF (TG_OP = 'INSERT' AND NEW.instructor_id IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND OLD.instructor_id IS NULL AND NEW.instructor_id IS NOT NULL) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.assigned',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'meeting_point', COALESCE(NEW.meeting_point, 'Nicht angegeben'),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

  -- Case 2: Booking Cancelled
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'storno' AND NEW.status = 'storno' THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.cancelled',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, '')
      )
    );

  -- Case 3: Booking Details Changed (date or time) - same instructor
  ELSIF TG_OP = 'UPDATE' AND 
        OLD.instructor_id = NEW.instructor_id AND
        (OLD.date IS DISTINCT FROM NEW.date OR OLD.time_start IS DISTINCT FROM NEW.time_start OR OLD.time_end IS DISTINCT FROM NEW.time_end) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.changed',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'old_date', to_char(OLD.date, 'DD.MM.YYYY'),
        'old_time', COALESCE(OLD.time_start::text, '') || ' - ' || COALESCE(OLD.time_end::text, ''),
        'new_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'new_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: instructor_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.instructors WHERE id = p_id;
END $$;


--
-- Name: instructor_deployment_gates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_deployment_gates() RETURNS TABLE(instructor_id uuid, valid_from date, valid_until date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT g.id, w.valid_from, w.valid_until
  FROM (SELECT instructor_id id FROM instructor_source_links UNION SELECT instructor_id FROM instructor_deployment_windows) g
  LEFT JOIN instructor_deployment_windows w ON w.instructor_id = g.id
  WHERE public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())
$$;


--
-- Name: instructor_is_deployed(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_is_deployed(_instructor_id uuid, _date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.instructor_source_links l WHERE l.instructor_id = _instructor_id)
     AND NOT EXISTS (SELECT 1 FROM public.instructor_deployment_windows w WHERE w.instructor_id = _instructor_id)
    THEN true
    ELSE EXISTS (SELECT 1 FROM public.instructor_deployment_windows w
                 WHERE w.instructor_id = _instructor_id AND _date BETWEEN w.valid_from AND w.valid_until)
  END
$$;


--
-- Name: instructor_ops_upsert(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_ops_upsert(p jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r public.instructors; v_id uuid; k text;
  allowed text[] := ARRAY['id','first_name','last_name','level','specialization','status','real_time_status','languages','role','roles',
    'instructor_type','gender','avatar_url','show_on_website','website_teaser','email','phone','street','zip','city','country',
    'birth_date','entry_date','notes'];
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'forbidden_field: %', k USING ERRCODE = '42501'; END IF;
  END LOOP;
  r := jsonb_populate_record(NULL::public.instructors, p);
  IF p ? 'id' AND r.id IS NOT NULL THEN
    UPDATE public.instructors i SET
      first_name = CASE WHEN p ? 'first_name' THEN r.first_name ELSE i.first_name END,
      last_name = CASE WHEN p ? 'last_name' THEN r.last_name ELSE i.last_name END,
      level = CASE WHEN p ? 'level' THEN r.level ELSE i.level END,
      specialization = CASE WHEN p ? 'specialization' THEN r.specialization ELSE i.specialization END,
      status = CASE WHEN p ? 'status' THEN r.status ELSE i.status END,
      real_time_status = CASE WHEN p ? 'real_time_status' THEN r.real_time_status ELSE i.real_time_status END,
      languages = CASE WHEN p ? 'languages' THEN r.languages ELSE i.languages END,
      role = CASE WHEN p ? 'role' THEN r.role ELSE i.role END,
      roles = CASE WHEN p ? 'roles' THEN r.roles ELSE i.roles END,
      instructor_type = CASE WHEN p ? 'instructor_type' THEN r.instructor_type ELSE i.instructor_type END,
      gender = CASE WHEN p ? 'gender' THEN r.gender ELSE i.gender END,
      avatar_url = CASE WHEN p ? 'avatar_url' THEN r.avatar_url ELSE i.avatar_url END,
      show_on_website = CASE WHEN p ? 'show_on_website' THEN r.show_on_website ELSE i.show_on_website END,
      website_teaser = CASE WHEN p ? 'website_teaser' THEN r.website_teaser ELSE i.website_teaser END,
      email = CASE WHEN p ? 'email' THEN r.email ELSE i.email END,
      phone = CASE WHEN p ? 'phone' THEN r.phone ELSE i.phone END,
      street = CASE WHEN p ? 'street' THEN r.street ELSE i.street END,
      zip = CASE WHEN p ? 'zip' THEN r.zip ELSE i.zip END,
      city = CASE WHEN p ? 'city' THEN r.city ELSE i.city END,
      country = CASE WHEN p ? 'country' THEN r.country ELSE i.country END,
      birth_date = CASE WHEN p ? 'birth_date' THEN r.birth_date ELSE i.birth_date END,
      entry_date = CASE WHEN p ? 'entry_date' THEN r.entry_date ELSE i.entry_date END,
      notes = CASE WHEN p ? 'notes' THEN r.notes ELSE i.notes END
    WHERE i.id = r.id RETURNING i.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  ELSE
    INSERT INTO public.instructors(first_name, last_name, level, specialization, status, real_time_status, languages, role, roles,
      instructor_type, gender, avatar_url, show_on_website, website_teaser, email, phone, street, zip, city, country, birth_date, entry_date, notes)
    VALUES (r.first_name, r.last_name, r.level, COALESCE(r.specialization,'ski'), COALESCE(r.status,'active'),
      COALESCE(r.real_time_status,'unavailable'), COALESCE(r.languages, ARRAY['de']), COALESCE(r.role,'instructor'), COALESCE(r.roles,'{}'),
      COALESCE(r.instructor_type,'teacher'), r.gender, r.avatar_url, false,
      COALESCE(r.website_teaser, 'Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.'),
      r.email, r.phone, r.street, r.zip, r.city, COALESCE(r.country,'LI'), r.birth_date, COALESCE(r.entry_date, CURRENT_DATE), r.notes)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;


--
-- Name: instructor_pay_update(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_pay_update(p_id uuid, p jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE k text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(ARRAY['hourly_rate','bank_name','iban','ahv_number']) THEN RAISE EXCEPTION 'forbidden_field: %', k; END IF;
  END LOOP;
  UPDATE public.instructors SET
    hourly_rate = CASE WHEN p ? 'hourly_rate' THEN NULLIF(p->>'hourly_rate','')::numeric ELSE hourly_rate END,
    bank_name = CASE WHEN p ? 'bank_name' THEN p->>'bank_name' ELSE bank_name END,
    iban = CASE WHEN p ? 'iban' THEN p->>'iban' ELSE iban END,
    ahv_number = CASE WHEN p ? 'ahv_number' THEN p->>'ahv_number' ELSE ahv_number END
  WHERE id = p_id;
END $$;


--
-- Name: instructor_self(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_self() RETURNS TABLE(id uuid, first_name text, last_name text, level text, specialization text, status text, real_time_status text, languages text[], role text, roles text[], gender text, avatar_url text, email text, phone text, street text, zip text, city text, country text, birth_date date, entry_date date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.first_name, i.last_name, i.level, i.specialization, i.status, i.real_time_status, i.languages, i.role, i.roles,
    i.gender, i.avatar_url, i.email, i.phone, i.street, i.zip, i.city, i.country, i.birth_date, i.entry_date
  FROM public.instructors i WHERE i.id = public.get_instructor_for_user(auth.uid())
$$;


--
-- Name: instructor_self_update(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_self_update(p jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid := public.get_instructor_for_user(auth.uid()); k text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_linked_instructor' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(ARRAY['phone','languages']) THEN RAISE EXCEPTION 'forbidden_field: %', k USING ERRCODE = '42501'; END IF;
  END LOOP;
  UPDATE public.instructors SET
    phone = CASE WHEN p ? 'phone' THEN p->>'phone' ELSE phone END,
    languages = CASE WHEN p ? 'languages' THEN ARRAY(SELECT jsonb_array_elements_text(p->'languages')) ELSE languages END
  WHERE id = v_id;
END $$;


--
-- Name: instructors_ops_list(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructors_ops_list(p_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, first_name text, last_name text, level text, specialization text, status text, real_time_status text, languages text[], role text, roles text[], instructor_type public.instructor_role_type, gender text, avatar_url text, show_on_website boolean, website_teaser text, email text, phone text, street text, zip text, city text, country text, birth_date date, entry_date date, notes text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT i.id, i.created_at, i.first_name, i.last_name, i.level, i.specialization, i.status, i.real_time_status,
    i.languages, i.role, i.roles, i.instructor_type, i.gender, i.avatar_url, i.show_on_website, i.website_teaser,
    i.email, i.phone, i.street, i.zip, i.city, i.country, i.birth_date, i.entry_date, i.notes
  FROM public.instructors i WHERE p_id IS NULL OR i.id = p_id ORDER BY i.last_name, i.first_name;
END $$;


--
-- Name: instructors_pay_list(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructors_pay_list(p_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, hourly_rate numeric, bank_name text, iban text, ahv_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT i.id, i.hourly_rate, i.bank_name, i.iban, i.ahv_number
  FROM public.instructors i WHERE p_id IS NULL OR i.id = p_id;
END $$;


--
-- Name: instructors_sync_live_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructors_sync_live_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.instructor_live_status(instructor_id, real_time_status, updated_at)
  VALUES (NEW.id, NEW.real_time_status, now())
  ON CONFLICT (instructor_id) DO UPDATE SET real_time_status = EXCLUDED.real_time_status, updated_at = now()
  WHERE public.instructor_live_status.real_time_status IS DISTINCT FROM EXCLUDED.real_time_status;
  RETURN NEW;
END $$;


--
-- Name: is_admin_or_office(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_office(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'office')
  )
$$;


--
-- Name: is_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('admin','office','super_admin'))
$$;


--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin')
$$;


--
-- Name: log_booking_cancelled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_booking_cancelled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
  VALUES (
    NEW.ticket_id,
    'BOOKING_CANCELLED',
    auth.uid(),
    jsonb_build_object(
      'cancellation_type', NEW.cancellation_type,
      'cancellation_fee', NEW.fee_charged,
      'reason', NEW.cancellation_reason,
      'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: log_ticket_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ticket_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
  VALUES (
    NEW.id,
    'BOOKING_CREATED',
    auth.uid(),
    jsonb_build_object(
      'ticket_number', NEW.ticket_number,
      'total_amount', NEW.total_amount,
      'customer_id', NEW.customer_id,
      'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: log_ticket_item_instructor_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ticket_item_instructor_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.instructor_id IS DISTINCT FROM NEW.instructor_id THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
    VALUES (
      NEW.ticket_id,
      'INSTRUCTOR_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'ticket_item_id', NEW.id,
        'old_instructor_id', OLD.instructor_id,
        'new_instructor_id', NEW.instructor_id,
        'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: log_ticket_status_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ticket_status_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: merge_customers(uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_customers(p_source_id uuid, p_target_id uuid, p_fields jsonb DEFAULT '{}'::jsonb, p_participant_merges jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_source public.customers%ROWTYPE;
  v_target public.customers%ROWTYPE;
  v_before jsonb;
  v_rel jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge_id uuid;
  v_dupes integer;
  v_pm jsonb;
  v_source_email text;
  v_email_parked text;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Zusammenführen';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Quelle und Ziel dürfen nicht identisch sein';
  END IF;

  IF p_source_id < p_target_id THEN
    SELECT * INTO v_source FROM public.customers WHERE id = p_source_id FOR UPDATE;
    SELECT * INTO v_target FROM public.customers WHERE id = p_target_id FOR UPDATE;
  ELSE
    SELECT * INTO v_target FROM public.customers WHERE id = p_target_id FOR UPDATE;
    SELECT * INTO v_source FROM public.customers WHERE id = p_source_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Kunde nicht gefunden';
  END IF;
  IF v_source.is_archived OR v_target.is_archived THEN
    RAISE EXCEPTION 'Ein Datensatz wurde bereits zusammengeführt';
  END IF;

  -- Teilnehmer-Dubletten zuerst auflösen
  FOR v_pm IN SELECT * FROM jsonb_array_elements(coalesce(p_participant_merges, '[]'::jsonb))
  LOOP
    UPDATE public.customer_participants SET customer_id = p_target_id
    WHERE id = (v_pm->>'source_participant_id')::uuid AND customer_id = p_source_id;
    PERFORM public.merge_participants(
      (v_pm->>'source_participant_id')::uuid,
      (v_pm->>'target_participant_id')::uuid,
      coalesce(v_pm->'fields', '{}'::jsonb));
  END LOOP;

  SELECT count(*) INTO v_dupes
  FROM public.customer_participants s
  JOIN public.customer_participants t
    ON t.customer_id = p_target_id AND t.is_archived = false
   AND public.yeti_normalize(t.first_name) = public.yeti_normalize(s.first_name)
   AND t.birth_date = s.birth_date
  WHERE s.customer_id = p_source_id AND s.is_archived = false;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'PARTICIPANT_CONFLICT: % mögliche Teilnehmer-Dubletten müssen zuerst geklärt werden', v_dupes;
  END IF;

  v_before := to_jsonb(v_target);
  v_source_email := v_source.email;

  -- Eindeutigkeitskonflikt E-Mail: Quelle zuerst freigeben
  IF p_fields ? 'email' AND lower(p_fields->>'email') = lower(v_source.email) THEN
    v_email_parked := 'merged-' || p_source_id::text || '@archiv.local';
    UPDATE public.customers SET email = v_email_parked WHERE id = p_source_id;
  END IF;

  UPDATE public.customers SET
    first_name = CASE WHEN p_fields ? 'first_name' THEN p_fields->>'first_name' ELSE first_name END,
    last_name = coalesce(p_fields->>'last_name', last_name),
    email = coalesce(p_fields->>'email', email),
    billing_email = CASE WHEN p_fields ? 'billing_email' THEN p_fields->>'billing_email' ELSE billing_email END,
    phone = CASE WHEN p_fields ? 'phone' THEN p_fields->>'phone' ELSE phone END,
    additional_phones = CASE WHEN p_fields ? 'additional_phones' THEN p_fields->'additional_phones' ELSE additional_phones END,
    additional_emails = CASE WHEN p_fields ? 'additional_emails' THEN p_fields->'additional_emails' ELSE additional_emails END,
    street = CASE WHEN p_fields ? 'street' THEN p_fields->>'street' ELSE street END,
    zip = CASE WHEN p_fields ? 'zip' THEN p_fields->>'zip' ELSE zip END,
    city = CASE WHEN p_fields ? 'city' THEN p_fields->>'city' ELSE city END,
    country = CASE WHEN p_fields ? 'country' THEN p_fields->>'country' ELSE country END,
    holiday_address = coalesce(p_fields->>'holiday_address', holiday_address),
    language = CASE WHEN p_fields ? 'language' THEN p_fields->>'language' ELSE language END,
    preferred_channel = CASE WHEN p_fields ? 'preferred_channel' THEN p_fields->>'preferred_channel' ELSE preferred_channel END,
    customer_type = CASE WHEN p_fields ? 'customer_type' THEN p_fields->>'customer_type' ELSE customer_type END,
    organization_name = CASE WHEN p_fields ? 'organization_name' THEN p_fields->>'organization_name' ELSE organization_name END,
    notes = CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END,
    -- Einwilligung wird nie durch das Zusammenführen erhöht
    marketing_consent = (coalesce(v_target.marketing_consent, false) AND coalesce(v_source.marketing_consent, false))
  WHERE id = p_target_id;

  WITH moved AS (UPDATE public.customer_participants SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_participants.customer_id', v_ids);

  WITH moved AS (UPDATE public.tickets SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('tickets.customer_id', v_ids);

  WITH moved AS (UPDATE public.invoices SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('invoices.customer_id', v_ids);

  WITH moved AS (UPDATE public.customer_credits SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_credits.customer_id', v_ids);

  WITH moved AS (UPDATE public.refund_requests SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('refund_requests.customer_id', v_ids);

  WITH moved AS (UPDATE public.vouchers SET buyer_customer_id = p_target_id WHERE buyer_customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('vouchers.buyer_customer_id', v_ids);

  WITH moved AS (UPDATE public.customer_contacts SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_contacts.customer_id', v_ids);

  WITH moved AS (UPDATE public.conversations SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('conversations.customer_id', v_ids);

  WITH moved AS (UPDATE public.conversations SET matched_customer_id = p_target_id WHERE matched_customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('conversations.matched_customer_id', v_ids);

  UPDATE public.customers
  SET is_archived = true, merged_into_id = p_target_id, merged_at = now(), merged_by = auth.uid()
  WHERE id = p_source_id;

  INSERT INTO public.entity_merges (entity_type, source_id, target_id, field_resolution, relationship_summary, performed_by, rollback_until)
  VALUES ('customer', p_source_id, p_target_id,
          jsonb_build_object(
            'applied', p_fields,
            'target_before', v_before,
            'source_customer_number_alias', v_source.customer_number,
            'source_email_before', v_source_email,
            'source_email_parked', v_email_parked),
          v_rel, auth.uid(), now() + interval '24 hours')
  RETURNING id INTO v_merge_id;

  RETURN jsonb_build_object('success', true, 'merge_id', v_merge_id, 'target_id', p_target_id, 'relationships', v_rel);
END;
$$;


--
-- Name: merge_participants(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_participants(p_source_id uuid, p_target_id uuid, p_fields jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_source public.customer_participants%ROWTYPE;
  v_target public.customer_participants%ROWTYPE;
  v_before jsonb;
  v_rel jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge_id uuid;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Zusammenführen';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Quelle und Ziel dürfen nicht identisch sein';
  END IF;

  SELECT * INTO v_source FROM public.customer_participants WHERE id = p_source_id FOR UPDATE;
  SELECT * INTO v_target FROM public.customer_participants WHERE id = p_target_id FOR UPDATE;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Teilnehmer nicht gefunden';
  END IF;
  IF v_source.is_archived OR v_target.is_archived THEN
    RAISE EXCEPTION 'Ein Datensatz wurde bereits zusammengeführt';
  END IF;
  IF v_source.customer_id <> v_target.customer_id THEN
    RAISE EXCEPTION 'Teilnehmer gehören zu unterschiedlichen Kunden';
  END IF;

  v_before := to_jsonb(v_target);

  UPDATE public.customer_participants SET
    first_name = coalesce(p_fields->>'first_name', first_name),
    last_name = CASE WHEN p_fields ? 'last_name' THEN p_fields->>'last_name' ELSE last_name END,
    birth_date = coalesce((p_fields->>'birth_date')::date, birth_date),
    sport = CASE WHEN p_fields ? 'sport' THEN p_fields->>'sport' ELSE sport END,
    level_last_season = CASE WHEN p_fields ? 'level_last_season' THEN p_fields->>'level_last_season' ELSE level_last_season END,
    level_current_season = CASE WHEN p_fields ? 'level_current_season' THEN p_fields->>'level_current_season' ELSE level_current_season END,
    current_ski_level_id = CASE WHEN p_fields ? 'current_ski_level_id' THEN p_fields->>'current_ski_level_id' ELSE current_ski_level_id END,
    current_snowboard_level_id = CASE WHEN p_fields ? 'current_snowboard_level_id' THEN p_fields->>'current_snowboard_level_id' ELSE current_snowboard_level_id END,
    self_assessed_ski_level = CASE WHEN p_fields ? 'self_assessed_ski_level' THEN p_fields->>'self_assessed_ski_level' ELSE self_assessed_ski_level END,
    self_assessed_snowboard_level = CASE WHEN p_fields ? 'self_assessed_snowboard_level' THEN p_fields->>'self_assessed_snowboard_level' ELSE self_assessed_snowboard_level END,
    notes = CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END
  WHERE id = p_target_id;

  WITH moved AS (
    UPDATE public.ticket_items SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('ticket_items.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.participant_level_history SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('participant_level_history.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.participant_transfer_requests SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('participant_transfer_requests.participant_id', v_ids);

  -- nur Anmeldungen übertragen, die beim Ziel noch nicht existieren
  WITH moved AS (
    UPDATE public.group_course_enrollments e SET participant_id = p_target_id
    WHERE e.participant_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM public.group_course_enrollments x
        WHERE x.participant_id = p_target_id AND x.instance_id IS NOT DISTINCT FROM e.instance_id
      )
    RETURNING e.id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('group_course_enrollments.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.event_participants ep SET participant_id = p_target_id
    WHERE ep.participant_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM public.event_participants x
        WHERE x.participant_id = p_target_id AND x.event_id = ep.event_id
      )
    RETURNING ep.id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('event_participants.participant_id', v_ids);

  UPDATE public.customer_participants
  SET is_archived = true, merged_into_id = p_target_id, merged_at = now(), merged_by = auth.uid()
  WHERE id = p_source_id;

  INSERT INTO public.entity_merges (entity_type, source_id, target_id, field_resolution, relationship_summary, performed_by, rollback_until)
  VALUES ('participant', p_source_id, p_target_id,
          jsonb_build_object('applied', p_fields, 'target_before', v_before),
          v_rel, auth.uid(), now() + interval '24 hours')
  RETURNING id INTO v_merge_id;

  RETURN jsonb_build_object('success', true, 'merge_id', v_merge_id, 'relationships', v_rel);
END;
$$;


--
-- Name: merge_training_groups(uuid[], uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_training_groups(p_source_group_ids uuid[], p_target_group_id uuid, p_new_group_name text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Update target group if new name/instructor provided
  IF p_new_group_name IS NOT NULL OR p_instructor_id IS NOT NULL THEN
    UPDATE training_groups
    SET 
      custom_name = COALESCE(p_new_group_name, custom_name),
      instructor_id = COALESCE(p_instructor_id, instructor_id),
      updated_at = NOW()
    WHERE id = p_target_group_id;
  END IF;
  
  -- Move all participants from source groups to target
  FOREACH source_id IN ARRAY p_source_group_ids
  LOOP
    IF source_id != p_target_group_id THEN
      -- Save original course for tracking
      UPDATE group_course_enrollments e
      SET 
        training_group_id = p_target_group_id,
        original_course_id = COALESCE(e.original_course_id, (
          SELECT i.course_id 
          FROM group_course_instances i 
          WHERE i.id = e.instance_id
        ))
      WHERE e.training_group_id = source_id;
      
      participants_moved := participants_moved + (
        SELECT COUNT(*) FROM group_course_enrollments WHERE training_group_id = p_target_group_id
      );
      
      -- Mark source group as merged
      UPDATE training_groups
      SET 
        status = 'merged',
        merged_into_group_id = p_target_group_id,
        updated_at = NOW()
      WHERE id = source_id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'participants_moved', participants_moved
  );
END;
$$;


--
-- Name: merge_training_groups(uuid[], uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_training_groups(p_source_group_ids uuid[], p_target_group_id uuid, p_new_group_name text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid, p_assistant_instructor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Always update target group with the user's chosen values
  UPDATE training_groups
  SET 
    custom_name = COALESCE(p_new_group_name, custom_name),
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id,
    updated_at = NOW()
  WHERE id = p_target_group_id;
  
  -- Move all participants from source groups to target
  FOREACH source_id IN ARRAY p_source_group_ids
  LOOP
    IF source_id != p_target_group_id THEN
      UPDATE group_course_enrollments e
      SET 
        training_group_id = p_target_group_id,
        original_course_id = COALESCE(e.original_course_id, (
          SELECT i.course_id 
          FROM group_course_instances i 
          WHERE i.id = e.instance_id
        ))
      WHERE e.training_group_id = source_id;
      
      participants_moved := participants_moved + (
        SELECT COUNT(*) FROM group_course_enrollments WHERE training_group_id = p_target_group_id
      );
      
      UPDATE training_groups
      SET 
        status = 'merged',
        merged_into_group_id = p_target_group_id,
        updated_at = NOW()
      WHERE id = source_id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'participants_moved', participants_moved
  );
END;
$$;


--
-- Name: move_participant_to_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_participant_to_group(p_enrollment_id uuid, p_target_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  enrollment_record RECORD;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Get enrollment info
  SELECT e.*, i.course_id as current_course_id
  INTO enrollment_record
  FROM group_course_enrollments e
  JOIN group_course_instances i ON i.id = e.instance_id
  WHERE e.id = p_enrollment_id;
  
  IF enrollment_record IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Enrollment not found');
  END IF;
  
  -- Update enrollment with new group, preserve original course
  UPDATE group_course_enrollments
  SET 
    training_group_id = p_target_group_id,
    original_course_id = COALESCE(original_course_id, enrollment_record.current_course_id)
  WHERE id = p_enrollment_id;
  
  RETURN jsonb_build_object('status', 'success');
END;
$$;


--
-- Name: pa_apply_slot(uuid, date, time without time zone, time without time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_apply_slot(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; v_changed boolean; v_persons int; v_price numeric; v_conf text;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id;
  v_changed := a.date IS DISTINCT FROM p_date OR a.time_start IS DISTINCT FROM p_start
            OR a.time_end IS DISTINCT FROM p_end OR a.instructor_id IS DISTINCT FROM p_instr;
  SELECT greatest(count(*),1) INTO v_persons FROM public.private_appointment_participants WHERE appointment_id = p_id;
  v_price := public.pa_price(p_date, p_start, p_end, v_persons);
  v_conf := CASE WHEN v_changed THEN 'pending' ELSE a.instructor_confirmation END;
  UPDATE public.private_appointments
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr, price = v_price,
         instructor_confirmation = v_conf,
         confirmed_at = CASE WHEN v_changed THEN NULL ELSE confirmed_at END,
         confirmed_by = CASE WHEN v_changed THEN NULL ELSE confirmed_by END
   WHERE id = p_id;
  UPDATE public.ticket_items
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr,
         instructor_confirmation = v_conf, unit_price = v_price, quantity = 1,
         instructor_confirmed_at = CASE WHEN v_changed THEN NULL ELSE instructor_confirmed_at END,
         confirmation_reset_at = CASE WHEN v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending' THEN now() ELSE confirmation_reset_at END,
         confirmation_reset_reason = CASE WHEN v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending' THEN 'private_appointment_changed' ELSE confirmation_reset_reason END
   WHERE appointment_id = p_id;
  RETURN jsonb_build_object('changed', v_changed, 'price', v_price,
    'confirmation_reset', v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending');
END $$;


--
-- Name: pa_business_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_business_today() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$ SELECT (now() AT TIME ZONE 'Europe/Zurich')::date $$;


--
-- Name: pa_confirm_appointment(uuid, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_confirm_appointment(p_appointment uuid, p_instructor uuid, p_action text, p_reason text, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; v_state text;
BEGIN
  IF p_action NOT IN ('confirm','decline') OR (p_action = 'decline' AND coalesce(trim(p_reason),'') = '') THEN
    RETURN jsonb_build_object('error','invalid','field','action');
  END IF;
  SELECT * INTO a FROM public.private_appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF a.instructor_id IS DISTINCT FROM p_instructor THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  v_state := CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'declined' END;
  UPDATE public.private_appointments
     SET instructor_confirmation = v_state,
         confirmed_at = CASE WHEN p_action = 'confirm' THEN now() ELSE NULL END,
         confirmed_by = CASE WHEN p_action = 'confirm' THEN p_actor ELSE NULL END
   WHERE id = p_appointment;
  UPDATE public.ticket_items
     SET instructor_confirmation = v_state,
         instructor_confirmed_at = CASE WHEN p_action = 'confirm' THEN now() ELSE NULL END,
         instructor_declined_at = CASE WHEN p_action = 'decline' THEN now() ELSE NULL END,
         instructor_decline_reason = CASE WHEN p_action = 'decline' THEN p_reason ELSE NULL END
   WHERE appointment_id = p_appointment;
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_appointment], v_state, p_actor,
    jsonb_build_object('instructor_id', p_instructor, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment, 'instructor_confirmation', v_state);
END $$;


--
-- Name: pa_create_booking(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_create_booking(p jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid := (p->>'customer_id')::uuid;
  v_product uuid := (p->>'product_id')::uuid;
  v_existing uuid; v_ticket uuid; v_number text; v_group uuid; v_persons int;
  v_appts jsonb := p->'appointments'; v_parts jsonb := p->'participants';
  v_conflicts jsonb := '[]'::jsonb; v_part_ids uuid[] := ARRAY[]::uuid[];
  v_guest_map jsonb := '{}'::jsonb; v_ids uuid[] := ARRAY[]::uuid[];
  e jsonb; e2 jsonb; i int; k int; v_pid uuid; v_aid uuid; v_price numeric; c record;
  d date; s time; t time; ins uuid;
  v_disc numeric; v_reason text := nullif(trim(coalesce(p->>'discount_reason','')),'');
BEGIN
  IF v_key IS NULL OR length(v_key) < 8 THEN RETURN jsonb_build_object('error','invalid','field','submission_key'); END IF;
  IF p ? 'discount_percent' AND jsonb_typeof(p->'discount_percent') <> 'number' THEN
    RETURN jsonb_build_object('error','invalid','field','discount_percent');
  END IF;
  v_disc := coalesce((p->>'discount_percent')::numeric, 0);
  IF v_disc < 0 OR v_disc > 100 THEN RETURN jsonb_build_object('error','invalid','field','discount_percent'); END IF;
  IF v_disc > 0 AND v_reason IS NULL THEN RETURN jsonb_build_object('error','invalid','field','discount_reason'); END IF;
  IF v_disc = 0 THEN v_reason := NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pa_create:' || v_key));
  SELECT ticket_id INTO v_existing FROM public.private_appointment_submissions WHERE submission_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'ticket_id', v_existing,
      'ticket_number', (SELECT ticket_number FROM public.tickets WHERE id = v_existing),
      'appointment_ids', (SELECT to_jsonb(array_agg(id ORDER BY date, time_start)) FROM public.private_appointments WHERE ticket_id = v_existing AND submission_key = v_key),
      'total', (SELECT total_amount FROM public.tickets WHERE id = v_existing));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer) THEN RETURN jsonb_build_object('error','not_found','field','customer_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product AND type = 'private') THEN RETURN jsonb_build_object('error','invalid','field','product_id'); END IF;
  IF jsonb_typeof(v_appts) <> 'array' OR jsonb_array_length(v_appts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END IF;
  IF jsonb_typeof(v_parts) <> 'array' OR jsonb_array_length(v_parts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','participants'); END IF;

  PERFORM public.pa_lock_slots((SELECT coalesce(jsonb_agg(jsonb_build_object('instructor_id', x->>'instructor_id', 'date', x->>'date')), '[]'::jsonb)
                                  FROM jsonb_array_elements(v_appts) x));

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    IF d < public.pa_business_today() OR t <= s OR ins IS NULL THEN
      RETURN jsonb_build_object('error','invalid','field','appointments','index',i);
    END IF;
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, d, s, t, NULL) LOOP
      v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
    FOR k IN 0 .. i - 1 LOOP
      e2 := v_appts->k;
      IF (e2->>'instructor_id')::uuid = ins AND (e2->>'date')::date = d
         AND (e2->>'time_start')::time < t AND (e2->>'time_end')::time > s THEN
        v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind','request','ref_id',NULL);
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conflicts) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conflicts); END IF;

  FOR i IN 0 .. jsonb_array_length(v_parts) - 1 LOOP
    e := v_parts->i;
    IF e ? 'participant_id' THEN
      SELECT id INTO v_pid FROM public.customer_participants WHERE id = (e->>'participant_id')::uuid AND customer_id = v_customer;
      IF v_pid IS NULL THEN RETURN jsonb_build_object('error','invalid','field','participants','index',i); END IF;
    ELSE
      IF coalesce(e->>'guest_key','') = '' OR coalesce(e->>'first_name','') = '' OR (e->>'birth_date') IS NULL THEN
        RETURN jsonb_build_object('error','invalid','field','participants','index',i);
      END IF;
      IF v_guest_map ? (e->>'guest_key') THEN
        v_pid := (v_guest_map->>(e->>'guest_key'))::uuid;
      ELSE
        SELECT id INTO v_pid FROM public.customer_participants
         WHERE customer_id = v_customer AND NOT is_archived AND merged_into_id IS NULL
           AND lower(trim(first_name)) = lower(trim(e->>'first_name'))
           AND lower(trim(coalesce(last_name,''))) = lower(trim(coalesce(e->>'last_name','')))
           AND birth_date = (e->>'birth_date')::date
         ORDER BY created_at LIMIT 1;
        IF v_pid IS NULL THEN
          INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport)
          VALUES (v_customer, trim(e->>'first_name'), nullif(trim(coalesce(e->>'last_name','')),''), (e->>'birth_date')::date, coalesce(e->>'sport','ski'))
          RETURNING id INTO v_pid;
        END IF;
        v_guest_map := v_guest_map || jsonb_build_object(e->>'guest_key', v_pid);
      END IF;
    END IF;
    IF NOT v_pid = ANY(v_part_ids) THEN v_part_ids := v_part_ids || v_pid; END IF;
  END LOOP;
  v_persons := cardinality(v_part_ids);

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, participant_count, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, v_persons, p->>'notes')
  RETURNING id INTO v_ticket;
  INSERT INTO public.private_appointment_submissions (submission_key, ticket_id) VALUES (v_key, v_ticket);
  IF jsonb_array_length(v_appts) > 1 THEN v_group := gen_random_uuid(); END IF;

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    v_price := public.pa_price(d, s, t, v_persons);
    INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
    VALUES (v_ticket, d, s, t, ins, 'booked', 'pending', e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, discount_percent, discount_reason, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, v_disc, v_reason, 'booked', 'pending', 'private', v_persons, v_group, v_aid);
    v_ids := v_ids || v_aid;
  END LOOP;

  PERFORM public.pa_recalc_ticket_total(v_ticket);
  PERFORM public.pa_emit_change(v_ticket, v_ids, 'created', p_actor,
    jsonb_build_object('persons', v_persons, 'discount_percent', v_disc, 'discount_reason', v_reason));
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'appointment_ids', to_jsonb(v_ids), 'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket));
END $$;


--
-- Name: pa_emit_change(uuid, uuid[], text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_emit_change(p_ticket uuid, p_ids uuid[], p_change text, p_actor uuid, p_details jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
  VALUES (p_ticket, p_actor, 'PRIVATE_APPOINTMENT_CHANGED',
          jsonb_build_object('change', p_change, 'appointment_ids', to_jsonb(p_ids)) || coalesce(p_details,'{}'::jsonb));
  INSERT INTO public.notification_queue (notification_type, recipient_type, payload, status)
  VALUES ('private_appointment_changed', 'system',
          jsonb_build_object('ticket_id', p_ticket, 'appointment_ids', to_jsonb(p_ids), 'change', p_change, 'actor', p_actor),
          'pending');
END $$;


--
-- Name: pa_is_protected(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_is_protected(p_appointment_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE a record; reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('protected', false, 'reasons', '[]'::jsonb, 'found', false); END IF;
  IF a.date < public.pa_business_today() THEN reasons := array_append(reasons, 'past'::text); END IF;
  IF a.status = 'completed' THEN reasons := array_append(reasons, 'completed'::text); END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.ticket_id = a.ticket_id
             AND (i.issued_at IS NOT NULL OR coalesce(i.status,'draft') NOT IN ('draft','cancelled','void'))) THEN
    reasons := array_append(reasons, 'invoiced'::text);
  END IF;
  RETURN jsonb_build_object('protected', cardinality(reasons) > 0, 'reasons', to_jsonb(reasons), 'found', true);
END $$;


--
-- Name: pa_lock_slots(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_lock_slots(p_targets jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT (x->>'instructor_id')::uuid AS ins, (x->>'date')::date AS d
      FROM jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) x
     WHERE x->>'instructor_id' IS NOT NULL AND x->>'date' IS NOT NULL
     ORDER BY 1, 2
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('pa_slot:' || r.ins::text || ':' || r.d::text, 0));
  END LOOP;
END $$;


--
-- Name: pa_move_appointment(uuid, date, time without time zone, time without time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_move_appointment(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; j jsonb; v_conf jsonb := '[]'::jsonb; c record; r jsonb;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = a.ticket_id FOR UPDATE;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  j := public.pa_is_protected(p_id);
  IF (j->>'protected')::boolean THEN
    RETURN jsonb_build_object('error','protected','excluded', jsonb_build_array(jsonb_build_object('id',p_id,'reasons',j->'reasons')));
  END IF;
  IF p_date < public.pa_business_today() OR p_end <= p_start OR p_instr IS NULL THEN
    RETURN jsonb_build_object('error','invalid','field','slot');
  END IF;
  PERFORM public.pa_lock_slots(jsonb_build_array(jsonb_build_object('instructor_id', p_instr, 'date', p_date)));
  FOR c IN SELECT * FROM public.pa_slot_conflicts(p_instr, p_date, p_start, p_end, p_id) LOOP
    v_conf := v_conf || jsonb_build_object('date',p_date,'kind',c.kind,'ref_id',c.ref_id);
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  r := public.pa_apply_slot(p_id, p_date, p_start, p_end, p_instr);
  PERFORM public.pa_recalc_ticket_total(a.ticket_id);
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_id], 'moved', p_actor,
    jsonb_build_object('from', jsonb_build_object('date',a.date,'time_start',a.time_start,'time_end',a.time_end,'instructor_id',a.instructor_id),
                       'to', jsonb_build_object('date',p_date,'time_start',p_start,'time_end',p_end,'instructor_id',p_instr)));
  RETURN jsonb_build_object('ok', true, 'price', r->'price', 'confirmation_reset', r->'confirmation_reset',
    'appointment', (SELECT to_jsonb(x) - 'submission_key' FROM public.private_appointments x WHERE id = p_id));
END $$;


--
-- Name: pa_period_update(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_period_update(p_group uuid, p_changes jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; j jsonb; c record; v_ticket uuid;
  v_excluded jsonb := '[]'::jsonb; v_conf jsonb := '[]'::jsonb; v_todo uuid[] := ARRAY[]::uuid[];
  v_targets jsonb := '[]'::jsonb; s time; t time; ins uuid;
BEGIN
  IF p_group IS NULL OR p_changes IS NULL OR NOT (p_changes ?| ARRAY['time_start','time_end','instructor_id']) THEN
    RETURN jsonb_build_object('error','invalid','field','changes');
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY date, time_start, id FOR UPDATE LOOP
    v_ticket := a.ticket_id;
    j := public.pa_is_protected(a.id);
    IF (j->>'protected')::boolean THEN
      v_excluded := v_excluded || jsonb_build_object('id',a.id,'reasons',j->'reasons'); CONTINUE;
    END IF;
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    IF t <= s OR ins IS NULL THEN RETURN jsonb_build_object('error','invalid','field','changes'); END IF;
    v_targets := v_targets || jsonb_build_object('instructor_id', ins, 'date', a.date);
    v_todo := v_todo || a.id;
  END LOOP;
  IF v_ticket IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  PERFORM public.pa_lock_slots(v_targets);
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) ORDER BY date, time_start, id LOOP
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, a.date, s, t, a.id) LOOP
      v_conf := v_conf || jsonb_build_object('appointment_id',a.id,'date',a.date,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) LOOP
    PERFORM public.pa_apply_slot(a.id, a.date,
      coalesce((p_changes->>'time_start')::time, a.time_start),
      coalesce((p_changes->>'time_end')::time, a.time_end),
      coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id));
  END LOOP;
  IF cardinality(v_todo) > 0 THEN
    PERFORM public.pa_recalc_ticket_total(v_ticket);
    PERFORM public.pa_emit_change(v_ticket, v_todo, 'period_updated', p_actor,
      jsonb_build_object('changes', p_changes, 'excluded', v_excluded));
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated_ids', to_jsonb(v_todo), 'excluded', v_excluded);
END $$;


--
-- Name: pa_price(date, time without time zone, time without time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_price(p_date date, p_start time without time zone, p_end time without time zone, p_persons integer) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start_h int; v_end_h int; v_hours int; v_base numeric := 0; v_rate numeric; v_persons int; h int;
BEGIN
  IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL THEN RETURN 0; END IF;
  v_start_h := extract(hour FROM p_start)::int;
  v_end_h := extract(hour FROM p_end)::int;
  v_hours := v_end_h - v_start_h;
  IF v_hours <= 0 THEN RETURN 0; END IF;
  v_persons := least(greatest(coalesce(p_persons, 1), 1), 4);
  FOR h IN v_start_h .. v_end_h - 1 LOOP
    SELECT r.rate_per_hour INTO v_rate
    FROM public.private_lesson_rates r
    WHERE (h * 60) >= (extract(hour FROM r.start_time)::int * 60 + extract(minute FROM r.start_time)::int)
      AND (h * 60) <  (extract(hour FROM r.end_time)::int * 60 + extract(minute FROM r.end_time)::int)
    ORDER BY r.start_time
    LIMIT 1;
    IF FOUND AND v_rate IS NOT NULL THEN v_base := v_base + v_rate; END IF;
  END LOOP;
  RETURN v_base + (v_persons - 1) * v_hours * 20;
END $$;


--
-- Name: pa_recalc_ticket_total(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_recalc_ticket_total(p_ticket uuid) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE v numeric;
BEGIN
  SELECT coalesce(sum(coalesce(line_total, unit_price * coalesce(quantity,1) * (1 - coalesce(discount_percent,0)/100))),0)
    INTO v FROM public.ticket_items WHERE ticket_id = p_ticket AND coalesce(status,'') <> 'cancelled';
  UPDATE public.tickets SET total_amount = v WHERE id = p_ticket;
  RETURN v;
END $$;


--
-- Name: pa_reconcile_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_reconcile_report() RETURNS TABLE(ticket_id uuid, item_total_before numeric, item_total_after numeric, ticket_total numeric, planned_action text, skip_reason text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH items AS (
    SELECT ti.* FROM public.ticket_items ti
    WHERE ti.item_type = 'private' AND ti.appointment_id IS NULL
  ),
  groups AS (
    SELECT i.ticket_id, i.date, i.time_start, i.time_end, i.instructor_id,
           count(*) AS n_rows,
           count(DISTINCT i.participant_id) AS n_participants,
           count(*) FILTER (WHERE i.participant_id IS NULL) AS n_null_participants,
           count(DISTINCT coalesce(i.status,'')) AS n_status,
           count(DISTINCT coalesce(i.instructor_confirmation,'')) AS n_conf
    FROM items i GROUP BY 1,2,3,4,5
  ),
  per_ticket AS (
    SELECT t.id AS ticket_id, t.total_amount, t.status AS ticket_status,
      (SELECT sum(coalesce(i.unit_price,0) * coalesce(i.quantity,1)) FROM items i WHERE i.ticket_id = t.id) AS before_total,
      (SELECT sum(public.pa_price(g.date, g.time_start::time, g.time_end::time, g.n_participants::int)) FROM groups g WHERE g.ticket_id = t.id) AS after_total,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND i.date < public.pa_business_today()) AS is_past,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND coalesce(i.status,'booked') NOT IN ('booked','scheduled','confirmed'))
        OR coalesce(t.status,'') IN ('cancelled','draft') AS not_scheduled,
      EXISTS (SELECT 1 FROM public.invoices v WHERE v.ticket_id = t.id
              AND (v.issued_at IS NOT NULL OR coalesce(v.status,'draft') NOT IN ('draft','cancelled','void'))) AS invoiced,
      EXISTS (SELECT 1 FROM groups g WHERE g.ticket_id = t.id
              AND (g.n_null_participants > 0 OR g.n_participants <> g.n_rows OR g.n_status > 1 OR g.n_conf > 1
                   OR g.instructor_id IS NULL OR g.time_start IS NULL OR g.time_end IS NULL)) AS ambiguous,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND coalesce(i.is_period_override,false))
        OR EXISTS (SELECT 1 FROM public.ticket_item_overrides o JOIN items i ON i.id = o.ticket_item_id WHERE i.ticket_id = t.id) AS has_overrides
    FROM public.tickets t
    WHERE EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id)
  )
  SELECT p.ticket_id, p.before_total, p.after_total, p.total_amount,
         CASE WHEN r.reason IS NULL THEN 'backfill' ELSE 'skip' END,
         r.reason
  FROM per_ticket p
  CROSS JOIN LATERAL (SELECT CASE
      WHEN p.is_past THEN 'past'
      WHEN p.not_scheduled THEN 'not_scheduled'
      WHEN p.invoiced THEN 'invoiced'
      WHEN p.ambiguous THEN 'ambiguous_slot'
      WHEN p.has_overrides THEN 'has_overrides'
      WHEN p.before_total IS DISTINCT FROM p.after_total THEN 'total_mismatch'
      ELSE NULL END AS reason) r
$$;


--
-- Name: pa_slot_conflicts(uuid, date, time without time zone, time without time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_slot_conflicts(p_instructor uuid, p_date date, p_start time without time zone, p_end time without time zone, p_exclude_appointment uuid DEFAULT NULL::uuid) RETURNS TABLE(kind text, ref_id uuid, time_start time without time zone, time_end time without time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: pa_slot_is_free(uuid, date, time without time zone, time without time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_slot_is_free(p_instructor uuid, p_date date, p_start time without time zone, p_end time without time zone, p_exclude_appointment uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.pa_slot_conflicts(p_instructor, p_date, p_start, p_end, p_exclude_appointment)) $$;


--
-- Name: pa_ticket_item_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pa_ticket_item_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE a record;
BEGIN
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.private_appointments WHERE id = NEW.appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pa_guard: appointment % not found', NEW.appointment_id USING ERRCODE = '23503';
  END IF;
  IF NEW.date IS DISTINCT FROM a.date
     OR NEW.time_start::time IS DISTINCT FROM a.time_start
     OR NEW.time_end::time IS DISTINCT FROM a.time_end
     OR NEW.instructor_id IS DISTINCT FROM a.instructor_id
     OR NEW.instructor_confirmation IS DISTINCT FROM a.instructor_confirmation THEN
    RAISE EXCEPTION 'pa_guard: ticket item must mirror its private appointment (date, time, instructor, confirmation)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: prevent_bc_draft_activation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_bc_draft_activation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_active IS TRUE AND EXISTS
      (SELECT 1 FROM public.bc_product_tariff_sources WHERE product_id=NEW.id) THEN
    RAISE EXCEPTION 'Booking-Corner draft cannot be activated before pricing release gate';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: preview_customer_merge(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preview_customer_merge(p_source_id uuid, p_target_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_counts jsonb;
  v_dupes jsonb;
  v_credit numeric;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT jsonb_build_object(
    'participants', (SELECT count(*) FROM public.customer_participants WHERE customer_id = p_source_id AND is_archived = false),
    'tickets', (SELECT count(*) FROM public.tickets WHERE customer_id = p_source_id),
    'invoices', (SELECT count(*) FROM public.invoices WHERE customer_id = p_source_id),
    'customer_credits', (SELECT count(*) FROM public.customer_credits WHERE customer_id = p_source_id),
    'refund_requests', (SELECT count(*) FROM public.refund_requests WHERE customer_id = p_source_id),
    'vouchers', (SELECT count(*) FROM public.vouchers WHERE buyer_customer_id = p_source_id),
    'customer_contacts', (SELECT count(*) FROM public.customer_contacts WHERE customer_id = p_source_id),
    'conversations', (SELECT count(*) FROM public.conversations WHERE customer_id = p_source_id OR matched_customer_id = p_source_id)
  ) INTO v_counts;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'source_participant_id', s.id,
    'source_name', btrim(s.first_name || ' ' || coalesce(s.last_name, '')),
    'target_participant_id', t.id,
    'target_name', btrim(t.first_name || ' ' || coalesce(t.last_name, '')),
    'birth_date', s.birth_date
  )), '[]'::jsonb) INTO v_dupes
  FROM public.customer_participants s
  JOIN public.customer_participants t
    ON t.customer_id = p_target_id
   AND t.is_archived = false
   AND public.yeti_normalize(t.first_name) = public.yeti_normalize(s.first_name)
   AND t.birth_date = s.birth_date
  WHERE s.customer_id = p_source_id AND s.is_archived = false;

  SELECT coalesce(sum(remaining_amount), 0) INTO v_credit
  FROM public.customer_credits
  WHERE customer_id IN (p_source_id, p_target_id) AND coalesce(status, 'active') = 'active';

  RETURN jsonb_build_object(
    'counts', v_counts,
    'duplicate_participants', v_dupes,
    'resulting_credit_balance', v_credit
  );
END;
$$;


--
-- Name: queue_confirmation_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_confirmation_reminders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INT := 0;
  v_record RECORD;
  v_product_name TEXT;
BEGIN
  FOR v_record IN
    SELECT ti.id, ti.instructor_id, ti.product_id, ti.date, ti.time_start, ti.time_end
    FROM public.ticket_items ti
    WHERE ti.instructor_confirmation = 'pending'
      AND ti.instructor_id IS NOT NULL
      AND ti.status NOT IN ('storno', 'cancelled')
      AND ti.date >= CURRENT_DATE
      AND ti.date <= CURRENT_DATE + INTERVAL '1 day'
      -- Avoid duplicate reminders within 20 hours
      AND NOT EXISTS (
        SELECT 1 FROM public.instructor_notification_queue nq
        WHERE nq.ticket_item_id = ti.id
          AND nq.notification_type = 'instructor.confirmation.reminder'
          AND nq.created_at > NOW() - INTERVAL '20 hours'
      )
  LOOP
    SELECT name INTO v_product_name 
    FROM public.products 
    WHERE id = v_record.product_id;

    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      v_record.instructor_id,
      'instructor.confirmation.reminder',
      v_record.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(v_record.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(v_record.time_start::text, '') || ' - ' || COALESCE(v_record.time_end::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: quote_bc_2627_product(uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quote_bc_2627_product(p_product_id uuid, p_items jsonb, p_participants integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_product record;
  v_item jsonb;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_day_count integer;
  v_item_count integer;
  v_expected_duration integer;
  v_rate numeric(10,2);
  v_tier numeric(10,2);
  v_source_count integer;
  v_capacity integer;
  v_series integer;
  v_first_week date;
  v_dates date[] := ARRAY[]::date[];
  v_morning integer;
  v_afternoon integer;
  v_day date;
  v_total numeric(10,2) := 0;
  v_source_ids text[] := ARRAY[]::text[];
  v_source_id text;
BEGIN
  IF p_participants IS NULL OR p_participants < 1 OR p_participants > 5
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid 26/27 quote input' USING ERRCODE='22023';
  END IF;

  SELECT p.id, p.type, p.discipline, p.duration_minutes,
         p.pricing_type, p.season_id, s.start_date, s.end_date
    INTO v_product
    FROM public.products p JOIN public.seasons s ON s.id=p.season_id
   WHERE p.id=p_product_id AND s.name='Winter 26/27'
     AND s.start_date=DATE '2026-12-01' AND s.end_date=DATE '2027-04-15';
  IF NOT FOUND OR v_product.type NOT IN ('private','group','group_toddler')
     OR NOT EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                    WHERE src.product_id=p_product_id AND src.import_status='draft') THEN
    RAISE EXCEPTION 'Product has no validated 26/27 price source' USING ERRCODE='22023';
  END IF;
  IF v_product.type<>'private' THEN
    SELECT min((src.source_payload->>'group_capacity')::integer) INTO v_capacity
      FROM public.bc_product_tariff_sources src
     WHERE src.product_id=p_product_id AND src.import_status='draft';
    IF v_capacity IS NULL OR p_participants>v_capacity THEN
      RAISE EXCEPTION 'Participant count exceeds source group capacity' USING ERRCODE='22023';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR COALESCE(v_item->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
       OR COALESCE(v_item->>'time_start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR COALESCE(v_item->>'time_end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid date or time in quote' USING ERRCODE='22023';
    END IF;
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    IF v_date NOT BETWEEN v_product.start_date AND v_product.end_date OR v_end <= v_start THEN
      RAISE EXCEPTION 'Quote date outside season or invalid time' USING ERRCODE='22023';
    END IF;
    v_duration := EXTRACT(EPOCH FROM (v_end-v_start))::integer / 60;
    v_dates := array_append(v_dates, v_date);
    IF v_product.type='private' THEN
      IF v_start < TIME '09:00' OR v_end > TIME '16:00'
         OR v_duration NOT IN (60,120,180,240,300,360,420) THEN
        RAISE EXCEPTION 'Unsupported private duration or time' USING ERRCODE='22023';
      END IF;
      SELECT count(*), max(price_chf), max(source_id)
        INTO v_source_count, v_rate, v_source_id
        FROM public.bc_product_tariff_sources
       WHERE product_id=p_product_id AND import_status='draft'
         AND day_count=1 AND duration_minutes=v_duration
         AND persons_per_lesson=p_participants;
      IF v_source_count<>1 OR v_rate IS NULL OR v_rate<=0 THEN
        RAISE EXCEPTION 'No unique source private rate for duration/persons' USING ERRCODE='22023';
      END IF;
      v_total := v_total + v_rate;
      v_source_ids := array_append(v_source_ids,v_source_id);
    ELSE
      IF (v_start,v_end) NOT IN ((TIME '10:00',TIME '12:00'),(TIME '14:00',TIME '16:00')) THEN
        RAISE EXCEPTION 'Group slot must be 10-12 or 14-16' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;

  SELECT count(DISTINCT x) INTO v_day_count FROM unnest(v_dates) AS x;
  v_item_count := jsonb_array_length(p_items);
  IF v_product.type='private' THEN
    IF v_item_count<>v_day_count THEN
      RAISE EXCEPTION 'Duplicate private day' USING ERRCODE='22023';
    END IF;
  ELSE
    v_expected_duration := v_product.duration_minutes;
    IF v_expected_duration NOT IN (120,240) OR v_day_count NOT BETWEEN 1 AND 5
       OR v_item_count<>v_day_count * (v_expected_duration/120) THEN
      RAISE EXCEPTION 'Wrong group day count or duration' USING ERRCODE='22023';
    END IF;
    v_first_week := date_trunc('week',v_dates[1])::date;
    FOR v_day IN SELECT DISTINCT x FROM unnest(v_dates) x LOOP
      SELECT count(*) FILTER (WHERE (i->>'time_start')='10:00' AND (i->>'time_end')='12:00'),
             count(*) FILTER (WHERE (i->>'time_start')='14:00' AND (i->>'time_end')='16:00')
        INTO v_morning,v_afternoon
        FROM jsonb_array_elements(p_items) AS i WHERE (i->>'date')::date=v_day;
      IF (v_expected_duration=240 AND (v_morning<>1 OR v_afternoon<>1))
         OR (v_expected_duration=120 AND v_morning+v_afternoon<>1) THEN
        RAISE EXCEPTION 'Missing or duplicate group time block' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.bc_product_tariff_sources s
                WHERE s.product_id=p_product_id AND s.source_family='Samstagkurs') THEN
      -- Both series contain five concrete Saturdays; never mix them.
      v_series := CASE WHEN v_dates[1] BETWEEN DATE '2027-01-09' AND DATE '2027-02-06' THEN 1
                       WHEN v_dates[1] BETWEEN DATE '2027-02-20' AND DATE '2027-03-20' THEN 2
                       ELSE 0 END;
      IF v_series=0 OR EXISTS (
          SELECT 1 FROM unnest(v_dates) d
          WHERE EXTRACT(ISODOW FROM d)<>6 OR (v_series=1 AND d NOT BETWEEN DATE '2027-01-09' AND DATE '2027-02-06')
            OR (v_series=2 AND d NOT BETWEEN DATE '2027-02-20' AND DATE '2027-03-20')
      ) THEN
        RAISE EXCEPTION 'Saturday dates must belong to one of the two series' USING ERRCODE='22023';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM unnest(v_dates) d WHERE EXTRACT(ISODOW FROM d)>5 OR date_trunc('week',d)::date<>v_first_week) THEN
      RAISE EXCEPTION 'Weekday group dates must be in one Mon-Fri week' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(cumulative_price) INTO v_source_count,v_tier
      FROM public.product_price_tiers
     WHERE product_id=p_product_id AND day_count=v_day_count;
    IF v_source_count<>1 OR v_tier IS NULL OR v_tier<=0 THEN
      RAISE EXCEPTION 'Missing exact day tier; no fallback/extrapolation' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(source_id) INTO v_source_count,v_source_id
      FROM public.bc_product_tariff_sources
     WHERE product_id=p_product_id AND import_status='draft'
       AND day_count=v_day_count AND duration_minutes=v_expected_duration
       AND persons_per_lesson=1 AND price_chf=v_tier;
    IF v_source_count<>1 THEN
      RAISE EXCEPTION 'Price tier does not match unique Booking source tariff' USING ERRCODE='22023';
    END IF;
    v_source_ids := ARRAY[v_source_id];
    v_total := v_tier * p_participants;
  END IF;
  IF v_total<=0 THEN RAISE EXCEPTION 'Zero price is not a booking quote' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('total_amount',v_total,'currency','CHF','participant_count',p_participants,
    'product_id',p_product_id,'day_count',v_day_count,'source_tariff_ids',v_source_ids,
    'quote_version','bc-2627-exact-v1');
END;
$_$;


--
-- Name: respond_to_participant_transfer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_participant_transfer(p_request_id uuid, p_response text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_responding_instructor_id UUID;
  v_request RECORD;
  v_target_course RECORD;
  v_enrollment_id UUID;
BEGIN
  -- Validate response value
  IF p_response NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid response. Must be "accepted" or "rejected"';
  END IF;

  -- Get the instructor ID of the currently authenticated user
  v_responding_instructor_id := public.get_instructor_for_user(auth.uid());

  -- Authorization Check: Ensure the user is an instructor
  IF v_responding_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Fetch the request details
  SELECT * INTO v_request
  FROM public.participant_transfer_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'This request has already been processed';
  END IF;

  -- Authorization Check: Ensure the responder is the leader of the target group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_course_instances
    WHERE id = v_request.target_group_id
      AND instructor_id = v_responding_instructor_id
  ) THEN
    RAISE EXCEPTION 'You are not the leader of the target group';
  END IF;

  -- Update the request status
  UPDATE public.participant_transfer_requests
  SET status = p_response
  WHERE id = p_request_id;

  -- If the request is accepted, perform the transfer logic
  IF p_response = 'accepted' THEN
    -- 1. Find the participant's enrollment in the source group instance
    SELECT e.id INTO v_enrollment_id
    FROM public.group_course_enrollments e
    WHERE e.instance_id = v_request.source_group_id
      AND e.participant_id = v_request.participant_id
    LIMIT 1;

    IF v_enrollment_id IS NULL THEN
      RAISE EXCEPTION 'Could not find the enrollment for the participant in the source group';
    END IF;

    -- 2. Update the enrollment to point to the new group instance
    -- Store original course for tracking if not already set
    UPDATE public.group_course_enrollments
    SET 
      instance_id = v_request.target_group_id,
      original_course_id = COALESCE(original_course_id, (
        SELECT course_id FROM public.group_course_instances WHERE id = v_request.source_group_id
      ))
    WHERE id = v_enrollment_id;

    -- 3. Get the target course details (for skill level update)
    SELECT gc.id, gc.skill_level_id, gc.discipline
    INTO v_target_course
    FROM public.group_course_instances gci
    JOIN public.group_courses gc ON gc.id = gci.course_id
    WHERE gci.id = v_request.target_group_id;

    -- 4. Update the participant's skill level based on discipline
    IF v_target_course.skill_level_id IS NOT NULL THEN
      IF v_target_course.discipline = 'ski' THEN
        UPDATE public.customer_participants
        SET current_ski_level_id = v_target_course.skill_level_id
        WHERE id = v_request.participant_id;
      ELSIF v_target_course.discipline = 'snowboard' THEN
        UPDATE public.customer_participants
        SET current_snowboard_level_id = v_target_course.skill_level_id
        WHERE id = v_request.participant_id;
      END IF;
    END IF;

    -- 5. Update participant counts on both instances
    UPDATE public.group_course_instances
    SET current_participants = GREATEST(0, COALESCE(current_participants, 0) - 1)
    WHERE id = v_request.source_group_id;

    UPDATE public.group_course_instances
    SET current_participants = COALESCE(current_participants, 0) + 1
    WHERE id = v_request.target_group_id;
  END IF;

  RETURN jsonb_build_object('status', 'success', 'new_status', p_response);
END;
$$;


--
-- Name: rollback_entity_merge(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rollback_entity_merge(p_merge_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_m public.entity_merges%ROWTYPE;
  v_key text;
  v_tbl text;
  v_col text;
  v_ids uuid[];
  v_before jsonb;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT * INTO v_m FROM public.entity_merges WHERE id = p_merge_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Zusammenführung nicht gefunden'; END IF;
  IF v_m.rolled_back_at IS NOT NULL THEN RAISE EXCEPTION 'Diese Zusammenführung wurde bereits zurückgenommen'; END IF;
  IF v_m.rollback_until IS NULL OR now() > v_m.rollback_until THEN
    RAISE EXCEPTION 'Die Rücknahmefrist von 24 Stunden ist abgelaufen';
  END IF;

  v_before := v_m.field_resolution->'target_before';

  IF v_m.entity_type = 'customer' THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = v_m.target_id AND (is_archived OR merged_into_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Der bleibende Kunde wurde inzwischen selbst zusammengeführt – Rücknahme nicht möglich';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tickets WHERE customer_id = v_m.target_id
               AND created_at > v_m.performed_at
               AND NOT (id::text IN (SELECT jsonb_array_elements_text(coalesce(v_m.relationship_summary->'tickets.customer_id', '[]'::jsonb))))) THEN
      RAISE EXCEPTION 'Seit der Zusammenführung wurden neue Buchungen erfasst – Rücknahme blockiert';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.customer_participants WHERE id = v_m.target_id AND (is_archived OR merged_into_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Der bleibende Teilnehmer wurde inzwischen selbst zusammengeführt – Rücknahme nicht möglich';
    END IF;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_m.relationship_summary)
  LOOP
    v_tbl := split_part(v_key, '.', 1);
    v_col := split_part(v_key, '.', 2);
    SELECT array_agg(x::uuid) INTO v_ids
    FROM jsonb_array_elements_text(v_m.relationship_summary->v_key) x;
    IF v_ids IS NULL THEN CONTINUE; END IF;

    CASE v_key
      WHEN 'customer_participants.customer_id' THEN UPDATE public.customer_participants SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'tickets.customer_id' THEN UPDATE public.tickets SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'invoices.customer_id' THEN UPDATE public.invoices SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'customer_credits.customer_id' THEN UPDATE public.customer_credits SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'refund_requests.customer_id' THEN UPDATE public.refund_requests SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'vouchers.buyer_customer_id' THEN UPDATE public.vouchers SET buyer_customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'customer_contacts.customer_id' THEN UPDATE public.customer_contacts SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'conversations.customer_id' THEN UPDATE public.conversations SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'conversations.matched_customer_id' THEN UPDATE public.conversations SET matched_customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'ticket_items.participant_id' THEN UPDATE public.ticket_items SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'participant_level_history.participant_id' THEN UPDATE public.participant_level_history SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'participant_transfer_requests.participant_id' THEN UPDATE public.participant_transfer_requests SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'group_course_enrollments.participant_id' THEN UPDATE public.group_course_enrollments SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'event_participants.participant_id' THEN UPDATE public.event_participants SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      ELSE RAISE EXCEPTION 'Unbekannte Beziehung %, Rücknahme abgebrochen', v_key;
    END CASE;
  END LOOP;

  IF v_m.entity_type = 'customer' THEN
    UPDATE public.customers SET
      first_name = v_before->>'first_name',
      last_name = v_before->>'last_name',
      email = v_before->>'email',
      billing_email = v_before->>'billing_email',
      phone = v_before->>'phone',
      additional_phones = v_before->'additional_phones',
      additional_emails = v_before->'additional_emails',
      street = v_before->>'street',
      zip = v_before->>'zip',
      city = v_before->>'city',
      country = v_before->>'country',
      holiday_address = coalesce(v_before->>'holiday_address', holiday_address),
      language = v_before->>'language',
      preferred_channel = v_before->>'preferred_channel',
      customer_type = v_before->>'customer_type',
      organization_name = v_before->>'organization_name',
      notes = v_before->>'notes',
      marketing_consent = (v_before->>'marketing_consent')::boolean
    WHERE id = v_m.target_id;

    UPDATE public.customers SET
      is_archived = false, merged_into_id = NULL, merged_at = NULL, merged_by = NULL,
      email = coalesce(v_m.field_resolution->>'source_email_before', email)
    WHERE id = v_m.source_id;
  ELSE
    UPDATE public.customer_participants SET
      first_name = v_before->>'first_name',
      last_name = v_before->>'last_name',
      birth_date = (v_before->>'birth_date')::date,
      sport = v_before->>'sport',
      level_last_season = v_before->>'level_last_season',
      level_current_season = v_before->>'level_current_season',
      current_ski_level_id = v_before->>'current_ski_level_id',
      current_snowboard_level_id = v_before->>'current_snowboard_level_id',
      self_assessed_ski_level = v_before->>'self_assessed_ski_level',
      self_assessed_snowboard_level = v_before->>'self_assessed_snowboard_level',
      notes = v_before->>'notes'
    WHERE id = v_m.target_id;

    UPDATE public.customer_participants SET
      is_archived = false, merged_into_id = NULL, merged_at = NULL, merged_by = NULL
    WHERE id = v_m.source_id;
  END IF;

  UPDATE public.entity_merges SET rolled_back_at = now(), rolled_back_by = auth.uid() WHERE id = p_merge_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: search_customers(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_customers(p_query text, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, customer_number text, first_name text, last_name text, organization_name text, customer_type text, email text, phone text, city text, country text, participant_names text[], match_reason text, match_rank integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_norm text := public.yeti_normalize(p_query);
  v_tokens text[];
  v_digits text := public.yeti_digits(p_query);
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RETURN;
  END IF;
  v_tokens := string_to_array(v_norm, ' ');

  RETURN QUERY
  WITH base AS (
    SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
           c.customer_type, c.email, c.phone, c.city, c.country,
           public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name || ' ' ||
             coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '') || ' ' ||
             coalesce(c.organization_name, '') || ' ' || coalesce(c.email, '') || ' ' ||
             coalesce(c.billing_email, '') || ' ' || coalesce(c.customer_number, '')) AS hay,
           public.yeti_digits(coalesce(c.phone, '')) || ' ' ||
             public.yeti_digits(coalesce(c.additional_phones::text, '')) AS phone_hay,
           lower(coalesce(c.customer_number, '')) AS cnum,
           lower(coalesce(c.email, '')) AS cmail
    FROM public.customers c
    WHERE c.is_archived = false
  ),
  parts AS (
    SELECT p.customer_id,
           array_agg(btrim(p.first_name || ' ' || coalesce(p.last_name, '')) ORDER BY p.first_name) AS names,
           array_agg(public.yeti_normalize(p.first_name || ' ' || coalesce(p.last_name, ''))) AS norm_names
    FROM public.customer_participants p
    WHERE p.is_archived = false
    GROUP BY p.customer_id
  ),
  candidates AS (
    SELECT b.*, pa.names, pa.norm_names,
      (SELECT bool_and(b.hay LIKE '%' || tk || '%') FROM unnest(v_tokens) tk) AS all_in_customer,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE (SELECT bool_and((b.hay || ' ' || pn) LIKE '%' || tk || '%') FROM unnest(v_tokens) tk)
      ) AS all_with_participant,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE pn = v_norm
      ) AS participant_exact,
      (length(v_digits) >= 5 AND b.phone_hay LIKE '%' || v_digits || '%') AS phone_hit
    FROM base b
    LEFT JOIN parts pa ON pa.customer_id = b.id
  )
  SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
         c.customer_type, c.email, c.phone, c.city, c.country,
         coalesce(c.names, ARRAY[]::text[]) AS participant_names,
         CASE
           WHEN c.cnum = v_norm THEN 'Kundennummer ' || c.customer_number
           WHEN c.cmail = v_norm THEN 'E-Mail-Treffer'
           WHEN c.phone_hit THEN 'Telefonnummer-Treffer'
           WHEN c.participant_exact THEN 'Gefunden über Teilnehmer/in ' ||
             (SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE public.yeti_normalize(n) = v_norm LIMIT 1)
           WHEN c.all_in_customer THEN 'Namenstreffer'
           WHEN c.all_with_participant THEN 'Gefunden über Teilnehmer/in ' ||
             coalesce((SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE (SELECT bool_and((c.hay || ' ' || public.yeti_normalize(n)) LIKE '%' || tk || '%')
                     FROM unnest(v_tokens) tk) LIMIT 1), '')
           ELSE 'Treffer'
         END AS match_reason,
         CASE
           WHEN c.cnum = v_norm THEN 1
           WHEN c.cmail = v_norm OR c.phone_hit THEN 2
           WHEN c.all_in_customer AND public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name) = v_norm THEN 3
           WHEN c.all_in_customer AND public.yeti_normalize(c.last_name || ' ' || coalesce(c.first_name, '')) = v_norm THEN 3
           WHEN c.participant_exact THEN 4
           WHEN c.hay LIKE v_norm || '%' THEN 5
           ELSE 6
         END::integer AS match_rank
  FROM candidates c
  WHERE c.all_in_customer OR c.all_with_participant OR c.phone_hit
  ORDER BY match_rank, c.last_name, c.first_name
  LIMIT greatest(1, coalesce(p_limit, 20));
END;
$$;


--
-- Name: set_instructor_capabilities(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_instructor_capabilities(p_instructor_id uuid, p_capability_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_capability_id UUID;
BEGIN
  -- 1. Authorization Check
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: You must be admin or office staff to set instructor capabilities.';
  END IF;

  -- 2. Delete Existing Capabilities
  DELETE FROM public.instructor_capabilities
  WHERE instructor_id = p_instructor_id;

  -- 3. Insert New Capabilities (if any provided)
  IF p_capability_ids IS NOT NULL AND array_length(p_capability_ids, 1) > 0 THEN
    FOREACH v_capability_id IN ARRAY p_capability_ids LOOP
      INSERT INTO public.instructor_capabilities (instructor_id, capability_id)
      VALUES (p_instructor_id, v_capability_id);
    END LOOP;
  END IF;
END;
$$;


--
-- Name: split_training_group(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.split_training_group(p_source_group_id uuid, p_new_groups jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  source_group RECORD;
  new_group JSONB;
  new_group_id UUID;
  participant_id UUID;
  groups_created INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO source_group FROM training_groups WHERE id = p_source_group_id;
  
  IF source_group IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Source group not found');
  END IF;
  
  FOR new_group IN SELECT * FROM jsonb_array_elements(p_new_groups)
  LOOP
    INSERT INTO training_groups (
      course_id,
      week_start,
      group_number,
      custom_name,
      instructor_id,
      status
    )
    VALUES (
      source_group.course_id,
      source_group.week_start,
      (new_group->>'group_number')::INTEGER,
      new_group->>'custom_name',
      (new_group->>'instructor_id')::UUID,
      'active'
    )
    ON CONFLICT (course_id, week_start, group_number) 
    DO UPDATE SET
      custom_name = EXCLUDED.custom_name,
      instructor_id = EXCLUDED.instructor_id,
      updated_at = NOW()
    RETURNING id INTO new_group_id;
    
    groups_created := groups_created + 1;
    
    FOR participant_id IN SELECT jsonb_array_elements_text(new_group->'participant_ids')::UUID
    LOOP
      UPDATE group_course_enrollments
      SET training_group_id = new_group_id
      WHERE id = participant_id;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'groups_created', groups_created
  );
END;
$$;


--
-- Name: update_credit_remaining(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_credit_remaining() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE customer_credits
  SET 
    remaining_amount = remaining_amount - NEW.amount_used,
    status = CASE 
      WHEN remaining_amount - NEW.amount_used <= 0 THEN 'fully_used'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = NEW.credit_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_period_metadata_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_period_metadata_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_private_appointment(uuid, date, time without time zone, time without time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_private_appointment(p_appointment_id uuid, p_date date, p_time_start time without time zone, p_time_end time without time zone, p_instructor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE v_old public.private_appointments; v_count int;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_time_start >= p_time_end THEN RAISE EXCEPTION 'invalid_time_range'; END IF;
  IF p_date < current_date THEN RAISE EXCEPTION 'past_date'; END IF;
  SELECT * INTO v_old FROM public.private_appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.private_appointments
     SET date = p_date, time_start = p_time_start, time_end = p_time_end, instructor_id = p_instructor_id,
         instructor_confirmation = CASE WHEN p_instructor_id IS DISTINCT FROM v_old.instructor_id
           THEN (CASE WHEN p_instructor_id IS NULL THEN NULL ELSE 'pending' END) ELSE instructor_confirmation END
   WHERE id = p_appointment_id;
  UPDATE public.ticket_items
     SET date = p_date, time_start = p_time_start, time_end = p_time_end, instructor_id = p_instructor_id,
         instructor_confirmation = CASE WHEN p_instructor_id IS DISTINCT FROM v_old.instructor_id
           THEN (CASE WHEN p_instructor_id IS NULL THEN NULL ELSE 'pending' END) ELSE instructor_confirmation END,
         is_period_override = true
   WHERE appointment_id = p_appointment_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'items_updated', v_count);
END $$;


--
-- Name: update_shop_article_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shop_article_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_voucher_status_on_redemption(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_voucher_status_on_redemption() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.vouchers
  SET remaining_balance = NEW.balance_after,
      status = CASE 
        WHEN NEW.balance_after = 0 THEN 'redeemed'
        WHEN NEW.balance_after < original_value THEN 'partial'
        ELSE status
      END,
      updated_at = now()
  WHERE id = NEW.voucher_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: validate_group_course_ages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_group_course_ages() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.min_age <= 0 THEN
    RAISE EXCEPTION 'min_age must be greater than 0';
  END IF;
  IF NEW.max_age < NEW.min_age THEN
    RAISE EXCEPTION 'max_age must be greater than or equal to min_age';
  END IF;
  IF NEW.max_age > 99 THEN
    RAISE EXCEPTION 'max_age must not exceed 99';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_ticket_item_times(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_ticket_item_times() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Validate operational hours (09:00 - 16:00)
  IF NEW.time_start IS NOT NULL AND NEW.time_start < '09:00'::time THEN
    RAISE EXCEPTION 'Booking start time must be 09:00 or later (lift opening)';
  END IF;
  
  IF NEW.time_end IS NOT NULL AND NEW.time_end > '16:00'::time THEN
    RAISE EXCEPTION 'Booking end time must be 16:00 or earlier (lift closing)';
  END IF;
  
  IF NEW.time_start IS NOT NULL AND NEW.time_end IS NOT NULL AND NEW.time_end <= NEW.time_start THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: yeti_digits(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.yeti_digits(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g')
$$;


--
-- Name: yeti_normalize(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.yeti_normalize(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT regexp_replace(
    btrim(lower(translate(replace(coalesce(t, ''), 'ß', 'ss'),
      'äöüáàâãåéèêëíìîïóòôõúùûñçÄÖÜÁÀÂÃÅÉÈÊËÍÌÎÏÓÒÔÕÚÙÛÑÇ',
      'aouaaaaaeeeeiiiioooouuuncAOUAAAAAEEEEIIIIOOOOUUUNC'))),
    '\s+', ' ', 'g')
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_type text NOT NULL,
    title text NOT NULL,
    description text,
    related_ticket_id uuid,
    related_ticket_item_id uuid,
    due_date date,
    priority text DEFAULT 'normal'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    created_by uuid
);


--
-- Name: ai_configuration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_configuration (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    file_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_size integer,
    created_by uuid
);


--
-- Name: bc_2627_course_period_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bc_2627_course_period_sources (
    source_key text NOT NULL,
    course_id uuid NOT NULL,
    training_group_id uuid NOT NULL,
    source_sha256 text NOT NULL,
    tariff_source_ids text[] NOT NULL,
    teaching_dates date[] NOT NULL,
    eligible_variants jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bc_2627_course_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bc_2627_course_product_variants (
    course_id uuid NOT NULL,
    product_id uuid NOT NULL,
    eligible_day_counts integer[] NOT NULL
);


--
-- Name: bc_product_tariff_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bc_product_tariff_sources (
    source_id text NOT NULL,
    season_id uuid NOT NULL,
    product_id uuid,
    source_sha256 text NOT NULL,
    source_family text NOT NULL,
    import_status text NOT NULL,
    day_count integer NOT NULL,
    duration_minutes integer NOT NULL,
    persons_per_lesson integer NOT NULL,
    price_chf numeric(10,2) NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bc_product_tariff_sources_check CHECK ((((import_status = 'draft'::text) AND (product_id IS NOT NULL)) OR ((import_status = 'deferred_care'::text) AND (product_id IS NULL)))),
    CONSTRAINT bc_product_tariff_sources_day_count_check CHECK (((day_count >= 1) AND (day_count <= 7))),
    CONSTRAINT bc_product_tariff_sources_duration_minutes_check CHECK (((duration_minutes >= 60) AND (duration_minutes <= 420))),
    CONSTRAINT bc_product_tariff_sources_import_status_check CHECK ((import_status = ANY (ARRAY['draft'::text, 'deferred_care'::text]))),
    CONSTRAINT bc_product_tariff_sources_persons_per_lesson_check CHECK (((persons_per_lesson >= 1) AND (persons_per_lesson <= 5))),
    CONSTRAINT bc_product_tariff_sources_price_chf_check CHECK ((price_chf >= (0)::numeric))
);


--
-- Name: billing_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    partner_type text DEFAULT 'hotel'::text NOT NULL,
    billing_email text,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    street text,
    house_number text,
    zip text,
    city text,
    country character(2),
    address_review_required boolean DEFAULT false NOT NULL,
    CONSTRAINT billing_partners_country_chk CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text)))
);


--
-- Name: booking_cancellations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_cancellations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    cancellation_type text NOT NULL,
    cancelled_item_ids uuid[],
    cancelled_at timestamp with time zone DEFAULT now(),
    cancelled_by uuid,
    hours_before_start numeric(5,1),
    cancellation_reason text NOT NULL,
    original_booking_amount numeric(10,2) NOT NULL,
    cancelled_amount numeric(10,2) NOT NULL,
    amount_already_paid numeric(10,2) DEFAULT 0 NOT NULL,
    fee_according_to_agb numeric(10,2) NOT NULL,
    fee_charged numeric(10,2) DEFAULT 0 NOT NULL,
    waiver_reason text,
    credit_amount numeric(10,2) DEFAULT 0 NOT NULL,
    credit_action text,
    customer_credit_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT booking_cancellations_cancellation_type_check CHECK ((cancellation_type = ANY (ARRAY['full'::text, 'partial'::text]))),
    CONSTRAINT booking_cancellations_credit_action_check CHECK ((credit_action = ANY (ARRAY['customer_credit'::text, 'refund_iban'::text, 'refund_terminal'::text, 'none'::text])))
);


--
-- Name: booking_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    agb_accepted boolean NOT NULL,
    agb_version text NOT NULL,
    privacy_accepted boolean NOT NULL,
    privacy_version text NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    source text NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_email_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_email_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    kind text NOT NULL,
    idempotency_key text NOT NULL,
    recipient_email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error text,
    template_id uuid,
    email_log_id uuid,
    provider_message_id text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_email_deliveries_kind_check CHECK ((kind = 'booking_confirmation'::text)),
    CONSTRAINT booking_email_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: booking_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    type text NOT NULL,
    product_id uuid,
    requested_date date NOT NULL,
    requested_time_slot text,
    duration_hours numeric,
    sport_type text NOT NULL,
    participant_count integer DEFAULT 1 NOT NULL,
    participants_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    customer_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    voucher_code text,
    voucher_discount numeric,
    estimated_price numeric,
    notes text,
    source text DEFAULT 'website'::text NOT NULL,
    magic_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    converted_ticket_id uuid,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    submission_key text,
    acknowledgement_sent_at timestamp with time zone,
    CONSTRAINT booking_requests_requested_time_slot_check CHECK ((requested_time_slot = ANY (ARRAY['morning'::text, 'afternoon'::text, 'flexible'::text]))),
    CONSTRAINT booking_requests_source_check CHECK ((source = ANY (ARRAY['website'::text, 'widget'::text, 'manual'::text]))),
    CONSTRAINT booking_requests_sport_type_check CHECK ((sport_type = ANY (ARRAY['ski'::text, 'snowboard'::text]))),
    CONSTRAINT booking_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT booking_requests_type_check CHECK ((type = ANY (ARRAY['private'::text, 'group'::text])))
);

ALTER TABLE ONLY public.booking_requests REPLICA IDENTITY FULL;


--
-- Name: cancellation_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cancellation_policy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    free_cancellation_hours integer DEFAULT 24,
    late_cancellation_percent integer DEFAULT 50,
    no_show_percent integer DEFAULT 100,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: closure_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.closure_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid,
    date date NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    contact_identifier text NOT NULL,
    contact_name text,
    customer_id uuid,
    subject text,
    content text NOT NULL,
    status text DEFAULT 'unread'::text,
    assigned_to uuid,
    ai_extracted_data jsonb,
    ai_confidence_score numeric,
    processed_at timestamp with time zone,
    related_ticket_id uuid,
    notes text,
    classification text DEFAULT 'other'::text,
    detected_language text DEFAULT 'de'::text,
    matched_customer_id uuid,
    booking_ready boolean DEFAULT false,
    data_completeness numeric DEFAULT 0,
    external_message_id text
);


--
-- Name: TABLE conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversations IS 'Unified inbox for all incoming messages';


--
-- Name: COLUMN conversations.channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.channel IS 'Message channel: whatsapp, email, phone, walkin';


--
-- Name: COLUMN conversations.ai_extracted_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.ai_extracted_data IS 'AI-parsed booking suggestion as JSON';


--
-- Name: COLUMN conversations.ai_confidence_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.ai_confidence_score IS 'AI parsing confidence score (0-1)';


--
-- Name: customer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    name text NOT NULL,
    role text,
    phone text NOT NULL,
    email text,
    is_primary boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_credit_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_id uuid NOT NULL,
    ticket_id uuid,
    amount_used numeric(10,2) NOT NULL,
    used_at timestamp with time zone DEFAULT now(),
    used_by uuid
);


--
-- Name: customer_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    original_amount numeric(10,2) NOT NULL,
    remaining_amount numeric(10,2) NOT NULL,
    source_type text NOT NULL,
    source_reference_id uuid,
    description text NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT customer_credits_source_type_check CHECK ((source_type = ANY (ARRAY['cancellation'::text, 'goodwill'::text, 'overpayment'::text, 'other'::text]))),
    CONSTRAINT customer_credits_status_check CHECK ((status = ANY (ARRAY['active'::text, 'fully_used'::text, 'refunded'::text])))
);


--
-- Name: customer_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text,
    birth_date date,
    level_last_season text,
    sport text DEFAULT 'ski'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    level_current_season text,
    current_ski_level_id text,
    current_snowboard_level_id text,
    self_assessed_ski_level text,
    self_assessed_snowboard_level text,
    current_ski_training_id uuid,
    current_snowboard_training_id uuid,
    merged_into_id uuid,
    merged_at timestamp with time zone,
    merged_by uuid,
    is_archived boolean DEFAULT false NOT NULL,
    CONSTRAINT customer_participants_self_assessed_ski_level_check CHECK ((self_assessed_ski_level = ANY (ARRAY['green'::text, 'blue'::text, 'red'::text, 'black'::text]))),
    CONSTRAINT customer_participants_self_assessed_snowboard_level_check CHECK ((self_assessed_snowboard_level = ANY (ARRAY['green'::text, 'blue'::text, 'red'::text, 'black'::text])))
);


--
-- Name: TABLE customer_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_participants IS 'Actual course participants (usually children) linked to customers';


--
-- Name: COLUMN customer_participants.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_participants.birth_date IS 'NULL = birth date unknown (e.g. Booking-Corner import without DOB).';


--
-- Name: COLUMN customer_participants.level_last_season; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_participants.level_last_season IS 'Skill level: e.g. Blue Prince, Blue King, Red Prince';


--
-- Name: COLUMN customer_participants.sport; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_participants.sport IS 'Sport type: ski or snowboard';


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    phone text,
    first_name text,
    last_name text NOT NULL,
    street text,
    zip text,
    city text,
    country text DEFAULT 'LI'::text,
    language text DEFAULT 'de'::text,
    preferred_channel text DEFAULT 'email'::text,
    kulanz_score integer DEFAULT 0,
    notes text,
    marketing_consent boolean DEFAULT false,
    holiday_address text DEFAULT ''::text NOT NULL,
    additional_phones jsonb DEFAULT '[]'::jsonb,
    additional_emails jsonb DEFAULT '[]'::jsonb,
    customer_type text DEFAULT 'private'::text,
    organization_name text,
    billing_email text,
    customer_number text,
    merged_into_id uuid,
    merged_at timestamp with time zone,
    merged_by uuid,
    is_archived boolean DEFAULT false NOT NULL,
    house_number text
);


--
-- Name: TABLE customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customers IS 'Contract partners and invoice recipients (usually parents)';


--
-- Name: COLUMN customers.preferred_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.preferred_channel IS 'Preferred contact channel: email, whatsapp, or phone';


--
-- Name: COLUMN customers.kulanz_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.kulanz_score IS 'Goodwill score from -10 to +10';


--
-- Name: daily_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    total_revenue numeric DEFAULT 0 NOT NULL,
    total_bookings integer DEFAULT 0 NOT NULL,
    total_instructors integer DEFAULT 0 NOT NULL,
    total_hours numeric DEFAULT 0 NOT NULL,
    cash_expected numeric DEFAULT 0 NOT NULL,
    cash_actual numeric,
    card_expected numeric DEFAULT 0 NOT NULL,
    card_actual numeric,
    twint_expected numeric DEFAULT 0 NOT NULL,
    twint_actual numeric,
    difference numeric DEFAULT 0 NOT NULL,
    difference_reason text,
    difference_acknowledged boolean DEFAULT false NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    closed_by_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_reconciliations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'no_revenue'::text])))
);


--
-- Name: daily_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_task_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    completed_date date NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    due_time time without time zone,
    recurrence text NOT NULL,
    weekdays integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    linked_action text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT daily_task_templates_recurrence_check CHECK ((recurrence = ANY (ARRAY['daily'::text, 'weekdays'::text, 'weekly'::text])))
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_message_id text,
    error_message text,
    opened_at timestamp with time zone,
    open_count integer DEFAULT 0,
    clicked_at timestamp with time zone,
    click_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    delivery_id uuid
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    trigger text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text,
    variables jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: entity_merges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_merges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    field_resolution jsonb DEFAULT '{}'::jsonb NOT NULL,
    relationship_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    rollback_until timestamp with time zone,
    rolled_back_by uuid,
    rolled_back_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_merges_entity_type_check CHECK ((entity_type = ANY (ARRAY['customer'::text, 'participant'::text])))
);


--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    category_type text NOT NULL,
    training_id uuid,
    discipline text,
    age_group text,
    start_time time without time zone,
    sort_order integer DEFAULT 0,
    start_number_from integer,
    start_number_to integer,
    color text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_categories_age_group_check CHECK ((age_group = ANY (ARRAY['child'::text, 'adult'::text]))),
    CONSTRAINT event_categories_category_type_check CHECK ((category_type = ANY (ARRAY['course'::text, 'guest'::text]))),
    CONSTRAINT event_categories_discipline_check CHECK ((discipline = ANY (ARRAY['ski'::text, 'snowboard'::text])))
);


--
-- Name: event_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    category_id uuid NOT NULL,
    participant_id uuid,
    ticket_item_id uuid,
    guest_first_name text,
    guest_last_name text,
    guest_birth_year integer,
    guest_phone text,
    guest_email text,
    source text NOT NULL,
    days_attended integer DEFAULT 0,
    confirmed_by_instructor uuid,
    opted_out boolean DEFAULT false,
    opt_out_reason text,
    start_number integer,
    fee_amount numeric(10,2),
    payment_status text DEFAULT 'not_applicable'::text,
    finish_time_ms integer,
    rank_in_category integer,
    is_disqualified boolean DEFAULT false,
    disqualification_reason text,
    checked_in boolean DEFAULT false,
    checked_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_participants_payment_status_check CHECK ((payment_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'paid'::text, 'waived'::text]))),
    CONSTRAINT event_participants_source_check CHECK ((source = ANY (ARRAY['group_course'::text, 'private_course'::text, 'walkin'::text])))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Gästeskirennen'::text NOT NULL,
    event_date date NOT NULL,
    event_type text DEFAULT 'race'::text,
    status text DEFAULT 'draft'::text,
    course_race_time time without time zone DEFAULT '10:00:00'::time without time zone,
    guest_race_time time without time zone DEFAULT '11:30:00'::time without time zone,
    result_ceremony_time time without time zone DEFAULT '15:30:00'::time without time zone,
    instructor_deadline timestamp with time zone,
    guest_fee numeric(10,2) DEFAULT 20.00,
    total_numbers integer DEFAULT 100,
    reserve_per_group integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT events_event_type_check CHECK ((event_type = ANY (ARRAY['race'::text, 'ceremony'::text, 'other'::text]))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'registration_open'::text, 'registration_closed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: group_course_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_course_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    ticket_item_id uuid,
    participant_id uuid,
    attendance_status text DEFAULT 'registered'::text,
    checked_in_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    training_group_id uuid,
    original_course_id uuid
);


--
-- Name: group_course_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_course_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    schedule_id uuid,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    instructor_id uuid,
    assistant_instructor_id uuid,
    status text DEFAULT 'scheduled'::text,
    current_participants integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: group_course_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_course_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_course_schedules_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: group_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    discipline text DEFAULT 'ski'::text NOT NULL,
    min_age integer NOT NULL,
    max_age integer NOT NULL,
    max_participants integer DEFAULT 8 NOT NULL,
    price_per_day numeric(10,2) NOT NULL,
    price_full_week numeric(10,2),
    meeting_point text,
    color text DEFAULT '#3B82F6'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    product_id uuid,
    course_type text DEFAULT 'weekly'::text,
    period_start_date date,
    period_end_date date,
    skill_level_id text,
    next_training_id uuid,
    sort_order integer DEFAULT 0,
    is_internal boolean DEFAULT false,
    min_participants integer DEFAULT 4,
    CONSTRAINT group_courses_course_type_check CHECK ((course_type = ANY (ARRAY['weekly'::text, 'saturday_course'::text, 'custom'::text, 'office'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    level text NOT NULL,
    sport text DEFAULT 'ski'::text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    time_morning_start time without time zone DEFAULT '10:00:00'::time without time zone,
    time_morning_end time without time zone DEFAULT '12:00:00'::time without time zone,
    time_afternoon_start time without time zone DEFAULT '14:00:00'::time without time zone,
    time_afternoon_end time without time zone DEFAULT '16:00:00'::time without time zone,
    meeting_point text DEFAULT 'Hotel Gorfion'::text,
    instructor_id uuid,
    max_participants integer DEFAULT 12,
    min_participants integer DEFAULT 5,
    status text DEFAULT 'planned'::text,
    notes text
);

ALTER TABLE ONLY public.groups REPLICA IDENTITY FULL;


--
-- Name: TABLE groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.groups IS 'Group courses bundling multiple participants with one instructor';


--
-- Name: COLUMN groups.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.groups.level IS 'Skill level: Snow Kids Village, Blue Prince, Blue King, etc.';


--
-- Name: COLUMN groups.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.groups.status IS 'Group status: planned, confirmed, in_progress, completed, cancelled';


--
-- Name: high_season_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.high_season_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instructor_absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    type text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    status text DEFAULT 'confirmed'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    requested_by uuid,
    time_start time without time zone,
    time_end time without time zone,
    is_full_day boolean DEFAULT true,
    CONSTRAINT absence_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text]))),
    CONSTRAINT instructor_absences_type_check CHECK ((type = ANY (ARRAY['vacation'::text, 'sick'::text, 'other'::text])))
);

ALTER TABLE ONLY public.instructor_absences REPLICA IDENTITY FULL;


--
-- Name: COLUMN instructor_absences.time_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructor_absences.time_start IS 'Start time for partial-day absences (e.g., 12:00)';


--
-- Name: COLUMN instructor_absences.time_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructor_absences.time_end IS 'End time for partial-day absences (e.g., 14:00)';


--
-- Name: COLUMN instructor_absences.is_full_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructor_absences.is_full_day IS 'When true, blocks entire day. When false, uses time_start and time_end.';


--
-- Name: instructor_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    instructor_id uuid NOT NULL,
    ticket_item_id uuid NOT NULL,
    activity_type text NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    created_by_user_id uuid,
    CONSTRAINT activity_type_check CHECK ((activity_type = ANY (ARRAY['booking_assigned'::text, 'booking_confirmed'::text, 'booking_declined'::text, 'booking_changed'::text, 'booking_cancelled'::text, 'reminder_sent'::text])))
);


--
-- Name: TABLE instructor_activity_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.instructor_activity_log IS 'Audit trail for all instructor-related booking activities';


--
-- Name: COLUMN instructor_activity_log.activity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructor_activity_log.activity_type IS 'Type: booking_assigned, booking_confirmed, booking_declined, booking_changed, booking_cancelled, reminder_sent';


--
-- Name: COLUMN instructor_activity_log.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructor_activity_log.metadata IS 'Additional JSON data like old/new values for changes';


--
-- Name: instructor_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    capability_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructor_deployment_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_deployment_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_until date NOT NULL,
    source text NOT NULL,
    import_run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instructor_deployment_windows_check CHECK ((valid_until >= valid_from)),
    CONSTRAINT instructor_deployment_windows_source_check CHECK ((source = ANY (ARRAY['booking_corner'::text, 'manual'::text])))
);


--
-- Name: instructor_hr_private; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_hr_private (
    instructor_id uuid NOT NULL,
    wage_raw text,
    bank_raw text,
    ahv_raw text,
    unresolved jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_import_run_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assignments jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_provenance jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: instructor_import_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_import_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    staging_id uuid NOT NULL,
    source_id text NOT NULL,
    instructor_id uuid NOT NULL,
    kind text NOT NULL,
    instructor_row jsonb,
    hr_private_present boolean,
    hr_private_row jsonb,
    source_link_present boolean,
    source_link_row jsonb,
    window_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    photo_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    row_sha256 text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instructor_import_ledger_check CHECK (((kind = 'updated'::text) = (instructor_row IS NOT NULL))),
    CONSTRAINT instructor_import_ledger_check1 CHECK (((kind = 'created'::text) OR ((hr_private_present IS NOT NULL) AND (source_link_present IS NOT NULL)))),
    CONSTRAINT instructor_import_ledger_kind_check CHECK ((kind = ANY (ARRAY['updated'::text, 'created'::text])))
);


--
-- Name: instructor_import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_import_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_system text NOT NULL,
    rollout text NOT NULL,
    status text DEFAULT 'preview'::text NOT NULL,
    xlsx_sha256 text NOT NULL,
    zip_sha256 text,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_at timestamp with time zone,
    apply_started_by uuid,
    apply_started_at timestamp with time zone,
    CONSTRAINT instructor_import_runs_status_check CHECK ((status = ANY (ARRAY['preview'::text, 'applying'::text, 'applied'::text, 'failed'::text, 'discarded'::text])))
);


--
-- Name: instructor_import_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_import_staging (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    source_id text NOT NULL,
    classification text NOT NULL,
    confidence text NOT NULL,
    target_instructor_id uuid,
    source_checksum text NOT NULL,
    normalized jsonb NOT NULL,
    private_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    windows jsonb DEFAULT '[]'::jsonb NOT NULL,
    photo jsonb,
    diff jsonb DEFAULT '[]'::jsonb NOT NULL,
    reasons text[] DEFAULT '{}'::text[] NOT NULL,
    decision text,
    batch_status text DEFAULT 'pending'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assignments jsonb DEFAULT '[]'::jsonb NOT NULL,
    apply_payload jsonb,
    review_snapshot jsonb,
    photo_status text DEFAULT 'none'::text NOT NULL,
    applied_instructor_id uuid,
    applied_at timestamp with time zone,
    CONSTRAINT instructor_import_staging_batch_status_check CHECK ((batch_status = ANY (ARRAY['pending'::text, 'applied'::text, 'skipped'::text, 'conflict'::text, 'failed'::text]))),
    CONSTRAINT instructor_import_staging_classification_check CHECK ((classification = ANY (ARRAY['create'::text, 'update'::text, 'no_op'::text, 'candidate'::text, 'review'::text]))),
    CONSTRAINT instructor_import_staging_decision_check CHECK ((decision = ANY (ARRAY['create'::text, 'link'::text, 'skip'::text]))),
    CONSTRAINT instructor_import_staging_photo_status_check CHECK ((photo_status = ANY (ARRAY['none'::text, 'pending'::text, 'applied'::text, 'kept_manual'::text, 'failed'::text])))
);


--
-- Name: instructor_live_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_live_status (
    instructor_id uuid NOT NULL,
    real_time_status text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.instructor_live_status REPLICA IDENTITY FULL;


--
-- Name: instructor_notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    instructor_id uuid NOT NULL,
    notification_type text NOT NULL,
    template_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    processed_at timestamp with time zone,
    error_message text,
    ticket_item_id uuid,
    group_instance_id uuid
);


--
-- Name: instructor_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    storage_path text NOT NULL,
    origin text NOT NULL,
    source_sha256 text,
    width integer,
    height integer,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instructor_photos_origin_check CHECK ((origin = ANY (ARRAY['booking_import'::text, 'manual_upload'::text]))),
    CONSTRAINT instructor_photos_storage_path_check CHECK (((storage_path !~ '\.\.'::text) AND (storage_path !~ '^/'::text)))
);


--
-- Name: instructor_recurring_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_recurring_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    weekdays integer[] NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    reason text,
    preset_type text,
    status text DEFAULT 'pending'::text,
    requested_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT instructor_recurring_blocks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: instructor_source_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_source_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_system text NOT NULL,
    rollout text NOT NULL,
    source_id text NOT NULL,
    instructor_id uuid NOT NULL,
    source_checksum text NOT NULL,
    last_import_run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructor_test_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_test_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    instructor_id uuid NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instructor_user_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_user_links (
    user_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    created_by uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instructor_user_links_source_check CHECK ((source = ANY (ARRAY['email_backfill'::text, 'invite'::text, 'link'::text, 'manual'::text])))
);


--
-- Name: instructors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    phone text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    birth_date date,
    level text,
    specialization text DEFAULT 'ski'::text,
    status text DEFAULT 'active'::text,
    real_time_status text DEFAULT 'unavailable'::text,
    hourly_rate numeric,
    bank_name text,
    iban text,
    ahv_number text,
    notes text,
    gender text,
    street text,
    city text,
    zip text,
    country text DEFAULT 'LI'::text,
    languages text[] DEFAULT ARRAY['de'::text],
    role text DEFAULT 'instructor'::text,
    entry_date date DEFAULT CURRENT_DATE,
    instructor_type public.instructor_role_type DEFAULT 'teacher'::public.instructor_role_type NOT NULL,
    roles text[] DEFAULT '{}'::text[],
    avatar_url text,
    show_on_website boolean DEFAULT false NOT NULL,
    website_teaser text DEFAULT 'Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.'::text NOT NULL,
    website_role_title text,
    CONSTRAINT check_staff_role CHECK ((role = ANY (ARRAY['instructor'::text, 'office_staff'::text, 'management'::text, 'hilfslehrer'::text]))),
    CONSTRAINT instructors_website_role_title_format CHECK (((website_role_title IS NULL) OR (((char_length(website_role_title) >= 1) AND (char_length(website_role_title) <= 80)) AND (website_role_title = btrim(website_role_title)) AND (website_role_title !~ '[[:cntrl:]]'::text)))),
    CONSTRAINT instructors_website_teaser_len CHECK ((char_length(website_teaser) <= 280))
);


--
-- Name: TABLE instructors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.instructors IS 'Ski instructors with real-time availability status';


--
-- Name: COLUMN instructors.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructors.level IS 'Training level: e.g. Kids Instructor, Swiss Snowsports';


--
-- Name: COLUMN instructors.specialization; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructors.specialization IS 'Sport specialization: ski, snowboard, or both';


--
-- Name: COLUMN instructors.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructors.status IS 'Employment status: active, inactive, or on_hold';


--
-- Name: COLUMN instructors.real_time_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructors.real_time_status IS 'Traffic light status: available, on_call, or unavailable';


--
-- Name: COLUMN instructors.ahv_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.instructors.ahv_number IS 'Swiss social security number';


--
-- Name: inventory_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name text NOT NULL,
    inventory_number text,
    size text,
    color text,
    condition public.inventory_condition DEFAULT 'Neu'::public.inventory_condition NOT NULL,
    status public.inventory_item_status DEFAULT 'Verfügbar'::public.inventory_item_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_rental_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_rental_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rental_id uuid NOT NULL,
    item_id uuid NOT NULL,
    status public.rental_item_status DEFAULT 'Ausgeliehen'::public.rental_item_status NOT NULL,
    returned_at timestamp with time zone,
    return_condition public.return_condition,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_rentals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_rentals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    office_user_id uuid NOT NULL,
    rental_period_start date NOT NULL,
    rental_period_end date,
    status public.rental_status DEFAULT 'Wartet auf Quittierung'::public.rental_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    ticket_id uuid,
    customer_id uuid,
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0,
    total numeric(10,2) NOT NULL,
    currency text DEFAULT 'CHF'::text,
    qr_reference text NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'draft'::text,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    payment_profile_id uuid,
    payment_presentation_type text,
    payment_snapshot jsonb,
    payment_reference_type text,
    payment_reference text,
    payment_payload_version text,
    payment_routing_reason text,
    payment_profile_overridden boolean DEFAULT false NOT NULL,
    payment_profile_override_reason text,
    payment_override_by uuid,
    issued_at timestamp with time zone,
    is_legacy_payment boolean DEFAULT false NOT NULL,
    CONSTRAINT invoices_payment_presentation_chk CHECK (((payment_presentation_type IS NULL) OR (payment_presentation_type = ANY (ARRAY['swiss_qr'::text, 'sepa_transfer'::text, 'international_transfer'::text])))),
    CONSTRAINT invoices_payment_reference_type_chk CHECK (((payment_reference_type IS NULL) OR (payment_reference_type = ANY (ARRAY['QRR'::text, 'SCOR'::text, 'NON'::text, 'INVOICE_NUMBER'::text]))))
);


--
-- Name: master_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    total_participants integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    preferences jsonb DEFAULT '{}'::jsonb,
    email_frequency text DEFAULT 'immediate'::text,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notification_type text NOT NULL,
    recipient_type text NOT NULL,
    recipient_id uuid,
    recipient_email text,
    recipient_phone text,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error_message text,
    CONSTRAINT notification_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    action_url text,
    reference_type text,
    reference_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: office_hour_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_hour_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    date date NOT NULL,
    time_start time without time zone NOT NULL,
    time_end time without time zone NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: office_shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_shift_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: participant_level_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participant_level_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    skill_level_id text NOT NULL,
    discipline text NOT NULL,
    season text NOT NULL,
    assessed_at date DEFAULT CURRENT_DATE,
    assessed_by uuid,
    source text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT participant_level_history_discipline_check CHECK ((discipline = ANY (ARRAY['ski'::text, 'snowboard'::text]))),
    CONSTRAINT participant_level_history_source_check CHECK ((source = ANY (ARRAY['booking'::text, 'assessment'::text, 'manual'::text, 'migration'::text])))
);


--
-- Name: participant_transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participant_transfer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_group_id uuid NOT NULL,
    target_group_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    requesting_instructor_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    presentation_type text NOT NULL,
    bank_name text,
    account_holder text NOT NULL,
    iban text NOT NULL,
    bic_swift text,
    account_holder_street text,
    account_holder_house_number text,
    account_holder_zip text NOT NULL,
    account_holder_city text NOT NULL,
    account_holder_country character(2) NOT NULL,
    currency character(3) NOT NULL,
    reference_type text NOT NULL,
    country_scope text NOT NULL,
    account_type text DEFAULT 'iban'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_until date,
    validation_status text DEFAULT 'draft'::text NOT NULL,
    validation_notes text,
    validated_at timestamp with time zone,
    validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT payment_profiles_account_type_chk CHECK ((account_type = ANY (ARRAY['iban'::text, 'qr_iban'::text]))),
    CONSTRAINT payment_profiles_active_requires_valid CHECK (((is_active = false) OR (validation_status = 'valid'::text))),
    CONSTRAINT payment_profiles_archived_not_active CHECK (((is_archived = false) OR ((is_active = false) AND (is_default = false)))),
    CONSTRAINT payment_profiles_country_chk CHECK ((account_holder_country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT payment_profiles_currency_chk CHECK ((currency = ANY (ARRAY['CHF'::bpchar, 'EUR'::bpchar]))),
    CONSTRAINT payment_profiles_presentation_chk CHECK ((presentation_type = ANY (ARRAY['swiss_qr'::text, 'sepa_transfer'::text, 'international_transfer'::text]))),
    CONSTRAINT payment_profiles_qrr_chk CHECK ((((reference_type = 'QRR'::text) AND (account_type = 'qr_iban'::text) AND (presentation_type = 'swiss_qr'::text) AND ((currency = 'CHF'::bpchar) OR ((currency = 'EUR'::bpchar) AND (country_scope = 'CH_LI'::text) AND (valid_until IS NOT NULL) AND (valid_until <= '2027-10-31'::date)))) OR ((reference_type <> 'QRR'::text) AND (account_type = 'iban'::text)))),
    CONSTRAINT payment_profiles_reference_chk CHECK ((reference_type = ANY (ARRAY['QRR'::text, 'SCOR'::text, 'NON'::text, 'INVOICE_NUMBER'::text]))),
    CONSTRAINT payment_profiles_scope_chk CHECK ((country_scope = ANY (ARRAY['CH_LI'::text, 'SEPA'::text, 'INTERNATIONAL'::text]))),
    CONSTRAINT payment_profiles_swissqr_scope_chk CHECK (((presentation_type <> 'swiss_qr'::text) OR (country_scope = 'CH_LI'::text))),
    CONSTRAINT payment_profiles_validation_chk CHECK ((validation_status = ANY (ARRAY['draft'::text, 'valid'::text, 'invalid'::text]))),
    CONSTRAINT payment_profiles_validity_chk CHECK (((valid_from IS NULL) OR (valid_until IS NULL) OR (valid_until >= valid_from)))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_method text NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference text,
    status text DEFAULT 'completed'::text NOT NULL
);


--
-- Name: ticket_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_id uuid NOT NULL,
    product_id uuid NOT NULL,
    participant_id uuid,
    instructor_id uuid,
    date date NOT NULL,
    time_start time without time zone,
    time_end time without time zone,
    meeting_point text,
    unit_price numeric NOT NULL,
    quantity integer DEFAULT 1,
    discount_percent numeric DEFAULT 0,
    discount_reason text,
    line_total numeric GENERATED ALWAYS AS (((unit_price * (quantity)::numeric) * ((1)::numeric - (COALESCE(discount_percent, (0)::numeric) / (100)::numeric)))) STORED,
    status text DEFAULT 'booked'::text,
    instructor_confirmation text DEFAULT 'pending'::text,
    instructor_confirmed_at timestamp with time zone,
    actual_duration_minutes integer,
    instructor_notes text,
    internal_notes text,
    item_type text DEFAULT 'participant'::text,
    group_name text,
    group_participant_count integer,
    custom_start_time time without time zone,
    custom_end_time time without time zone,
    skill_level text,
    is_vegetarian boolean DEFAULT false,
    instructor_decline_reason text,
    instructor_declined_at timestamp with time zone,
    period_group_id uuid,
    is_period_override boolean DEFAULT false,
    confirmation_reset_at timestamp with time zone,
    confirmation_reset_reason text,
    end_date date,
    appointment_id uuid
);

ALTER TABLE ONLY public.ticket_items REPLICA IDENTITY FULL;


--
-- Name: TABLE ticket_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ticket_items IS 'Individual booking line items with own status for tracking';


--
-- Name: COLUMN ticket_items.meeting_point; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.meeting_point IS 'Meeting point: Hotel Gorfion, Malbipark, Kasse Sesselbahn Täli';


--
-- Name: COLUMN ticket_items.line_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.line_total IS 'Computed: unit_price * quantity * (1 - discount_percent/100)';


--
-- Name: COLUMN ticket_items.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.status IS 'Item status: booked, rebooked, cancelled, completed';


--
-- Name: COLUMN ticket_items.instructor_confirmation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.instructor_confirmation IS 'Instructor confirmation: pending, confirmed, declined';


--
-- Name: COLUMN ticket_items.actual_duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.actual_duration_minutes IS 'Actual duration if different from planned';


--
-- Name: COLUMN ticket_items.instructor_decline_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.instructor_decline_reason IS 'Reason provided by instructor when declining a booking';


--
-- Name: COLUMN ticket_items.instructor_declined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_items.instructor_declined_at IS 'Timestamp when instructor declined the booking';


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_number text NOT NULL,
    customer_id uuid,
    status text DEFAULT 'draft'::text,
    total_amount numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    payment_method text,
    payment_due_date date,
    notes text,
    internal_notes text,
    created_by uuid,
    ticket_type text DEFAULT 'standard'::text,
    camp_start_date date,
    camp_end_date date,
    total_participants integer,
    skip_documents boolean DEFAULT false,
    notes_for_instructors text,
    master_booking_id uuid,
    is_initiator boolean DEFAULT false NOT NULL,
    share_participant_count integer,
    season_id uuid,
    source text DEFAULT 'office'::text NOT NULL,
    reservation_expires_at timestamp with time zone,
    reservation_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
    participant_count integer,
    finalized_at timestamp with time zone,
    billing_partner_id uuid
);

ALTER TABLE ONLY public.tickets REPLICA IDENTITY FULL;


--
-- Name: TABLE tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tickets IS 'Booking header - one ticket per customer booking';


--
-- Name: COLUMN tickets.ticket_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.ticket_number IS 'Unique ticket number format: YETY-2025-00001';


--
-- Name: COLUMN tickets.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.status IS 'Status values: draft, pending_confirmation, confirmed, in_progress, completed, cancelled';


--
-- Name: COLUMN tickets.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.payment_method IS 'Payment method: cash, card, twint, invoice, voucher';


--
-- Name: COLUMN tickets.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.created_by IS 'User ID who created the ticket (audit trail)';


--
-- Name: COLUMN tickets.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.source IS 'Origin of the booking: office (manual), website (online form), vapi (phone AI), inbox (email conversion)';


--
-- Name: pending_booking_confirmations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pending_booking_confirmations AS
 SELECT t.id AS ticket_id,
    t.ticket_number,
    t.status,
    t.created_at,
    t.total_amount,
    c.id AS customer_id,
    (COALESCE((c.first_name || ' '::text), ''::text) || c.last_name) AS customer_name,
    c.email AS customer_email,
    conv.id AS conversation_id,
    conv.channel AS source_channel,
    ( SELECT (count(*))::integer AS count
           FROM public.ticket_items ti
          WHERE (ti.ticket_id = t.id)) AS item_count
   FROM ((public.tickets t
     JOIN public.customers c ON ((c.id = t.customer_id)))
     LEFT JOIN public.conversations conv ON ((conv.related_ticket_id = t.id)))
  WHERE (t.status = 'pending_confirmation'::text)
  ORDER BY t.created_at DESC;


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    min_quantity integer,
    min_days integer,
    promo_code text,
    partner_name text,
    applies_to_products uuid[],
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    valid_from date,
    valid_until date,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pricing_rules_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text, 'override'::text]))),
    CONSTRAINT pricing_rules_type_check CHECK ((type = ANY (ARRAY['volume'::text, 'duration'::text, 'promo'::text, 'partner'::text])))
);


--
-- Name: private_appointment_backfill_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_appointment_backfill_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    ticket_item_id uuid,
    old_unit_price numeric,
    old_appointment_id uuid,
    old_ticket_total numeric,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: private_appointment_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_appointment_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    attendance text,
    attendance_by uuid,
    attendance_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT private_appointment_participants_attendance_check CHECK (((attendance IS NULL) OR (attendance = ANY (ARRAY['present'::text, 'absent'::text]))))
);


--
-- Name: private_appointment_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_appointment_submissions (
    submission_key text NOT NULL,
    ticket_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT private_appointment_submissions_submission_key_check CHECK (((length(submission_key) >= 8) AND (length(submission_key) <= 100)))
);


--
-- Name: private_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    date date NOT NULL,
    time_start time without time zone NOT NULL,
    time_end time without time zone NOT NULL,
    instructor_id uuid,
    status text DEFAULT 'booked'::text NOT NULL,
    instructor_confirmation text,
    meeting_point text,
    period_group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price numeric(10,2),
    confirmed_at timestamp with time zone,
    confirmed_by uuid,
    submission_key text,
    CONSTRAINT private_appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'booked'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: private_lesson_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_lesson_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    rate_per_hour numeric(10,2) NOT NULL,
    is_peak boolean DEFAULT false,
    additional_person_rate numeric(10,2) DEFAULT 20.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_price_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_price_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    day_count integer NOT NULL,
    cumulative_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_price_tiers_cumulative_price_check CHECK ((cumulative_price >= (0)::numeric)),
    CONSTRAINT product_price_tiers_day_count_check CHECK (((day_count >= 1) AND (day_count <= 7)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    duration_minutes integer,
    price numeric NOT NULL,
    currency text DEFAULT 'CHF'::text,
    vat_rate numeric DEFAULT 7.7,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    is_training_product boolean DEFAULT false,
    pricing_type text DEFAULT 'fixed'::text,
    min_age integer,
    max_age integer,
    season_id uuid NOT NULL,
    discipline text,
    audience text,
    reporting_category text,
    show_on_website boolean DEFAULT false NOT NULL,
    CONSTRAINT products_audience_check CHECK (((audience IS NULL) OR (audience = ANY (ARRAY['kids'::text, 'adults'::text, 'mixed'::text])))),
    CONSTRAINT products_discipline_check CHECK (((discipline IS NULL) OR (discipline = ANY (ARRAY['ski'::text, 'snowboard'::text, 'other'::text])))),
    CONSTRAINT products_reporting_category_check CHECK (((reporting_category IS NULL) OR (reporting_category = ANY (ARRAY['private'::text, 'group'::text, 'other'::text]))))
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Product catalog for all bookable items';


--
-- Name: COLUMN products.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.type IS 'Product type: private, group, addon, or merchandise';


--
-- Name: COLUMN products.vat_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.vat_rate IS 'VAT rate in percentage (default 7.7% for Switzerland)';


--
-- Name: refund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    credit_id uuid NOT NULL,
    cancellation_id uuid,
    amount numeric(10,2) NOT NULL,
    refund_method text NOT NULL,
    iban text,
    account_holder text,
    status text DEFAULT 'pending'::text,
    processed_at timestamp with time zone,
    processed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT refund_requests_refund_method_check CHECK ((refund_method = ANY (ARRAY['iban'::text, 'terminal'::text]))),
    CONSTRAINT refund_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: school_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Skischule'::text NOT NULL,
    slogan text,
    logo_url text,
    street text,
    zip text,
    city text,
    country text DEFAULT 'LI'::text,
    phone text,
    email text,
    website text,
    bank_name text,
    iban text,
    bic text,
    account_holder text,
    vat_number text,
    office_hours jsonb DEFAULT '{"sunday": null, "saturday": {"end": "12:00", "start": "08:00"}, "weekdays": {"end": "17:00", "start": "08:00"}}'::jsonb,
    lesson_times jsonb DEFAULT '{"morning": {"end": "12:00", "start": "10:00"}, "afternoon": {"end": "16:00", "start": "14:00"}}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    school_tariff jsonb DEFAULT '{"currency": "CHF", "description": "Reduzierter Stundensatz für Schulen und Skilager", "hourly_rate": 95.00, "min_hours_per_group": 1.5}'::jsonb,
    house_number text
);


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_current boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: shop_article_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_article_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    price numeric,
    stock_quantity integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shop_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    description text,
    category text DEFAULT 'Sonstiges'::text NOT NULL,
    price numeric NOT NULL,
    cost_price numeric,
    stock_quantity integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 5 NOT NULL,
    image_url text,
    status text DEFAULT 'active'::text NOT NULL,
    has_variants boolean DEFAULT false NOT NULL,
    is_popular boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_articles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'sold_out'::text])))
);


--
-- Name: shop_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    variant_id uuid,
    type text NOT NULL,
    quantity integer NOT NULL,
    reason text,
    reference_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_stock_movements_type_check CHECK ((type = ANY (ARRAY['sale'::text, 'purchase'::text, 'adjustment'::text, 'return'::text])))
);


--
-- Name: shop_transaction_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_transaction_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    article_id uuid NOT NULL,
    variant_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric NOT NULL,
    total_price numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shop_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_number text NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_percent numeric,
    discount_reason text,
    total numeric DEFAULT 0 NOT NULL,
    payment_method text NOT NULL,
    linked_ticket_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_transactions_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'twint'::text, 'invoice'::text])))
);


--
-- Name: skill_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_levels (
    id text NOT NULL,
    name text NOT NULL,
    discipline text NOT NULL,
    target_group text NOT NULL,
    color text,
    sort_order integer NOT NULL,
    description text,
    short_description text,
    next_level_id text,
    min_age integer,
    max_age integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skill_levels_color_check CHECK ((color = ANY (ARRAY['green'::text, 'blue'::text, 'red'::text, 'black'::text]))),
    CONSTRAINT skill_levels_discipline_check CHECK ((discipline = ANY (ARRAY['ski'::text, 'snowboard'::text]))),
    CONSTRAINT skill_levels_target_group_check CHECK ((target_group = ANY (ARRAY['child'::text, 'adult'::text])))
);


--
-- Name: ticket_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    ticket_item_id uuid,
    comment_type text NOT NULL,
    content text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['internal'::text, 'instructor'::text])))
);


--
-- Name: ticket_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    event_type text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb
);


--
-- Name: ticket_item_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_item_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_item_id uuid NOT NULL,
    override_date date NOT NULL,
    instructor_id uuid,
    start_time time without time zone,
    end_time time without time zone,
    price_adjustment numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_item_period_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_item_period_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_group_id uuid NOT NULL,
    base_instructor_id uuid,
    base_time_start time without time zone NOT NULL,
    base_time_end time without time zone NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ticket_number_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_number_counters (
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_number_counters_last_number_nonnegative CHECK ((last_number >= 0))
);


--
-- Name: training_course_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_course_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    training_id uuid NOT NULL,
    date date NOT NULL,
    is_cancelled boolean DEFAULT false,
    instructor_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: training_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    week_start date NOT NULL,
    group_number integer DEFAULT 1,
    custom_name text,
    instructor_id uuid,
    assistant_instructor_id uuid,
    status text DEFAULT 'active'::text,
    merged_into_group_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT training_groups_status_check CHECK ((status = ANY (ARRAY['active'::text, 'merged'::text, 'cancelled'::text])))
);


--
-- Name: training_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    training_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    status text DEFAULT 'invited'::text,
    confirmed_at timestamp with time zone,
    attended_at timestamp with time zone,
    notes text
);


--
-- Name: TABLE training_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.training_participants IS 'Tracks instructor participation in trainings';


--
-- Name: COLUMN training_participants.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.training_participants.status IS 'Participation status: invited, confirmed, declined, attended, no_show';


--
-- Name: trainings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    description text,
    date date NOT NULL,
    time_start time without time zone NOT NULL,
    time_end time without time zone NOT NULL,
    location text,
    lead_instructor_id uuid,
    max_participants integer,
    is_mandatory boolean DEFAULT false,
    status text DEFAULT 'planned'::text,
    notes text,
    training_type text DEFAULT 'group'::text,
    is_internal boolean DEFAULT false,
    CONSTRAINT trainings_training_type_check CHECK ((training_type = ANY (ARRAY['group'::text, 'camp'::text, 'office'::text])))
);


--
-- Name: TABLE trainings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainings IS 'Internal instructor training events';


--
-- Name: COLUMN trainings.lead_instructor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trainings.lead_instructor_id IS 'Responsible trainer for this training';


--
-- Name: COLUMN trainings.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trainings.status IS 'Training status: planned, confirmed, completed, cancelled';


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: voucher_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_id uuid NOT NULL,
    ticket_id uuid,
    amount numeric NOT NULL,
    balance_after numeric NOT NULL,
    reason text,
    redeemed_by uuid,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voucher_redemptions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT voucher_redemptions_balance_after_check CHECK ((balance_after >= (0)::numeric))
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    original_value numeric NOT NULL,
    remaining_balance numeric NOT NULL,
    expiry_date date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    buyer_customer_id uuid,
    buyer_name text,
    buyer_email text,
    buyer_phone text,
    recipient_name text,
    recipient_message text,
    payment_method text,
    is_paid boolean DEFAULT true,
    internal_note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vouchers_original_value_check CHECK (((original_value >= (10)::numeric) AND (original_value <= (500)::numeric))),
    CONSTRAINT vouchers_payment_method_check CHECK ((payment_method = ANY (ARRAY['bar'::text, 'karte'::text, 'twint'::text, 'rechnung'::text]))),
    CONSTRAINT vouchers_remaining_balance_check CHECK ((remaining_balance >= (0)::numeric)),
    CONSTRAINT vouchers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'partial'::text, 'redeemed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: whatsapp_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_type text NOT NULL,
    phone_number text NOT NULL,
    message_type text NOT NULL,
    template_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    whatsapp_message_id text,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    CONSTRAINT recipient_type_check CHECK ((recipient_type = ANY (ARRAY['instructor'::text, 'customer'::text]))),
    CONSTRAINT status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);


--
-- Name: TABLE whatsapp_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.whatsapp_notifications IS 'Log of all outgoing WhatsApp messages for debugging and tracking';


--
-- Name: COLUMN whatsapp_notifications.recipient_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_notifications.recipient_type IS 'Type of recipient: instructor or customer';


--
-- Name: COLUMN whatsapp_notifications.message_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_notifications.message_type IS 'Type of message: booking_assigned, booking_changed, reminder, etc.';


--
-- Name: COLUMN whatsapp_notifications.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_notifications.status IS 'Delivery status: pending, sent, delivered, read, failed';


--
-- Name: action_tasks action_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_tasks
    ADD CONSTRAINT action_tasks_pkey PRIMARY KEY (id);


--
-- Name: ai_configuration ai_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configuration
    ADD CONSTRAINT ai_configuration_pkey PRIMARY KEY (key);


--
-- Name: ai_knowledge_documents ai_knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: bc_2627_course_period_sources bc_2627_course_period_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_period_sources
    ADD CONSTRAINT bc_2627_course_period_sources_pkey PRIMARY KEY (source_key);


--
-- Name: bc_2627_course_product_variants bc_2627_course_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_product_variants
    ADD CONSTRAINT bc_2627_course_product_variants_pkey PRIMARY KEY (course_id, product_id);


--
-- Name: bc_product_tariff_sources bc_product_tariff_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_product_tariff_sources
    ADD CONSTRAINT bc_product_tariff_sources_pkey PRIMARY KEY (source_id);


--
-- Name: billing_partners billing_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_partners
    ADD CONSTRAINT billing_partners_pkey PRIMARY KEY (id);


--
-- Name: booking_cancellations booking_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cancellations
    ADD CONSTRAINT booking_cancellations_pkey PRIMARY KEY (id);


--
-- Name: booking_consents booking_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_consents
    ADD CONSTRAINT booking_consents_pkey PRIMARY KEY (id);


--
-- Name: booking_email_deliveries booking_email_deliveries_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_email_deliveries
    ADD CONSTRAINT booking_email_deliveries_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: booking_email_deliveries booking_email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_email_deliveries
    ADD CONSTRAINT booking_email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: booking_email_deliveries booking_email_deliveries_ticket_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_email_deliveries
    ADD CONSTRAINT booking_email_deliveries_ticket_id_kind_key UNIQUE (ticket_id, kind);


--
-- Name: booking_requests booking_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_pkey PRIMARY KEY (id);


--
-- Name: booking_requests booking_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_request_number_key UNIQUE (request_number);


--
-- Name: cancellation_policy cancellation_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cancellation_policy
    ADD CONSTRAINT cancellation_policy_pkey PRIMARY KEY (id);


--
-- Name: capabilities capabilities_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_name_key UNIQUE (name);


--
-- Name: capabilities capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);


--
-- Name: closure_dates closure_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_dates
    ADD CONSTRAINT closure_dates_pkey PRIMARY KEY (id);


--
-- Name: closure_dates closure_dates_season_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_dates
    ADD CONSTRAINT closure_dates_season_id_date_key UNIQUE (season_id, date);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: customer_contacts customer_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);


--
-- Name: customer_credit_usage customer_credit_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_usage
    ADD CONSTRAINT customer_credit_usage_pkey PRIMARY KEY (id);


--
-- Name: customer_credits customer_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_pkey PRIMARY KEY (id);


--
-- Name: customer_participants customer_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_pkey PRIMARY KEY (id);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: daily_reconciliations daily_reconciliations_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reconciliations
    ADD CONSTRAINT daily_reconciliations_date_key UNIQUE (date);


--
-- Name: daily_reconciliations daily_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reconciliations
    ADD CONSTRAINT daily_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: daily_task_completions daily_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_task_completions
    ADD CONSTRAINT daily_task_completions_pkey PRIMARY KEY (id);


--
-- Name: daily_task_completions daily_task_completions_template_id_completed_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_task_completions
    ADD CONSTRAINT daily_task_completions_template_id_completed_date_key UNIQUE (template_id, completed_date);


--
-- Name: daily_task_templates daily_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_task_templates
    ADD CONSTRAINT daily_task_templates_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_trigger_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_trigger_key UNIQUE (trigger);


--
-- Name: entity_merges entity_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merges
    ADD CONSTRAINT entity_merges_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: group_course_enrollments group_course_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_pkey PRIMARY KEY (id);


--
-- Name: group_course_instances group_course_instances_course_id_date_start_time_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_course_id_date_start_time_key UNIQUE (course_id, date, start_time);


--
-- Name: group_course_instances group_course_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_pkey PRIMARY KEY (id);


--
-- Name: group_course_schedules group_course_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_schedules
    ADD CONSTRAINT group_course_schedules_pkey PRIMARY KEY (id);


--
-- Name: group_courses group_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_courses
    ADD CONSTRAINT group_courses_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: high_season_periods high_season_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.high_season_periods
    ADD CONSTRAINT high_season_periods_pkey PRIMARY KEY (id);


--
-- Name: instructor_absences instructor_absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_absences
    ADD CONSTRAINT instructor_absences_pkey PRIMARY KEY (id);


--
-- Name: instructor_activity_log instructor_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_activity_log
    ADD CONSTRAINT instructor_activity_log_pkey PRIMARY KEY (id);


--
-- Name: instructor_capabilities instructor_capabilities_instructor_id_capability_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_capabilities
    ADD CONSTRAINT instructor_capabilities_instructor_id_capability_id_key UNIQUE (instructor_id, capability_id);


--
-- Name: instructor_capabilities instructor_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_capabilities
    ADD CONSTRAINT instructor_capabilities_pkey PRIMARY KEY (id);


--
-- Name: instructor_deployment_windows instructor_deployment_windows_instructor_id_valid_from_vali_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_deployment_windows
    ADD CONSTRAINT instructor_deployment_windows_instructor_id_valid_from_vali_key UNIQUE (instructor_id, valid_from, valid_until, source);


--
-- Name: instructor_deployment_windows instructor_deployment_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_deployment_windows
    ADD CONSTRAINT instructor_deployment_windows_pkey PRIMARY KEY (id);


--
-- Name: instructor_hr_private instructor_hr_private_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_hr_private
    ADD CONSTRAINT instructor_hr_private_pkey PRIMARY KEY (instructor_id);


--
-- Name: instructor_import_ledger instructor_import_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_ledger
    ADD CONSTRAINT instructor_import_ledger_pkey PRIMARY KEY (id);


--
-- Name: instructor_import_ledger instructor_import_ledger_run_id_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_ledger
    ADD CONSTRAINT instructor_import_ledger_run_id_instructor_id_key UNIQUE (run_id, instructor_id);


--
-- Name: instructor_import_ledger instructor_import_ledger_run_id_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_ledger
    ADD CONSTRAINT instructor_import_ledger_run_id_source_id_key UNIQUE (run_id, source_id);


--
-- Name: instructor_import_runs instructor_import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_runs
    ADD CONSTRAINT instructor_import_runs_pkey PRIMARY KEY (id);


--
-- Name: instructor_import_staging instructor_import_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_staging
    ADD CONSTRAINT instructor_import_staging_pkey PRIMARY KEY (id);


--
-- Name: instructor_import_staging instructor_import_staging_run_id_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_staging
    ADD CONSTRAINT instructor_import_staging_run_id_source_id_key UNIQUE (run_id, source_id);


--
-- Name: instructor_live_status instructor_live_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_live_status
    ADD CONSTRAINT instructor_live_status_pkey PRIMARY KEY (instructor_id);


--
-- Name: instructor_notification_queue instructor_notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_notification_queue
    ADD CONSTRAINT instructor_notification_queue_pkey PRIMARY KEY (id);


--
-- Name: instructor_photos instructor_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_photos
    ADD CONSTRAINT instructor_photos_pkey PRIMARY KEY (id);


--
-- Name: instructor_recurring_blocks instructor_recurring_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_recurring_blocks
    ADD CONSTRAINT instructor_recurring_blocks_pkey PRIMARY KEY (id);


--
-- Name: instructor_source_links instructor_source_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_source_links
    ADD CONSTRAINT instructor_source_links_pkey PRIMARY KEY (id);


--
-- Name: instructor_source_links instructor_source_links_source_system_rollout_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_source_links
    ADD CONSTRAINT instructor_source_links_source_system_rollout_instructor_id_key UNIQUE (source_system, rollout, instructor_id);


--
-- Name: instructor_source_links instructor_source_links_source_system_rollout_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_source_links
    ADD CONSTRAINT instructor_source_links_source_system_rollout_source_id_key UNIQUE (source_system, rollout, source_id);


--
-- Name: instructor_test_tokens instructor_test_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_test_tokens
    ADD CONSTRAINT instructor_test_tokens_pkey PRIMARY KEY (id);


--
-- Name: instructor_test_tokens instructor_test_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_test_tokens
    ADD CONSTRAINT instructor_test_tokens_token_key UNIQUE (token);


--
-- Name: instructor_user_links instructor_user_links_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_user_links
    ADD CONSTRAINT instructor_user_links_instructor_id_key UNIQUE (instructor_id);


--
-- Name: instructor_user_links instructor_user_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_user_links
    ADD CONSTRAINT instructor_user_links_pkey PRIMARY KEY (user_id);


--
-- Name: instructors instructors_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_email_key UNIQUE (email);


--
-- Name: instructors instructors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_pkey PRIMARY KEY (id);


--
-- Name: inventory_categories inventory_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_inventory_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_inventory_number_key UNIQUE (inventory_number);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_rental_items inventory_rental_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rental_items
    ADD CONSTRAINT inventory_rental_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_rentals inventory_rentals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rentals
    ADD CONSTRAINT inventory_rentals_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: master_bookings master_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_bookings
    ADD CONSTRAINT master_bookings_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notification_queue notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: office_hour_blocks office_hour_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_hour_blocks
    ADD CONSTRAINT office_hour_blocks_pkey PRIMARY KEY (id);


--
-- Name: office_shift_assignments office_shift_assignments_instance_id_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_shift_assignments
    ADD CONSTRAINT office_shift_assignments_instance_id_instructor_id_key UNIQUE (instance_id, instructor_id);


--
-- Name: office_shift_assignments office_shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_shift_assignments
    ADD CONSTRAINT office_shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: participant_level_history participant_level_history_participant_id_discipline_season_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_level_history
    ADD CONSTRAINT participant_level_history_participant_id_discipline_season_key UNIQUE (participant_id, discipline, season);


--
-- Name: participant_level_history participant_level_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_level_history
    ADD CONSTRAINT participant_level_history_pkey PRIMARY KEY (id);


--
-- Name: participant_transfer_requests participant_transfer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_transfer_requests
    ADD CONSTRAINT participant_transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: payment_profiles payment_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_profiles
    ADD CONSTRAINT payment_profiles_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: private_appointment_backfill_log private_appointment_backfill_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_backfill_log
    ADD CONSTRAINT private_appointment_backfill_log_pkey PRIMARY KEY (id);


--
-- Name: private_appointment_participants private_appointment_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_participants
    ADD CONSTRAINT private_appointment_participants_pkey PRIMARY KEY (id);


--
-- Name: private_appointment_participants private_appointment_participants_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_participants
    ADD CONSTRAINT private_appointment_participants_unique UNIQUE (appointment_id, participant_id);


--
-- Name: private_appointment_submissions private_appointment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_submissions
    ADD CONSTRAINT private_appointment_submissions_pkey PRIMARY KEY (submission_key);


--
-- Name: private_appointments private_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointments
    ADD CONSTRAINT private_appointments_pkey PRIMARY KEY (id);


--
-- Name: private_lesson_rates private_lesson_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_lesson_rates
    ADD CONSTRAINT private_lesson_rates_pkey PRIMARY KEY (id);


--
-- Name: private_lesson_rates private_lesson_rates_start_time_end_time_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_lesson_rates
    ADD CONSTRAINT private_lesson_rates_start_time_end_time_key UNIQUE (start_time, end_time);


--
-- Name: product_price_tiers product_price_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_tiers
    ADD CONSTRAINT product_price_tiers_pkey PRIMARY KEY (id);


--
-- Name: product_price_tiers product_price_tiers_product_id_day_count_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_tiers
    ADD CONSTRAINT product_price_tiers_product_id_day_count_key UNIQUE (product_id, day_count);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refund_requests refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_pkey PRIMARY KEY (id);


--
-- Name: school_settings school_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_settings
    ADD CONSTRAINT school_settings_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: shop_article_variants shop_article_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_article_variants
    ADD CONSTRAINT shop_article_variants_pkey PRIMARY KEY (id);


--
-- Name: shop_article_variants shop_article_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_article_variants
    ADD CONSTRAINT shop_article_variants_sku_key UNIQUE (sku);


--
-- Name: shop_articles shop_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_articles
    ADD CONSTRAINT shop_articles_pkey PRIMARY KEY (id);


--
-- Name: shop_articles shop_articles_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_articles
    ADD CONSTRAINT shop_articles_sku_key UNIQUE (sku);


--
-- Name: shop_stock_movements shop_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_stock_movements
    ADD CONSTRAINT shop_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: shop_transaction_items shop_transaction_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transaction_items
    ADD CONSTRAINT shop_transaction_items_pkey PRIMARY KEY (id);


--
-- Name: shop_transactions shop_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_pkey PRIMARY KEY (id);


--
-- Name: shop_transactions shop_transactions_transaction_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_transaction_number_key UNIQUE (transaction_number);


--
-- Name: skill_levels skill_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_levels
    ADD CONSTRAINT skill_levels_pkey PRIMARY KEY (id);


--
-- Name: ticket_comments ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: ticket_history ticket_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_history
    ADD CONSTRAINT ticket_history_pkey PRIMARY KEY (id);


--
-- Name: ticket_item_overrides ticket_item_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_overrides
    ADD CONSTRAINT ticket_item_overrides_pkey PRIMARY KEY (id);


--
-- Name: ticket_item_overrides ticket_item_overrides_ticket_item_id_override_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_overrides
    ADD CONSTRAINT ticket_item_overrides_ticket_item_id_override_date_key UNIQUE (ticket_item_id, override_date);


--
-- Name: ticket_item_period_metadata ticket_item_period_metadata_period_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_period_metadata
    ADD CONSTRAINT ticket_item_period_metadata_period_group_id_key UNIQUE (period_group_id);


--
-- Name: ticket_item_period_metadata ticket_item_period_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_period_metadata
    ADD CONSTRAINT ticket_item_period_metadata_pkey PRIMARY KEY (id);


--
-- Name: ticket_items ticket_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_pkey PRIMARY KEY (id);


--
-- Name: ticket_number_counters ticket_number_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_number_counters
    ADD CONSTRAINT ticket_number_counters_pkey PRIMARY KEY (year);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: training_course_dates training_course_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_dates
    ADD CONSTRAINT training_course_dates_pkey PRIMARY KEY (id);


--
-- Name: training_course_dates training_course_dates_training_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_dates
    ADD CONSTRAINT training_course_dates_training_id_date_key UNIQUE (training_id, date);


--
-- Name: training_groups training_groups_course_id_week_start_group_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_course_id_week_start_group_number_key UNIQUE (course_id, week_start, group_number);


--
-- Name: training_groups training_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_pkey PRIMARY KEY (id);


--
-- Name: training_participants training_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT training_participants_pkey PRIMARY KEY (id);


--
-- Name: training_participants training_participants_training_id_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT training_participants_training_id_instructor_id_key UNIQUE (training_id, instructor_id);


--
-- Name: trainings trainings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT trainings_pkey PRIMARY KEY (id);


--
-- Name: master_bookings unique_instructor_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_bookings
    ADD CONSTRAINT unique_instructor_slot UNIQUE (instructor_id, date, start_time, end_time);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: voucher_redemptions voucher_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_notifications whatsapp_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_notifications
    ADD CONSTRAINT whatsapp_notifications_pkey PRIMARY KEY (id);


--
-- Name: bc_product_tariff_sources_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bc_product_tariff_sources_product_idx ON public.bc_product_tariff_sources USING btree (product_id);


--
-- Name: booking_requests_submission_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX booking_requests_submission_key_uidx ON public.booking_requests USING btree (submission_key) WHERE (submission_key IS NOT NULL);


--
-- Name: customers_customer_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customers_customer_number_key ON public.customers USING btree (customer_number);


--
-- Name: idx_action_tasks_related_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_tasks_related_ticket ON public.action_tasks USING btree (related_ticket_id);


--
-- Name: idx_action_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_tasks_status ON public.action_tasks USING btree (status);


--
-- Name: idx_action_tasks_task_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_action_tasks_task_type ON public.action_tasks USING btree (task_type);


--
-- Name: idx_activity_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_created_at ON public.instructor_activity_log USING btree (created_at DESC);


--
-- Name: idx_activity_log_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_instructor_id ON public.instructor_activity_log USING btree (instructor_id);


--
-- Name: idx_activity_log_ticket_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_ticket_item_id ON public.instructor_activity_log USING btree (ticket_item_id);


--
-- Name: idx_booking_consents_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_consents_ticket_id ON public.booking_consents USING btree (ticket_id);


--
-- Name: idx_booking_requests_magic_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_magic_token ON public.booking_requests USING btree (magic_token);


--
-- Name: idx_booking_requests_request_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_request_number ON public.booking_requests USING btree (request_number);


--
-- Name: idx_booking_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_requests_status ON public.booking_requests USING btree (status);


--
-- Name: idx_cancellations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cancellations_date ON public.booking_cancellations USING btree (cancelled_at);


--
-- Name: idx_cancellations_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cancellations_ticket ON public.booking_cancellations USING btree (ticket_id);


--
-- Name: idx_conversations_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_channel ON public.conversations USING btree (channel);


--
-- Name: idx_conversations_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_classification ON public.conversations USING btree (classification);


--
-- Name: idx_conversations_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_created_at_desc ON public.conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_customer_id ON public.conversations USING btree (customer_id);


--
-- Name: idx_conversations_matched_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_matched_customer ON public.conversations USING btree (matched_customer_id);


--
-- Name: idx_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);


--
-- Name: idx_course_dates_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_dates_date ON public.training_course_dates USING btree (date);


--
-- Name: idx_course_dates_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_dates_training ON public.training_course_dates USING btree (training_id);


--
-- Name: idx_credit_usage_credit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_usage_credit ON public.customer_credit_usage USING btree (credit_id);


--
-- Name: idx_credit_usage_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_usage_ticket ON public.customer_credit_usage USING btree (ticket_id);


--
-- Name: idx_customer_contacts_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_contacts_customer ON public.customer_contacts USING btree (customer_id);


--
-- Name: idx_customer_credits_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_credits_customer ON public.customer_credits USING btree (customer_id);


--
-- Name: idx_customer_credits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_credits_status ON public.customer_credits USING btree (status);


--
-- Name: idx_customer_participants_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_participants_customer_id ON public.customer_participants USING btree (customer_id);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_is_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_is_archived ON public.customers USING btree (is_archived);


--
-- Name: idx_email_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_created ON public.email_logs USING btree (created_at DESC);


--
-- Name: idx_email_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_status ON public.email_logs USING btree (status);


--
-- Name: idx_enrollments_training_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_training_group ON public.group_course_enrollments USING btree (training_group_id);


--
-- Name: idx_entity_merges_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merges_source ON public.entity_merges USING btree (source_id);


--
-- Name: idx_entity_merges_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merges_target ON public.entity_merges USING btree (target_id);


--
-- Name: idx_event_categories_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_categories_event ON public.event_categories USING btree (event_id);


--
-- Name: idx_event_participant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_event_participant_unique ON public.event_participants USING btree (event_id, participant_id) WHERE (participant_id IS NOT NULL);


--
-- Name: idx_event_participants_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_participants_category ON public.event_participants USING btree (category_id);


--
-- Name: idx_event_participants_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_participants_event ON public.event_participants USING btree (event_id);


--
-- Name: idx_event_participants_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_participants_participant ON public.event_participants USING btree (participant_id) WHERE (participant_id IS NOT NULL);


--
-- Name: idx_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date ON public.events USING btree (event_date);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_group_course_instances_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_course_instances_date ON public.group_course_instances USING btree (date);


--
-- Name: idx_group_courses_is_internal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_courses_is_internal ON public.group_courses USING btree (is_internal);


--
-- Name: idx_group_courses_next_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_courses_next_training ON public.group_courses USING btree (next_training_id);


--
-- Name: idx_group_courses_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_courses_product ON public.group_courses USING btree (product_id);


--
-- Name: idx_group_courses_skill_level_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_courses_skill_level_id ON public.group_courses USING btree (skill_level_id);


--
-- Name: idx_groups_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_instructor_id ON public.groups USING btree (instructor_id);


--
-- Name: idx_groups_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_start_date ON public.groups USING btree (start_date);


--
-- Name: idx_groups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_status ON public.groups USING btree (status);


--
-- Name: idx_instructor_notification_queue_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_notification_queue_dedup ON public.instructor_notification_queue USING btree (ticket_item_id, notification_type, created_at);


--
-- Name: idx_instructor_notification_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_notification_queue_pending ON public.instructor_notification_queue USING btree (status, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_instructors_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_email ON public.instructors USING btree (email);


--
-- Name: idx_instructors_real_time_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_real_time_status ON public.instructors USING btree (real_time_status);


--
-- Name: idx_instructors_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_role ON public.instructors USING btree (role);


--
-- Name: idx_level_history_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_level_history_participant ON public.participant_level_history USING btree (participant_id);


--
-- Name: idx_level_history_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_level_history_season ON public.participant_level_history USING btree (season);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_office_hour_blocks_instructor_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_office_hour_blocks_instructor_date ON public.office_hour_blocks USING btree (instructor_id, date);


--
-- Name: idx_office_shift_assignments_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_office_shift_assignments_instance ON public.office_shift_assignments USING btree (instance_id);


--
-- Name: idx_office_shift_assignments_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_office_shift_assignments_instructor ON public.office_shift_assignments USING btree (instructor_id);


--
-- Name: idx_pap_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pap_participant ON public.private_appointment_participants USING btree (participant_id);


--
-- Name: idx_participants_is_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_is_archived ON public.customer_participants USING btree (is_archived);


--
-- Name: idx_participants_ski_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_ski_training ON public.customer_participants USING btree (current_ski_training_id);


--
-- Name: idx_participants_snowboard_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_snowboard_training ON public.customer_participants USING btree (current_snowboard_training_id);


--
-- Name: idx_period_metadata_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_period_metadata_dates ON public.ticket_item_period_metadata USING btree (start_date, end_date);


--
-- Name: idx_period_metadata_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_period_metadata_group ON public.ticket_item_period_metadata USING btree (period_group_id);


--
-- Name: idx_price_tiers_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_tiers_product ON public.product_price_tiers USING btree (product_id);


--
-- Name: idx_private_appointments_date_instr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_private_appointments_date_instr ON public.private_appointments USING btree (date, instructor_id);


--
-- Name: idx_private_appointments_submission_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_private_appointments_submission_key ON public.private_appointments USING btree (submission_key) WHERE (submission_key IS NOT NULL);


--
-- Name: idx_private_appointments_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_private_appointments_ticket ON public.private_appointments USING btree (ticket_id);


--
-- Name: idx_products_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_is_active ON public.products USING btree (is_active);


--
-- Name: idx_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_type ON public.products USING btree (type);


--
-- Name: idx_recurring_blocks_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_blocks_instructor ON public.instructor_recurring_blocks USING btree (instructor_id);


--
-- Name: idx_recurring_blocks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_blocks_status ON public.instructor_recurring_blocks USING btree (status);


--
-- Name: idx_recurring_blocks_weekdays; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_blocks_weekdays ON public.instructor_recurring_blocks USING gin (weekdays);


--
-- Name: idx_refund_requests_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_requests_customer ON public.refund_requests USING btree (customer_id);


--
-- Name: idx_refund_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_requests_status ON public.refund_requests USING btree (status);


--
-- Name: idx_skill_levels_discipline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_levels_discipline ON public.skill_levels USING btree (discipline);


--
-- Name: idx_skill_levels_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_levels_sort ON public.skill_levels USING btree (sort_order);


--
-- Name: idx_skill_levels_target_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_levels_target_group ON public.skill_levels USING btree (target_group);


--
-- Name: idx_ticket_comments_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_comments_ticket_id ON public.ticket_comments USING btree (ticket_id);


--
-- Name: idx_ticket_comments_ticket_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_comments_ticket_item_id ON public.ticket_comments USING btree (ticket_item_id);


--
-- Name: idx_ticket_comments_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_comments_type ON public.ticket_comments USING btree (comment_type);


--
-- Name: idx_ticket_history_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_history_ticket_id ON public.ticket_history USING btree (ticket_id);


--
-- Name: idx_ticket_item_overrides_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_item_overrides_date ON public.ticket_item_overrides USING btree (override_date);


--
-- Name: idx_ticket_item_overrides_ticket_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_item_overrides_ticket_item_id ON public.ticket_item_overrides USING btree (ticket_item_id);


--
-- Name: idx_ticket_items_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_appointment ON public.ticket_items USING btree (appointment_id);


--
-- Name: idx_ticket_items_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_date ON public.ticket_items USING btree (date);


--
-- Name: idx_ticket_items_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_instructor_id ON public.ticket_items USING btree (instructor_id);


--
-- Name: idx_ticket_items_is_vegetarian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_is_vegetarian ON public.ticket_items USING btree (is_vegetarian) WHERE (is_vegetarian = true);


--
-- Name: idx_ticket_items_period_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_period_group ON public.ticket_items USING btree (period_group_id) WHERE (period_group_id IS NOT NULL);


--
-- Name: idx_ticket_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_status ON public.ticket_items USING btree (status);


--
-- Name: idx_ticket_items_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_items_ticket_id ON public.ticket_items USING btree (ticket_id);


--
-- Name: idx_tickets_billing_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_billing_partner ON public.tickets USING btree (billing_partner_id);


--
-- Name: idx_tickets_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_customer_id ON public.tickets USING btree (customer_id);


--
-- Name: idx_tickets_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_source ON public.tickets USING btree (source);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_ticket_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_ticket_number ON public.tickets USING btree (ticket_number);


--
-- Name: idx_training_groups_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_groups_course ON public.training_groups USING btree (course_id);


--
-- Name: idx_training_groups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_groups_status ON public.training_groups USING btree (status);


--
-- Name: idx_training_groups_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_groups_week ON public.training_groups USING btree (week_start);


--
-- Name: idx_training_participants_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_participants_instructor_id ON public.training_participants USING btree (instructor_id);


--
-- Name: idx_training_participants_training_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_participants_training_id ON public.training_participants USING btree (training_id);


--
-- Name: idx_trainings_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_date ON public.trainings USING btree (date);


--
-- Name: idx_trainings_internal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_internal ON public.trainings USING btree (is_internal);


--
-- Name: idx_trainings_training_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_training_type ON public.trainings USING btree (training_type);


--
-- Name: idx_whatsapp_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_notifications_created_at ON public.whatsapp_notifications USING btree (created_at DESC);


--
-- Name: idx_whatsapp_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_notifications_recipient ON public.whatsapp_notifications USING btree (recipient_id, recipient_type);


--
-- Name: idx_whatsapp_notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_notifications_status ON public.whatsapp_notifications USING btree (status);


--
-- Name: instructor_photos_one_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX instructor_photos_one_current ON public.instructor_photos USING btree (instructor_id) WHERE is_current;


--
-- Name: instructors_website_visible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX instructors_website_visible_idx ON public.instructors USING btree (first_name, last_name) WHERE ((show_on_website = true) AND (status = 'active'::text));


--
-- Name: invoices_open_ticket_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_open_ticket_unique ON public.invoices USING btree (ticket_id) WHERE (status = 'open'::text);


--
-- Name: invoices_payment_reference_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_payment_reference_unique_idx ON public.invoices USING btree (payment_reference) WHERE ((payment_reference IS NOT NULL) AND (payment_reference <> ''::text));


--
-- Name: invoices_qr_reference_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_qr_reference_unique_idx ON public.invoices USING btree (qr_reference) WHERE ((qr_reference IS NOT NULL) AND (qr_reference <> ''::text));


--
-- Name: payment_profiles_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_profiles_lookup_idx ON public.payment_profiles USING btree (country_scope, currency, is_active) WHERE (NOT is_archived);


--
-- Name: payment_profiles_one_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_profiles_one_default_idx ON public.payment_profiles USING btree (country_scope, currency) WHERE (is_default AND is_active AND (NOT is_archived));


--
-- Name: payments_ticket_reference_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_ticket_reference_unique ON public.payments USING btree (ticket_id, reference) WHERE (reference IS NOT NULL);


--
-- Name: unique_pending_participant_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_pending_participant_request ON public.participant_transfer_requests USING btree (participant_id) WHERE (status = 'pending'::text);


--
-- Name: ticket_items check_ticket_item_times; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_ticket_item_times BEFORE INSERT OR UPDATE ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION public.validate_ticket_item_times();


--
-- Name: booking_requests generate_booking_request_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER generate_booking_request_number BEFORE INSERT ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION public.generate_request_number();


--
-- Name: shop_transactions generate_shop_transaction_number_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER generate_shop_transaction_number_trigger BEFORE INSERT ON public.shop_transactions FOR EACH ROW WHEN (((new.transaction_number IS NULL) OR (new.transaction_number = ''::text))) EXECUTE FUNCTION public.generate_shop_transaction_number();


--
-- Name: vouchers generate_voucher_code_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER generate_voucher_code_trigger BEFORE INSERT ON public.vouchers FOR EACH ROW WHEN (((new.code IS NULL) OR (new.code = ''::text))) EXECUTE FUNCTION public.generate_voucher_code();


--
-- Name: group_course_instances group_instance_instructor_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER group_instance_instructor_notification_trigger AFTER INSERT OR UPDATE ON public.group_course_instances FOR EACH ROW EXECUTE FUNCTION public.handle_group_instance_instructor_notification();


--
-- Name: participant_transfer_requests handle_participant_transfer_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_participant_transfer_requests_updated_at BEFORE UPDATE ON public.participant_transfer_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products prevent_bc_draft_activation_on_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_bc_draft_activation_on_products BEFORE UPDATE OF is_active ON public.products FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION public.prevent_bc_draft_activation();


--
-- Name: invoices set_invoice_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW WHEN (((new.invoice_number IS NULL) OR (new.invoice_number = ''::text))) EXECUTE FUNCTION public.generate_invoice_number();


--
-- Name: booking_requests set_request_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_request_number BEFORE INSERT ON public.booking_requests FOR EACH ROW WHEN ((new.request_number IS NULL)) EXECUTE FUNCTION public.generate_request_number();


--
-- Name: ticket_items ticket_item_instructor_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ticket_item_instructor_notification_trigger AFTER INSERT OR UPDATE ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION public.handle_ticket_item_instructor_notification();


--
-- Name: tickets trg_auto_assign_ticket_season; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_assign_ticket_season BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.auto_assign_ticket_season();


--
-- Name: instructor_import_ledger trg_bc_ledger_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bc_ledger_immutable BEFORE DELETE OR UPDATE ON public.instructor_import_ledger FOR EACH ROW EXECUTE FUNCTION public.bc_ledger_immutable();


--
-- Name: instructor_import_ledger trg_bc_ledger_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bc_ledger_no_truncate BEFORE TRUNCATE ON public.instructor_import_ledger FOR EACH STATEMENT EXECUTE FUNCTION public.bc_ledger_immutable();


--
-- Name: instructor_photos trg_bc_photo_path_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bc_photo_path_guard BEFORE INSERT OR UPDATE ON public.instructor_photos FOR EACH ROW EXECUTE FUNCTION public.bc_photo_path_guard();


--
-- Name: booking_cancellations trg_booking_cancelled; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_booking_cancelled AFTER INSERT ON public.booking_cancellations FOR EACH ROW EXECUTE FUNCTION public.log_booking_cancelled();


--
-- Name: tickets trg_enforce_ticket_customer_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_ticket_customer_required BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_customer_required();


--
-- Name: customers trg_generate_customer_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_customer_number BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.generate_customer_number();


--
-- Name: instructor_absences trg_guard_teacher_absence_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_teacher_absence_update BEFORE UPDATE ON public.instructor_absences FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_absence_update();


--
-- Name: instructors trg_instructors_sync_live_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_instructors_sync_live_status AFTER INSERT OR UPDATE OF real_time_status ON public.instructors FOR EACH ROW EXECUTE FUNCTION public.instructors_sync_live_status();


--
-- Name: ticket_items trg_pa_ticket_item_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pa_ticket_item_guard BEFORE INSERT OR UPDATE ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION public.pa_ticket_item_guard();


--
-- Name: customer_contacts trg_single_primary_contact; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_single_primary_contact BEFORE INSERT OR UPDATE ON public.customer_contacts FOR EACH ROW EXECUTE FUNCTION public.ensure_single_primary_contact();


--
-- Name: tickets trg_ticket_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ticket_created AFTER INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.log_ticket_created();


--
-- Name: ticket_items trg_ticket_item_instructor_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ticket_item_instructor_changed AFTER UPDATE OF instructor_id ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION public.log_ticket_item_instructor_changed();


--
-- Name: tickets trg_ticket_status_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ticket_status_changed AFTER UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.log_ticket_status_changed();


--
-- Name: customer_credit_usage trigger_credit_usage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_credit_usage AFTER INSERT ON public.customer_credit_usage FOR EACH ROW EXECUTE FUNCTION public.update_credit_remaining();


--
-- Name: ticket_item_period_metadata trigger_period_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_period_metadata_updated_at BEFORE UPDATE ON public.ticket_item_period_metadata FOR EACH ROW EXECUTE FUNCTION public.update_period_metadata_updated_at();


--
-- Name: billing_partners update_billing_partners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_billing_partners_updated_at BEFORE UPDATE ON public.billing_partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_email_deliveries update_booking_email_deliveries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_booking_email_deliveries_updated_at BEFORE UPDATE ON public.booking_email_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_credits update_customer_credits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_credits_updated_at BEFORE UPDATE ON public.customer_credits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_reconciliations update_daily_reconciliations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_reconciliations_updated_at BEFORE UPDATE ON public.daily_reconciliations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: entity_merges update_entity_merges_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_entity_merges_updated_at BEFORE UPDATE ON public.entity_merges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_participants update_event_participants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_event_participants_updated_at BEFORE UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_courses update_group_courses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_group_courses_updated_at BEFORE UPDATE ON public.group_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_items update_inventory_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_rentals update_inventory_rentals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_rentals_updated_at BEFORE UPDATE ON public.inventory_rentals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: master_bookings update_master_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_master_bookings_updated_at BEFORE UPDATE ON public.master_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: private_appointment_participants update_pap_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pap_updated_at BEFORE UPDATE ON public.private_appointment_participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_profiles update_payment_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_profiles_updated_at BEFORE UPDATE ON public.payment_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_price_tiers update_price_tiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_price_tiers_updated_at BEFORE UPDATE ON public.product_price_tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pricing_rules update_pricing_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: private_appointments update_private_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_private_appointments_updated_at BEFORE UPDATE ON public.private_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: private_lesson_rates update_private_lesson_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_private_lesson_rates_updated_at BEFORE UPDATE ON public.private_lesson_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_recurring_blocks update_recurring_blocks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recurring_blocks_updated_at BEFORE UPDATE ON public.instructor_recurring_blocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: school_settings update_school_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_school_settings_updated_at BEFORE UPDATE ON public.school_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: seasons update_seasons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shop_articles update_shop_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_shop_articles_updated_at BEFORE UPDATE ON public.shop_articles FOR EACH ROW EXECUTE FUNCTION public.update_shop_article_updated_at();


--
-- Name: ticket_item_overrides update_ticket_item_overrides_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ticket_item_overrides_updated_at BEFORE UPDATE ON public.ticket_item_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets update_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: training_course_dates update_training_course_dates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_training_course_dates_updated_at BEFORE UPDATE ON public.training_course_dates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: training_groups update_training_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_training_groups_updated_at BEFORE UPDATE ON public.training_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: voucher_redemptions update_voucher_on_redemption; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_voucher_on_redemption AFTER INSERT ON public.voucher_redemptions FOR EACH ROW EXECUTE FUNCTION public.update_voucher_status_on_redemption();


--
-- Name: vouchers update_vouchers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vouchers_updated_at BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_courses validate_group_course_ages_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_group_course_ages_trigger BEFORE INSERT OR UPDATE ON public.group_courses FOR EACH ROW EXECUTE FUNCTION public.validate_group_course_ages();


--
-- Name: action_tasks action_tasks_related_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_tasks
    ADD CONSTRAINT action_tasks_related_ticket_id_fkey FOREIGN KEY (related_ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: action_tasks action_tasks_related_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_tasks
    ADD CONSTRAINT action_tasks_related_ticket_item_id_fkey FOREIGN KEY (related_ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_documents ai_knowledge_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: bc_2627_course_period_sources bc_2627_course_period_sources_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_period_sources
    ADD CONSTRAINT bc_2627_course_period_sources_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.group_courses(id);


--
-- Name: bc_2627_course_period_sources bc_2627_course_period_sources_training_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_period_sources
    ADD CONSTRAINT bc_2627_course_period_sources_training_group_id_fkey FOREIGN KEY (training_group_id) REFERENCES public.training_groups(id);


--
-- Name: bc_2627_course_product_variants bc_2627_course_product_variants_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_product_variants
    ADD CONSTRAINT bc_2627_course_product_variants_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.group_courses(id);


--
-- Name: bc_2627_course_product_variants bc_2627_course_product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_2627_course_product_variants
    ADD CONSTRAINT bc_2627_course_product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: bc_product_tariff_sources bc_product_tariff_sources_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_product_tariff_sources
    ADD CONSTRAINT bc_product_tariff_sources_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: bc_product_tariff_sources bc_product_tariff_sources_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bc_product_tariff_sources
    ADD CONSTRAINT bc_product_tariff_sources_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE RESTRICT;


--
-- Name: booking_cancellations booking_cancellations_customer_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cancellations
    ADD CONSTRAINT booking_cancellations_customer_credit_id_fkey FOREIGN KEY (customer_credit_id) REFERENCES public.customer_credits(id);


--
-- Name: booking_cancellations booking_cancellations_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cancellations
    ADD CONSTRAINT booking_cancellations_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: booking_consents booking_consents_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_consents
    ADD CONSTRAINT booking_consents_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: booking_email_deliveries booking_email_deliveries_email_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_email_deliveries
    ADD CONSTRAINT booking_email_deliveries_email_log_id_fkey FOREIGN KEY (email_log_id) REFERENCES public.email_logs(id) ON DELETE SET NULL;


--
-- Name: booking_email_deliveries booking_email_deliveries_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_email_deliveries
    ADD CONSTRAINT booking_email_deliveries_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: booking_requests booking_requests_converted_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_converted_ticket_id_fkey FOREIGN KEY (converted_ticket_id) REFERENCES public.tickets(id);


--
-- Name: booking_requests booking_requests_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: closure_dates closure_dates_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_dates
    ADD CONSTRAINT closure_dates_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: conversations conversations_matched_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_matched_customer_id_fkey FOREIGN KEY (matched_customer_id) REFERENCES public.customers(id);


--
-- Name: conversations conversations_related_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_related_ticket_id_fkey FOREIGN KEY (related_ticket_id) REFERENCES public.tickets(id);


--
-- Name: customer_contacts customer_contacts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_credit_usage customer_credit_usage_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_usage
    ADD CONSTRAINT customer_credit_usage_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES public.customer_credits(id) ON DELETE CASCADE;


--
-- Name: customer_credit_usage customer_credit_usage_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_usage
    ADD CONSTRAINT customer_credit_usage_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: customer_credits customer_credits_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_participants customer_participants_current_ski_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_current_ski_level_id_fkey FOREIGN KEY (current_ski_level_id) REFERENCES public.skill_levels(id);


--
-- Name: customer_participants customer_participants_current_ski_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_current_ski_training_id_fkey FOREIGN KEY (current_ski_training_id) REFERENCES public.group_courses(id) ON DELETE SET NULL;


--
-- Name: customer_participants customer_participants_current_snowboard_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_current_snowboard_level_id_fkey FOREIGN KEY (current_snowboard_level_id) REFERENCES public.skill_levels(id);


--
-- Name: customer_participants customer_participants_current_snowboard_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_current_snowboard_training_id_fkey FOREIGN KEY (current_snowboard_training_id) REFERENCES public.group_courses(id) ON DELETE SET NULL;


--
-- Name: customer_participants customer_participants_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_participants customer_participants_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_participants
    ADD CONSTRAINT customer_participants_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.customer_participants(id) ON DELETE SET NULL;


--
-- Name: customers customers_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: daily_task_completions daily_task_completions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_task_completions
    ADD CONSTRAINT daily_task_completions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.daily_task_templates(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: event_categories event_categories_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_training_id_fkey FOREIGN KEY (training_id) REFERENCES public.group_courses(id);


--
-- Name: event_participants event_participants_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_categories(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_confirmed_by_instructor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_confirmed_by_instructor_fkey FOREIGN KEY (confirmed_by_instructor) REFERENCES public.instructors(id);


--
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id);


--
-- Name: event_participants event_participants_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id);


--
-- Name: group_course_enrollments group_course_enrollments_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.group_course_instances(id) ON DELETE CASCADE;


--
-- Name: group_course_enrollments group_course_enrollments_original_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_original_course_id_fkey FOREIGN KEY (original_course_id) REFERENCES public.group_courses(id);


--
-- Name: group_course_enrollments group_course_enrollments_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id) ON DELETE SET NULL;


--
-- Name: group_course_enrollments group_course_enrollments_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE SET NULL;


--
-- Name: group_course_enrollments group_course_enrollments_training_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_enrollments
    ADD CONSTRAINT group_course_enrollments_training_group_id_fkey FOREIGN KEY (training_group_id) REFERENCES public.training_groups(id);


--
-- Name: group_course_instances group_course_instances_assistant_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_assistant_instructor_id_fkey FOREIGN KEY (assistant_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: group_course_instances group_course_instances_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.group_courses(id) ON DELETE CASCADE;


--
-- Name: group_course_instances group_course_instances_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: group_course_instances group_course_instances_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_instances
    ADD CONSTRAINT group_course_instances_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.group_course_schedules(id) ON DELETE SET NULL;


--
-- Name: group_course_schedules group_course_schedules_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_course_schedules
    ADD CONSTRAINT group_course_schedules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.group_courses(id) ON DELETE CASCADE;


--
-- Name: group_courses group_courses_next_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_courses
    ADD CONSTRAINT group_courses_next_training_id_fkey FOREIGN KEY (next_training_id) REFERENCES public.group_courses(id) ON DELETE SET NULL;


--
-- Name: group_courses group_courses_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_courses
    ADD CONSTRAINT group_courses_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: group_courses group_courses_skill_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_courses
    ADD CONSTRAINT group_courses_skill_level_id_fkey FOREIGN KEY (skill_level_id) REFERENCES public.skill_levels(id);


--
-- Name: groups groups_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id);


--
-- Name: high_season_periods high_season_periods_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.high_season_periods
    ADD CONSTRAINT high_season_periods_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: instructor_absences instructor_absences_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_absences
    ADD CONSTRAINT instructor_absences_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: instructor_absences instructor_absences_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_absences
    ADD CONSTRAINT instructor_absences_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_absences instructor_absences_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_absences
    ADD CONSTRAINT instructor_absences_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: instructor_activity_log instructor_activity_log_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_activity_log
    ADD CONSTRAINT instructor_activity_log_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);


--
-- Name: instructor_activity_log instructor_activity_log_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_activity_log
    ADD CONSTRAINT instructor_activity_log_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_activity_log instructor_activity_log_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_activity_log
    ADD CONSTRAINT instructor_activity_log_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE CASCADE;


--
-- Name: instructor_capabilities instructor_capabilities_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_capabilities
    ADD CONSTRAINT instructor_capabilities_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capabilities(id) ON DELETE CASCADE;


--
-- Name: instructor_capabilities instructor_capabilities_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_capabilities
    ADD CONSTRAINT instructor_capabilities_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_deployment_windows instructor_deployment_windows_import_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_deployment_windows
    ADD CONSTRAINT instructor_deployment_windows_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL;


--
-- Name: instructor_deployment_windows instructor_deployment_windows_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_deployment_windows
    ADD CONSTRAINT instructor_deployment_windows_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: instructor_hr_private instructor_hr_private_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_hr_private
    ADD CONSTRAINT instructor_hr_private_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: instructor_hr_private instructor_hr_private_source_import_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_hr_private
    ADD CONSTRAINT instructor_hr_private_source_import_run_id_fkey FOREIGN KEY (source_import_run_id) REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL;


--
-- Name: instructor_import_ledger instructor_import_ledger_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_ledger
    ADD CONSTRAINT instructor_import_ledger_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.instructor_import_runs(id) ON DELETE RESTRICT;


--
-- Name: instructor_import_ledger instructor_import_ledger_staging_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_ledger
    ADD CONSTRAINT instructor_import_ledger_staging_id_fkey FOREIGN KEY (staging_id) REFERENCES public.instructor_import_staging(id) ON DELETE RESTRICT;


--
-- Name: instructor_import_staging instructor_import_staging_applied_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_staging
    ADD CONSTRAINT instructor_import_staging_applied_instructor_id_fkey FOREIGN KEY (applied_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: instructor_import_staging instructor_import_staging_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_staging
    ADD CONSTRAINT instructor_import_staging_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.instructor_import_runs(id) ON DELETE CASCADE;


--
-- Name: instructor_import_staging instructor_import_staging_target_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_import_staging
    ADD CONSTRAINT instructor_import_staging_target_instructor_id_fkey FOREIGN KEY (target_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: instructor_live_status instructor_live_status_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_live_status
    ADD CONSTRAINT instructor_live_status_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_notification_queue instructor_notification_queue_group_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_notification_queue
    ADD CONSTRAINT instructor_notification_queue_group_instance_id_fkey FOREIGN KEY (group_instance_id) REFERENCES public.group_course_instances(id) ON DELETE SET NULL;


--
-- Name: instructor_notification_queue instructor_notification_queue_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_notification_queue
    ADD CONSTRAINT instructor_notification_queue_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_notification_queue instructor_notification_queue_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_notification_queue
    ADD CONSTRAINT instructor_notification_queue_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE SET NULL;


--
-- Name: instructor_photos instructor_photos_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_photos
    ADD CONSTRAINT instructor_photos_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: instructor_recurring_blocks instructor_recurring_blocks_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_recurring_blocks
    ADD CONSTRAINT instructor_recurring_blocks_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_source_links instructor_source_links_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_source_links
    ADD CONSTRAINT instructor_source_links_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: instructor_source_links instructor_source_links_last_import_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_source_links
    ADD CONSTRAINT instructor_source_links_last_import_run_id_fkey FOREIGN KEY (last_import_run_id) REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL;


--
-- Name: instructor_test_tokens instructor_test_tokens_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_test_tokens
    ADD CONSTRAINT instructor_test_tokens_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_user_links instructor_user_links_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_user_links
    ADD CONSTRAINT instructor_user_links_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id) ON DELETE SET NULL;


--
-- Name: inventory_rental_items inventory_rental_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rental_items
    ADD CONSTRAINT inventory_rental_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_rental_items inventory_rental_items_rental_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rental_items
    ADD CONSTRAINT inventory_rental_items_rental_id_fkey FOREIGN KEY (rental_id) REFERENCES public.inventory_rentals(id) ON DELETE CASCADE;


--
-- Name: inventory_rentals inventory_rentals_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rentals
    ADD CONSTRAINT inventory_rentals_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: inventory_rentals inventory_rentals_office_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_rentals
    ADD CONSTRAINT inventory_rentals_office_user_id_fkey FOREIGN KEY (office_user_id) REFERENCES auth.users(id);


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_payment_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_payment_profile_id_fkey FOREIGN KEY (payment_profile_id) REFERENCES public.payment_profiles(id);


--
-- Name: invoices invoices_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: master_bookings master_bookings_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_bookings
    ADD CONSTRAINT master_bookings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: office_hour_blocks office_hour_blocks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_hour_blocks
    ADD CONSTRAINT office_hour_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: office_hour_blocks office_hour_blocks_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_hour_blocks
    ADD CONSTRAINT office_hour_blocks_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: office_shift_assignments office_shift_assignments_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_shift_assignments
    ADD CONSTRAINT office_shift_assignments_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.group_course_instances(id) ON DELETE CASCADE;


--
-- Name: office_shift_assignments office_shift_assignments_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_shift_assignments
    ADD CONSTRAINT office_shift_assignments_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: participant_level_history participant_level_history_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_level_history
    ADD CONSTRAINT participant_level_history_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES public.instructors(id);


--
-- Name: participant_level_history participant_level_history_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_level_history
    ADD CONSTRAINT participant_level_history_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id) ON DELETE CASCADE;


--
-- Name: participant_level_history participant_level_history_skill_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_level_history
    ADD CONSTRAINT participant_level_history_skill_level_id_fkey FOREIGN KEY (skill_level_id) REFERENCES public.skill_levels(id);


--
-- Name: participant_transfer_requests participant_transfer_requests_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_transfer_requests
    ADD CONSTRAINT participant_transfer_requests_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id) ON DELETE CASCADE;


--
-- Name: participant_transfer_requests participant_transfer_requests_requesting_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_transfer_requests
    ADD CONSTRAINT participant_transfer_requests_requesting_instructor_id_fkey FOREIGN KEY (requesting_instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: participant_transfer_requests participant_transfer_requests_source_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_transfer_requests
    ADD CONSTRAINT participant_transfer_requests_source_group_id_fkey FOREIGN KEY (source_group_id) REFERENCES public.group_course_instances(id) ON DELETE CASCADE;


--
-- Name: participant_transfer_requests participant_transfer_requests_target_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participant_transfer_requests
    ADD CONSTRAINT participant_transfer_requests_target_group_id_fkey FOREIGN KEY (target_group_id) REFERENCES public.group_course_instances(id) ON DELETE CASCADE;


--
-- Name: payments payments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: private_appointment_participants private_appointment_participants_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_participants
    ADD CONSTRAINT private_appointment_participants_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.private_appointments(id) ON DELETE CASCADE;


--
-- Name: private_appointment_participants private_appointment_participants_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_participants
    ADD CONSTRAINT private_appointment_participants_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id);


--
-- Name: private_appointment_submissions private_appointment_submissions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointment_submissions
    ADD CONSTRAINT private_appointment_submissions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: private_appointments private_appointments_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointments
    ADD CONSTRAINT private_appointments_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: private_appointments private_appointments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_appointments
    ADD CONSTRAINT private_appointments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: product_price_tiers product_price_tiers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_tiers
    ADD CONSTRAINT product_price_tiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: refund_requests refund_requests_cancellation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_cancellation_id_fkey FOREIGN KEY (cancellation_id) REFERENCES public.booking_cancellations(id) ON DELETE SET NULL;


--
-- Name: refund_requests refund_requests_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES public.customer_credits(id) ON DELETE CASCADE;


--
-- Name: refund_requests refund_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: shop_article_variants shop_article_variants_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_article_variants
    ADD CONSTRAINT shop_article_variants_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.shop_articles(id) ON DELETE CASCADE;


--
-- Name: shop_stock_movements shop_stock_movements_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_stock_movements
    ADD CONSTRAINT shop_stock_movements_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.shop_articles(id) ON DELETE CASCADE;


--
-- Name: shop_stock_movements shop_stock_movements_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_stock_movements
    ADD CONSTRAINT shop_stock_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.shop_article_variants(id);


--
-- Name: shop_transaction_items shop_transaction_items_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transaction_items
    ADD CONSTRAINT shop_transaction_items_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.shop_articles(id);


--
-- Name: shop_transaction_items shop_transaction_items_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transaction_items
    ADD CONSTRAINT shop_transaction_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.shop_transactions(id) ON DELETE CASCADE;


--
-- Name: shop_transaction_items shop_transaction_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transaction_items
    ADD CONSTRAINT shop_transaction_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.shop_article_variants(id);


--
-- Name: shop_transactions shop_transactions_linked_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_linked_ticket_id_fkey FOREIGN KEY (linked_ticket_id) REFERENCES public.tickets(id);


--
-- Name: skill_levels skill_levels_next_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_levels
    ADD CONSTRAINT skill_levels_next_level_id_fkey FOREIGN KEY (next_level_id) REFERENCES public.skill_levels(id);


--
-- Name: ticket_comments ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_comments ticket_comments_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE CASCADE;


--
-- Name: ticket_history ticket_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_history
    ADD CONSTRAINT ticket_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_item_overrides ticket_item_overrides_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_overrides
    ADD CONSTRAINT ticket_item_overrides_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: ticket_item_overrides ticket_item_overrides_ticket_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_overrides
    ADD CONSTRAINT ticket_item_overrides_ticket_item_id_fkey FOREIGN KEY (ticket_item_id) REFERENCES public.ticket_items(id) ON DELETE CASCADE;


--
-- Name: ticket_item_period_metadata ticket_item_period_metadata_base_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_item_period_metadata
    ADD CONSTRAINT ticket_item_period_metadata_base_instructor_id_fkey FOREIGN KEY (base_instructor_id) REFERENCES public.instructors(id);


--
-- Name: ticket_items ticket_items_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.private_appointments(id) ON DELETE SET NULL;


--
-- Name: ticket_items ticket_items_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id);


--
-- Name: ticket_items ticket_items_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.customer_participants(id);


--
-- Name: ticket_items ticket_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: ticket_items ticket_items_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_items
    ADD CONSTRAINT ticket_items_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_billing_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_billing_partner_id_fkey FOREIGN KEY (billing_partner_id) REFERENCES public.billing_partners(id) ON DELETE RESTRICT;


--
-- Name: tickets tickets_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: tickets tickets_master_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_master_booking_id_fkey FOREIGN KEY (master_booking_id) REFERENCES public.master_bookings(id);


--
-- Name: tickets tickets_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: training_course_dates training_course_dates_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_dates
    ADD CONSTRAINT training_course_dates_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id);


--
-- Name: training_course_dates training_course_dates_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_dates
    ADD CONSTRAINT training_course_dates_training_id_fkey FOREIGN KEY (training_id) REFERENCES public.group_courses(id) ON DELETE CASCADE;


--
-- Name: training_groups training_groups_assistant_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_assistant_instructor_id_fkey FOREIGN KEY (assistant_instructor_id) REFERENCES public.instructors(id);


--
-- Name: training_groups training_groups_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.group_courses(id) ON DELETE CASCADE;


--
-- Name: training_groups training_groups_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id);


--
-- Name: training_groups training_groups_merged_into_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_groups
    ADD CONSTRAINT training_groups_merged_into_group_id_fkey FOREIGN KEY (merged_into_group_id) REFERENCES public.training_groups(id);


--
-- Name: training_participants training_participants_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT training_participants_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: training_participants training_participants_training_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT training_participants_training_id_fkey FOREIGN KEY (training_id) REFERENCES public.trainings(id) ON DELETE CASCADE;


--
-- Name: trainings trainings_lead_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT trainings_lead_instructor_id_fkey FOREIGN KEY (lead_instructor_id) REFERENCES public.instructors(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: voucher_redemptions voucher_redemptions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: voucher_redemptions voucher_redemptions_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_buyer_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_buyer_customer_id_fkey FOREIGN KEY (buyer_customer_id) REFERENCES public.customers(id);


--
-- Name: office_hour_blocks Admin and office can create office hour blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can create office hour blocks" ON public.office_hour_blocks FOR INSERT WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: payment_profiles Admin and office can create payment profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can create payment profiles" ON public.payment_profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: office_hour_blocks Admin and office can delete office hour blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can delete office hour blocks" ON public.office_hour_blocks FOR DELETE USING (public.is_admin_or_office(auth.uid()));


--
-- Name: whatsapp_notifications Admin and office can insert WhatsApp notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can insert WhatsApp notifications" ON public.whatsapp_notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: invoices Admin and office can insert invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can insert invoices" ON public.invoices FOR INSERT WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: capabilities Admin and office can manage capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can manage capabilities" ON public.capabilities TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: instructor_capabilities Admin and office can manage instructor capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can manage instructor capabilities" ON public.instructor_capabilities TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: whatsapp_notifications Admin and office can update WhatsApp notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can update WhatsApp notifications" ON public.whatsapp_notifications FOR UPDATE TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: invoices Admin and office can update invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can update invoices" ON public.invoices FOR UPDATE USING (public.is_admin_or_office(auth.uid()));


--
-- Name: office_hour_blocks Admin and office can update office hour blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can update office hour blocks" ON public.office_hour_blocks FOR UPDATE USING (public.is_admin_or_office(auth.uid()));


--
-- Name: payment_profiles Admin and office can update payment profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can update payment profiles" ON public.payment_profiles FOR UPDATE TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: whatsapp_notifications Admin and office can view WhatsApp notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view WhatsApp notifications" ON public.whatsapp_notifications FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: instructor_activity_log Admin and office can view all activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view all activity logs" ON public.instructor_activity_log FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: invoices Admin and office can view all invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view all invoices" ON public.invoices FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: cancellation_policy Admin and office can view cancellation policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view cancellation policy" ON public.cancellation_policy FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: closure_dates Admin and office can view closure dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view closure dates" ON public.closure_dates FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: high_season_periods Admin and office can view high season periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view high season periods" ON public.high_season_periods FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: office_hour_blocks Admin and office can view office hour blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view office hour blocks" ON public.office_hour_blocks FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: payment_profiles Admin and office can view payment profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view payment profiles" ON public.payment_profiles FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: pricing_rules Admin and office can view pricing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view pricing rules" ON public.pricing_rules FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: school_settings Admin and office can view school settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view school settings" ON public.school_settings FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: seasons Admin and office can view seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office can view seasons" ON public.seasons FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: participant_transfer_requests Admin and office have full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin and office have full access" ON public.participant_transfer_requests USING (public.is_admin_or_office(auth.uid()));


--
-- Name: billing_partners Admin can delete billing partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete billing partners" ON public.billing_partners FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notifications Admin can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert notifications" ON public.notifications FOR INSERT WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: school_settings Admin can insert school settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert school settings" ON public.school_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cancellation_policy Admin can manage cancellation policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage cancellation policy" ON public.cancellation_policy TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: closure_dates Admin can manage closure dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage closure dates" ON public.closure_dates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_templates Admin can manage email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage email templates" ON public.email_templates USING (public.is_admin_or_office(auth.uid()));


--
-- Name: high_season_periods Admin can manage high season periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage high season periods" ON public.high_season_periods TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: instructor_notification_queue Admin can manage notification queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage notification queue" ON public.instructor_notification_queue USING (public.is_admin_or_office(auth.uid()));


--
-- Name: pricing_rules Admin can manage pricing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage pricing rules" ON public.pricing_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: seasons Admin can manage seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage seasons" ON public.seasons TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: skill_levels Admin can manage skill_levels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage skill_levels" ON public.skill_levels USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: school_settings Admin can update school settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update school settings" ON public.school_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_logs Admin can view email logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view email logs" ON public.email_logs FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: instructor_notification_queue Admin can view notification queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view notification queue" ON public.instructor_notification_queue FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: billing_partners Admin or office can insert billing partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin or office can insert billing partners" ON public.billing_partners FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: billing_partners Admin or office can update billing partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin or office can update billing partners" ON public.billing_partners FOR UPDATE TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: booking_cancellations Admin/office can manage cancellations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage cancellations" ON public.booking_cancellations USING (public.is_admin_or_office(auth.uid()));


--
-- Name: inventory_categories Admin/office can manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage categories" ON public.inventory_categories TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: training_course_dates Admin/office can manage course dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage course dates" ON public.training_course_dates USING (public.is_admin_or_office(auth.uid()));


--
-- Name: customer_credit_usage Admin/office can manage credit usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage credit usage" ON public.customer_credit_usage USING (public.is_admin_or_office(auth.uid()));


--
-- Name: customer_credits Admin/office can manage credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage credits" ON public.customer_credits USING (public.is_admin_or_office(auth.uid()));


--
-- Name: event_categories Admin/office can manage event_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage event_categories" ON public.event_categories USING (public.is_admin_or_office(auth.uid()));


--
-- Name: event_participants Admin/office can manage event_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage event_participants" ON public.event_participants USING (public.is_admin_or_office(auth.uid()));


--
-- Name: events Admin/office can manage events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage events" ON public.events USING (public.is_admin_or_office(auth.uid()));


--
-- Name: inventory_items Admin/office can manage items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage items" ON public.inventory_items TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: office_shift_assignments Admin/office can manage office_shift_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage office_shift_assignments" ON public.office_shift_assignments USING (public.is_admin_or_office(auth.uid()));


--
-- Name: refund_requests Admin/office can manage refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage refunds" ON public.refund_requests USING (public.is_admin_or_office(auth.uid()));


--
-- Name: inventory_rental_items Admin/office can manage rental items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage rental items" ON public.inventory_rental_items TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: inventory_rentals Admin/office can manage rentals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage rentals" ON public.inventory_rentals TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: training_groups Admin/office can manage training_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can manage training_groups" ON public.training_groups USING (public.is_admin_or_office(auth.uid()));


--
-- Name: booking_consents Admin/office can view consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/office can view consents" ON public.booking_consents FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: ai_knowledge_documents Admins can delete ai_knowledge_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ai_knowledge_documents" ON public.ai_knowledge_documents FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ai_configuration Admins can insert ai_configuration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_configuration" ON public.ai_configuration FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ai_knowledge_documents Admins can insert ai_knowledge_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_knowledge_documents" ON public.ai_knowledge_documents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notification_queue Admins can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert notifications" ON public.notification_queue FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: instructor_recurring_blocks Admins can manage all blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all blocks" ON public.instructor_recurring_blocks USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: ai_configuration Admins can read ai_configuration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read ai_configuration" ON public.ai_configuration FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: ai_knowledge_documents Admins can read ai_knowledge_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read ai_knowledge_documents" ON public.ai_knowledge_documents FOR SELECT USING (public.is_admin_or_office(auth.uid()));


--
-- Name: ai_configuration Admins can update ai_configuration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai_configuration" ON public.ai_configuration FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notification_queue Admins can update notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update notifications" ON public.notification_queue FOR UPDATE TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notification_queue Admins can view notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view notifications" ON public.notification_queue FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: booking_requests Anyone can create booking requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create booking requests" ON public.booking_requests FOR INSERT WITH CHECK (true);


--
-- Name: private_lesson_rates Anyone can view private lesson rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view private lesson rates" ON public.private_lesson_rates FOR SELECT USING (true);


--
-- Name: booking_requests Anyone can view requests by magic token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view requests by magic token" ON public.booking_requests FOR SELECT USING (true);


--
-- Name: skill_levels Anyone can view skill_levels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view skill_levels" ON public.skill_levels FOR SELECT USING (true);


--
-- Name: participant_level_history Authenticated can insert level_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert level_history" ON public.participant_level_history FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: participant_level_history Authenticated can update level_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update level_history" ON public.participant_level_history FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: billing_partners Authenticated can view billing partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view billing partners" ON public.billing_partners FOR SELECT TO authenticated USING (true);


--
-- Name: event_categories Authenticated can view event_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view event_categories" ON public.event_categories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: event_participants Authenticated can view event_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view event_participants" ON public.event_participants FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: events Authenticated can view events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view events" ON public.events FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: participant_level_history Authenticated can view level_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view level_history" ON public.participant_level_history FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: action_tasks Authenticated users can delete action_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete action_tasks" ON public.action_tasks FOR DELETE TO authenticated USING (true);


--
-- Name: conversations Authenticated users can delete conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete conversations" ON public.conversations FOR DELETE TO authenticated USING (true);


--
-- Name: customer_contacts Authenticated users can delete customer_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete customer_contacts" ON public.customer_contacts FOR DELETE USING (true);


--
-- Name: customers Authenticated users can delete customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);


--
-- Name: daily_task_completions Authenticated users can delete daily_task_completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete daily_task_completions" ON public.daily_task_completions FOR DELETE TO authenticated USING (true);


--
-- Name: daily_task_templates Authenticated users can delete daily_task_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete daily_task_templates" ON public.daily_task_templates FOR DELETE TO authenticated USING (true);


--
-- Name: group_course_enrollments Authenticated users can delete group_course_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete group_course_enrollments" ON public.group_course_enrollments FOR DELETE USING (true);


--
-- Name: group_course_instances Authenticated users can delete group_course_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete group_course_instances" ON public.group_course_instances FOR DELETE USING (true);


--
-- Name: group_course_schedules Authenticated users can delete group_course_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete group_course_schedules" ON public.group_course_schedules FOR DELETE USING (true);


--
-- Name: group_courses Authenticated users can delete group_courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete group_courses" ON public.group_courses FOR DELETE USING (true);


--
-- Name: groups Authenticated users can delete groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete groups" ON public.groups FOR DELETE TO authenticated USING (true);


--
-- Name: master_bookings Authenticated users can delete master_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete master_bookings" ON public.master_bookings FOR DELETE USING (true);


--
-- Name: ticket_comments Authenticated users can delete own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete own comments" ON public.ticket_comments FOR DELETE TO authenticated USING ((created_by_user_id = auth.uid()));


--
-- Name: customer_participants Authenticated users can delete participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete participants" ON public.customer_participants FOR DELETE TO authenticated USING (true);


--
-- Name: payments Authenticated users can delete payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete payments" ON public.payments FOR DELETE USING (true);


--
-- Name: ticket_item_period_metadata Authenticated users can delete period metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete period metadata" ON public.ticket_item_period_metadata FOR DELETE TO authenticated USING (true);


--
-- Name: products Authenticated users can delete products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE TO authenticated USING (true);


--
-- Name: shop_article_variants Authenticated users can delete shop_article_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete shop_article_variants" ON public.shop_article_variants FOR DELETE USING (true);


--
-- Name: shop_articles Authenticated users can delete shop_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete shop_articles" ON public.shop_articles FOR DELETE USING (true);


--
-- Name: ticket_item_overrides Authenticated users can delete ticket item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete ticket item overrides" ON public.ticket_item_overrides FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ticket_items Authenticated users can delete ticket_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete ticket_items" ON public.ticket_items FOR DELETE TO authenticated USING (true);


--
-- Name: tickets Authenticated users can delete tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (true);


--
-- Name: training_participants Authenticated users can delete training_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete training_participants" ON public.training_participants FOR DELETE TO authenticated USING (true);


--
-- Name: trainings Authenticated users can delete trainings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete trainings" ON public.trainings FOR DELETE TO authenticated USING (true);


--
-- Name: action_tasks Authenticated users can insert action_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert action_tasks" ON public.action_tasks FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: instructor_activity_log Authenticated users can insert activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert activity logs" ON public.instructor_activity_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: ticket_comments Authenticated users can insert comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert comments" ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: conversations Authenticated users can insert conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: customer_contacts Authenticated users can insert customer_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert customer_contacts" ON public.customer_contacts FOR INSERT WITH CHECK (true);


--
-- Name: customers Authenticated users can insert customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: daily_task_completions Authenticated users can insert daily_task_completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert daily_task_completions" ON public.daily_task_completions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: daily_task_templates Authenticated users can insert daily_task_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert daily_task_templates" ON public.daily_task_templates FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: group_course_enrollments Authenticated users can insert group_course_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert group_course_enrollments" ON public.group_course_enrollments FOR INSERT WITH CHECK (true);


--
-- Name: group_course_instances Authenticated users can insert group_course_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert group_course_instances" ON public.group_course_instances FOR INSERT WITH CHECK (true);


--
-- Name: group_course_schedules Authenticated users can insert group_course_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert group_course_schedules" ON public.group_course_schedules FOR INSERT WITH CHECK (true);


--
-- Name: group_courses Authenticated users can insert group_courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert group_courses" ON public.group_courses FOR INSERT WITH CHECK (true);


--
-- Name: groups Authenticated users can insert groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: master_bookings Authenticated users can insert master_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert master_bookings" ON public.master_bookings FOR INSERT WITH CHECK (true);


--
-- Name: customer_participants Authenticated users can insert participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert participants" ON public.customer_participants FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: payments Authenticated users can insert payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert payments" ON public.payments FOR INSERT WITH CHECK (true);


--
-- Name: ticket_item_period_metadata Authenticated users can insert period metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert period metadata" ON public.ticket_item_period_metadata FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: products Authenticated users can insert products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: daily_reconciliations Authenticated users can insert reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert reconciliations" ON public.daily_reconciliations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: voucher_redemptions Authenticated users can insert redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert redemptions" ON public.voucher_redemptions FOR INSERT WITH CHECK (true);


--
-- Name: shop_article_variants Authenticated users can insert shop_article_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert shop_article_variants" ON public.shop_article_variants FOR INSERT WITH CHECK (true);


--
-- Name: shop_articles Authenticated users can insert shop_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert shop_articles" ON public.shop_articles FOR INSERT WITH CHECK (true);


--
-- Name: shop_stock_movements Authenticated users can insert shop_stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert shop_stock_movements" ON public.shop_stock_movements FOR INSERT WITH CHECK (true);


--
-- Name: shop_transaction_items Authenticated users can insert shop_transaction_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert shop_transaction_items" ON public.shop_transaction_items FOR INSERT WITH CHECK (true);


--
-- Name: shop_transactions Authenticated users can insert shop_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert shop_transactions" ON public.shop_transactions FOR INSERT WITH CHECK (true);


--
-- Name: ticket_item_overrides Authenticated users can insert ticket item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert ticket item overrides" ON public.ticket_item_overrides FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ticket_history Authenticated users can insert ticket_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert ticket_history" ON public.ticket_history FOR INSERT WITH CHECK (true);


--
-- Name: ticket_items Authenticated users can insert ticket_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert ticket_items" ON public.ticket_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: tickets Authenticated users can insert tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: training_participants Authenticated users can insert training_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert training_participants" ON public.training_participants FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: trainings Authenticated users can insert trainings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert trainings" ON public.trainings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: vouchers Authenticated users can insert vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert vouchers" ON public.vouchers FOR INSERT WITH CHECK (true);


--
-- Name: private_lesson_rates Authenticated users can manage rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage rates" ON public.private_lesson_rates USING ((auth.role() = 'authenticated'::text));


--
-- Name: action_tasks Authenticated users can update action_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update action_tasks" ON public.action_tasks FOR UPDATE TO authenticated USING (true);


--
-- Name: booking_requests Authenticated users can update booking requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update booking requests" ON public.booking_requests FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: conversations Authenticated users can update conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (true);


--
-- Name: customer_contacts Authenticated users can update customer_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update customer_contacts" ON public.customer_contacts FOR UPDATE USING (true);


--
-- Name: customers Authenticated users can update customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);


--
-- Name: daily_task_templates Authenticated users can update daily_task_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update daily_task_templates" ON public.daily_task_templates FOR UPDATE TO authenticated USING (true);


--
-- Name: group_course_enrollments Authenticated users can update group_course_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update group_course_enrollments" ON public.group_course_enrollments FOR UPDATE USING (true);


--
-- Name: group_course_instances Authenticated users can update group_course_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update group_course_instances" ON public.group_course_instances FOR UPDATE USING (true);


--
-- Name: group_course_schedules Authenticated users can update group_course_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update group_course_schedules" ON public.group_course_schedules FOR UPDATE USING (true);


--
-- Name: group_courses Authenticated users can update group_courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update group_courses" ON public.group_courses FOR UPDATE USING (true);


--
-- Name: groups Authenticated users can update groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update groups" ON public.groups FOR UPDATE TO authenticated USING (true);


--
-- Name: master_bookings Authenticated users can update master_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update master_bookings" ON public.master_bookings FOR UPDATE USING (true);


--
-- Name: daily_reconciliations Authenticated users can update open reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update open reconciliations" ON public.daily_reconciliations FOR UPDATE TO authenticated USING (((status = 'open'::text) OR public.is_admin_or_office(auth.uid())));


--
-- Name: ticket_comments Authenticated users can update own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update own comments" ON public.ticket_comments FOR UPDATE TO authenticated USING ((created_by_user_id = auth.uid()));


--
-- Name: customer_participants Authenticated users can update participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update participants" ON public.customer_participants FOR UPDATE TO authenticated USING (true);


--
-- Name: payments Authenticated users can update payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update payments" ON public.payments FOR UPDATE USING (true);


--
-- Name: ticket_item_period_metadata Authenticated users can update period metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update period metadata" ON public.ticket_item_period_metadata FOR UPDATE TO authenticated USING (true);


--
-- Name: products Authenticated users can update products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);


--
-- Name: shop_article_variants Authenticated users can update shop_article_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update shop_article_variants" ON public.shop_article_variants FOR UPDATE USING (true);


--
-- Name: shop_articles Authenticated users can update shop_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update shop_articles" ON public.shop_articles FOR UPDATE USING (true);


--
-- Name: shop_transactions Authenticated users can update shop_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update shop_transactions" ON public.shop_transactions FOR UPDATE USING (true);


--
-- Name: ticket_item_overrides Authenticated users can update ticket item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update ticket item overrides" ON public.ticket_item_overrides FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ticket_items Authenticated users can update ticket_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update ticket_items" ON public.ticket_items FOR UPDATE TO authenticated USING (true);


--
-- Name: tickets Authenticated users can update tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (true);


--
-- Name: training_participants Authenticated users can update training_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update training_participants" ON public.training_participants FOR UPDATE TO authenticated USING (true);


--
-- Name: trainings Authenticated users can update trainings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update trainings" ON public.trainings FOR UPDATE TO authenticated USING (true);


--
-- Name: vouchers Authenticated users can update vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update vouchers" ON public.vouchers FOR UPDATE USING (true);


--
-- Name: action_tasks Authenticated users can view all action_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all action_tasks" ON public.action_tasks FOR SELECT TO authenticated USING (true);


--
-- Name: ticket_comments Authenticated users can view all comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all comments" ON public.ticket_comments FOR SELECT TO authenticated USING (true);


--
-- Name: conversations Authenticated users can view all conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all conversations" ON public.conversations FOR SELECT TO authenticated USING (true);


--
-- Name: customers Authenticated users can view all customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all customers" ON public.customers FOR SELECT TO authenticated USING (true);


--
-- Name: group_course_enrollments Authenticated users can view all group_course_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all group_course_enrollments" ON public.group_course_enrollments FOR SELECT USING (true);


--
-- Name: group_course_instances Authenticated users can view all group_course_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all group_course_instances" ON public.group_course_instances FOR SELECT USING (true);


--
-- Name: group_course_schedules Authenticated users can view all group_course_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all group_course_schedules" ON public.group_course_schedules FOR SELECT USING (true);


--
-- Name: group_courses Authenticated users can view all group_courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all group_courses" ON public.group_courses FOR SELECT USING (true);


--
-- Name: groups Authenticated users can view all groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all groups" ON public.groups FOR SELECT TO authenticated USING (true);


--
-- Name: customer_participants Authenticated users can view all participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all participants" ON public.customer_participants FOR SELECT TO authenticated USING (true);


--
-- Name: products Authenticated users can view all products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all products" ON public.products FOR SELECT TO authenticated USING (true);


--
-- Name: ticket_items Authenticated users can view all ticket_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all ticket_items" ON public.ticket_items FOR SELECT TO authenticated USING (true);


--
-- Name: tickets Authenticated users can view all tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all tickets" ON public.tickets FOR SELECT TO authenticated USING (true);


--
-- Name: training_participants Authenticated users can view all training_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all training_participants" ON public.training_participants FOR SELECT TO authenticated USING (true);


--
-- Name: trainings Authenticated users can view all trainings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all trainings" ON public.trainings FOR SELECT TO authenticated USING (true);


--
-- Name: capabilities Authenticated users can view capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view capabilities" ON public.capabilities FOR SELECT TO authenticated USING (true);


--
-- Name: training_course_dates Authenticated users can view course dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view course dates" ON public.training_course_dates FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: customer_contacts Authenticated users can view customer_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view customer_contacts" ON public.customer_contacts FOR SELECT USING (true);


--
-- Name: daily_task_completions Authenticated users can view daily_task_completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view daily_task_completions" ON public.daily_task_completions FOR SELECT TO authenticated USING (true);


--
-- Name: daily_task_templates Authenticated users can view daily_task_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view daily_task_templates" ON public.daily_task_templates FOR SELECT TO authenticated USING (true);


--
-- Name: instructor_capabilities Authenticated users can view instructor capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view instructor capabilities" ON public.instructor_capabilities FOR SELECT TO authenticated USING (true);


--
-- Name: master_bookings Authenticated users can view master_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view master_bookings" ON public.master_bookings FOR SELECT USING (true);


--
-- Name: office_shift_assignments Authenticated users can view office_shift_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view office_shift_assignments" ON public.office_shift_assignments FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: payments Authenticated users can view payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view payments" ON public.payments FOR SELECT USING (true);


--
-- Name: ticket_item_period_metadata Authenticated users can view period metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view period metadata" ON public.ticket_item_period_metadata FOR SELECT TO authenticated USING (true);


--
-- Name: daily_reconciliations Authenticated users can view reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view reconciliations" ON public.daily_reconciliations FOR SELECT TO authenticated USING (true);


--
-- Name: voucher_redemptions Authenticated users can view redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view redemptions" ON public.voucher_redemptions FOR SELECT USING (true);


--
-- Name: shop_article_variants Authenticated users can view shop_article_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shop_article_variants" ON public.shop_article_variants FOR SELECT USING (true);


--
-- Name: shop_articles Authenticated users can view shop_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shop_articles" ON public.shop_articles FOR SELECT USING (true);


--
-- Name: shop_stock_movements Authenticated users can view shop_stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shop_stock_movements" ON public.shop_stock_movements FOR SELECT USING (true);


--
-- Name: shop_transaction_items Authenticated users can view shop_transaction_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shop_transaction_items" ON public.shop_transaction_items FOR SELECT USING (true);


--
-- Name: shop_transactions Authenticated users can view shop_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shop_transactions" ON public.shop_transactions FOR SELECT USING (true);


--
-- Name: ticket_item_overrides Authenticated users can view ticket item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view ticket item overrides" ON public.ticket_item_overrides FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ticket_history Authenticated users can view ticket_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view ticket_history" ON public.ticket_history FOR SELECT USING (true);


--
-- Name: training_groups Authenticated users can view training_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view training_groups" ON public.training_groups FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: vouchers Authenticated users can view vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view vouchers" ON public.vouchers FOR SELECT USING (true);


--
-- Name: inventory_rentals Instructors can confirm own rentals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can confirm own rentals" ON public.inventory_rentals FOR UPDATE TO authenticated USING ((instructor_id = public.get_instructor_for_user(auth.uid()))) WITH CHECK ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: instructor_recurring_blocks Instructors can create their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can create their own blocks" ON public.instructor_recurring_blocks FOR INSERT TO authenticated WITH CHECK ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: participant_transfer_requests Instructors can create transfer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can create transfer requests" ON public.participant_transfer_requests FOR INSERT WITH CHECK ((public.get_instructor_for_user(auth.uid()) = requesting_instructor_id));


--
-- Name: inventory_items Instructors can read items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can read items" ON public.inventory_items FOR SELECT TO authenticated USING ((public.get_instructor_for_user(auth.uid()) IS NOT NULL));


--
-- Name: inventory_rental_items Instructors can read own rental items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can read own rental items" ON public.inventory_rental_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.inventory_rentals r
  WHERE ((r.id = inventory_rental_items.rental_id) AND (r.instructor_id = public.get_instructor_for_user(auth.uid()))))));


--
-- Name: inventory_rentals Instructors can read own rentals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can read own rentals" ON public.inventory_rentals FOR SELECT TO authenticated USING ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: event_participants Instructors can update opt_out; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can update opt_out" ON public.event_participants FOR UPDATE USING ((confirmed_by_instructor = public.get_instructor_for_user(auth.uid()))) WITH CHECK ((confirmed_by_instructor = public.get_instructor_for_user(auth.uid())));


--
-- Name: inventory_rental_items Instructors can update own rental items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can update own rental items" ON public.inventory_rental_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.inventory_rentals r
  WHERE ((r.id = inventory_rental_items.rental_id) AND (r.instructor_id = public.get_instructor_for_user(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.inventory_rentals r
  WHERE ((r.id = inventory_rental_items.rental_id) AND (r.instructor_id = public.get_instructor_for_user(auth.uid()))))));


--
-- Name: instructor_recurring_blocks Instructors can update their own pending blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can update their own pending blocks" ON public.instructor_recurring_blocks FOR UPDATE TO authenticated USING (((instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text))) WITH CHECK (((instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text)));


--
-- Name: instructor_activity_log Instructors can view their own activity log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can view their own activity log" ON public.instructor_activity_log FOR SELECT TO authenticated USING ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: instructor_recurring_blocks Instructors can view their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can view their own blocks" ON public.instructor_recurring_blocks FOR SELECT TO authenticated USING ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: participant_transfer_requests Instructors can view their transfer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Instructors can view their transfer requests" ON public.participant_transfer_requests FOR SELECT USING (((public.get_instructor_for_user(auth.uid()) = requesting_instructor_id) OR (public.get_instructor_for_user(auth.uid()) = ( SELECT group_course_instances.instructor_id
   FROM public.group_course_instances
  WHERE (group_course_instances.id = participant_transfer_requests.target_group_id)))));


--
-- Name: private_appointment_backfill_log No browser access to backfill log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No browser access to backfill log" ON public.private_appointment_backfill_log AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);


--
-- Name: private_appointment_submissions No client access to submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No client access to submissions" ON public.private_appointment_submissions AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);


--
-- Name: booking_email_deliveries Office and admin can view booking email deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Office and admin can view booking email deliveries" ON public.booking_email_deliveries FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: private_appointment_participants Office/admin manage appointment participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Office/admin manage appointment participants" ON public.private_appointment_participants TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: private_appointments Office/admin manage appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Office/admin manage appointments" ON public.private_appointments TO authenticated USING (public.is_admin_or_office(auth.uid())) WITH CHECK (public.is_admin_or_office(auth.uid()));


--
-- Name: product_price_tiers Price tiers are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Price tiers are viewable by everyone" ON public.product_price_tiers FOR SELECT USING (true);


--
-- Name: product_price_tiers Price tiers can be managed by admin/office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Price tiers can be managed by admin/office" ON public.product_price_tiers USING (public.is_admin_or_office(auth.uid()));


--
-- Name: participant_transfer_requests Requesting instructor can cancel requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesting instructor can cancel requests" ON public.participant_transfer_requests FOR UPDATE USING (((public.get_instructor_for_user(auth.uid()) = requesting_instructor_id) AND (status = 'pending'::text))) WITH CHECK ((status = 'canceled'::text));


--
-- Name: booking_consents Service role can insert consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert consents" ON public.booking_consents FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: ticket_number_counters Service role can manage ticket number counters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage ticket number counters" ON public.ticket_number_counters TO service_role USING (true) WITH CHECK (true);


--
-- Name: entity_merges Staff can view merges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view merges" ON public.entity_merges FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));


--
-- Name: bc_product_tariff_sources Staff read BC tariff evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read BC tariff evidence" ON public.bc_product_tariff_sources FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: participant_transfer_requests Target instructor can respond to requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Target instructor can respond to requests" ON public.participant_transfer_requests FOR UPDATE USING (((public.get_instructor_for_user(auth.uid()) = ( SELECT group_course_instances.instructor_id
   FROM public.group_course_instances
  WHERE (group_course_instances.id = participant_transfer_requests.target_group_id))) AND (status = 'pending'::text))) WITH CHECK ((status = ANY (ARRAY['accepted'::text, 'rejected'::text])));


--
-- Name: private_appointment_participants Teachers read own appointment participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers read own appointment participants" ON public.private_appointment_participants FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.private_appointments pa
  WHERE ((pa.id = private_appointment_participants.appointment_id) AND (pa.instructor_id = public.get_instructor_for_user(auth.uid()))))));


--
-- Name: private_appointments Teachers view own appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view own appointments" ON public.private_appointments FOR SELECT TO authenticated USING ((instructor_id = public.get_instructor_for_user(auth.uid())));


--
-- Name: notification_preferences Users can manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own preferences" ON public.notification_preferences USING ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_office(auth.uid())));


--
-- Name: instructor_absences absence_staff_or_own_pending_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_staff_or_own_pending_delete ON public.instructor_absences FOR DELETE TO authenticated USING ((public.is_staff(auth.uid()) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text) AND (created_by = auth.uid()) AND (requested_by = auth.uid()))));


--
-- Name: instructor_absences absence_staff_or_own_pending_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_staff_or_own_pending_insert ON public.instructor_absences FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text) AND (created_by = auth.uid()) AND (requested_by = auth.uid()) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (rejection_reason IS NULL))));


--
-- Name: instructor_absences absence_staff_or_own_pending_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_staff_or_own_pending_update ON public.instructor_absences FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text) AND (created_by = auth.uid()) AND (requested_by = auth.uid())))) WITH CHECK ((public.is_staff(auth.uid()) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (instructor_id = public.get_instructor_for_user(auth.uid())) AND (status = 'pending'::text) AND (created_by = auth.uid()) AND (requested_by = auth.uid()) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (rejection_reason IS NULL))));


--
-- Name: instructor_absences absence_staff_or_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_staff_or_own_select ON public.instructor_absences FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (instructor_id = public.get_instructor_for_user(auth.uid())))));


--
-- Name: action_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_configuration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_configuration ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_hr_private bc_hr_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_hr_super_admin_select ON public.instructor_hr_private FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: instructor_import_ledger bc_ledger_super_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_ledger_super_admin_read ON public.instructor_import_ledger FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: instructor_source_links bc_links_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_links_super_admin_select ON public.instructor_source_links FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: instructor_photos bc_photos_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_photos_staff_select ON public.instructor_photos FOR SELECT TO authenticated USING ((public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())));


--
-- Name: bc_product_tariff_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bc_product_tariff_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_import_runs bc_runs_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_runs_super_admin_select ON public.instructor_import_runs FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: instructor_deployment_windows bc_windows_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_windows_staff_select ON public.instructor_deployment_windows FOR SELECT TO authenticated USING ((public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())));


--
-- Name: billing_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_cancellations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_email_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_email_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: cancellation_policy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cancellation_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: closure_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.closure_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_credit_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_credit_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_task_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_task_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_merges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_merges ENABLE ROW LEVEL SECURITY;

--
-- Name: event_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: instructors gate_a_instructors_directory_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gate_a_instructors_directory_select ON public.instructors FOR SELECT TO authenticated USING (true);


--
-- Name: instructor_recurring_blocks gate_a_recurring_blocks_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gate_a_recurring_blocks_staff_read ON public.instructor_recurring_blocks FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: group_course_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_course_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: group_course_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_course_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: group_course_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_course_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: group_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: high_season_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.high_season_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_live_status ils_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ils_select_auth ON public.instructor_live_status FOR SELECT TO authenticated USING (true);


--
-- Name: instructor_absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_absences ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_deployment_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_deployment_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_hr_private; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_hr_private ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_import_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_import_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_import_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_import_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_import_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_import_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_live_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_live_status ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_notification_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_notification_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_recurring_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_recurring_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_source_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_source_links ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_test_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_test_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_user_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructor_user_links ENABLE ROW LEVEL SECURITY;

--
-- Name: instructors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_rental_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_rental_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_rentals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_rentals ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: instructor_user_links iul_select_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iul_select_own_or_staff ON public.instructor_user_links FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_staff(auth.uid())));


--
-- Name: master_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: office_hour_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.office_hour_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: office_shift_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.office_shift_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: participant_level_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participant_level_history ENABLE ROW LEVEL SECURITY;

--
-- Name: participant_transfer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participant_transfer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: private_appointment_backfill_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_appointment_backfill_log ENABLE ROW LEVEL SECURITY;

--
-- Name: private_appointment_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_appointment_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: private_appointment_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_appointment_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: private_appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: private_lesson_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_lesson_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_price_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: school_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_article_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_article_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_transaction_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_transaction_items ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_item_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_item_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_item_period_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_item_period_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_number_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_number_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: training_course_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_course_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: training_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: training_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: trainings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: voucher_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


