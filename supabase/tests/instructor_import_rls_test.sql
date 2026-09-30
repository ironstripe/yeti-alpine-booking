-- RLS test for Booking-Corner import tables and private portrait bucket. Synthetic rows only; always rolled back.
-- Run: psql "$PRIVILEGED_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/instructor_import_rls_test.sql
-- Success = final line "RLS_ALL_PASSED" printed as NOTICE, then ROLLBACK.
BEGIN;
DO $$
DECLARE
  v_instr uuid; v_run uuid; v_super uuid; v_office uuid; v_teacher uuid; n int;
  t text;
  tbls text[] := ARRAY['instructor_hr_private','instructor_source_links','instructor_import_runs','instructor_deployment_windows','instructor_photos'];
BEGIN
  SELECT user_id INTO v_super FROM user_roles WHERE role::text='super_admin' LIMIT 1;
  SELECT user_id INTO v_office FROM user_roles r WHERE role='office'
    AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=r.user_id AND x.role::text = 'super_admin') LIMIT 1;
  SELECT user_id INTO v_teacher FROM user_roles r WHERE role='teacher'
    AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=r.user_id AND x.role::text IN ('admin','office','super_admin')) LIMIT 1;
  IF v_super IS NULL OR v_office IS NULL OR v_teacher IS NULL THEN RAISE EXCEPTION 'FAIL missing test users'; END IF;

  INSERT INTO instructors(first_name,last_name) VALUES ('RLS','Synthetic') RETURNING id INTO v_instr;
  INSERT INTO instructor_import_runs(source_system,rollout,xlsx_sha256,created_by) VALUES ('test','test','x',v_super) RETURNING id INTO v_run;
  INSERT INTO instructor_import_staging(run_id,source_id,classification,confidence,source_checksum,normalized) VALUES (v_run,'T1','create','high','c','{}');
  INSERT INTO instructor_source_links(source_system,rollout,source_id,instructor_id,source_checksum) VALUES ('test','test','T1',v_instr,'c');
  INSERT INTO instructor_hr_private(instructor_id,wage_raw,bank_raw,ahv_raw) VALUES (v_instr,'w','b','a');
  INSERT INTO instructor_deployment_windows(instructor_id,valid_from,valid_until,source) VALUES (v_instr,'2026-12-01','2027-04-15','booking_corner');
  INSERT INTO instructor_photos(instructor_id,storage_path,origin) VALUES (v_instr,'test/rls.jpg','booking_import');
  INSERT INTO storage.objects(bucket_id,name) VALUES ('instructor-hr-photos','test/rls.jpg');

  -- guard: public bucket path refused
  BEGIN
    INSERT INTO instructor_photos(instructor_id,storage_path,origin,is_current) VALUES (v_instr,'instructor-avatars/x.jpg','manual_upload',false);
    RAISE EXCEPTION 'FAIL guard allowed public path';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'photo_must_use_private_bucket' THEN RAISE; END IF;
  END;


  -- super_admin: sees all five + photo object; staging never
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_super,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- period gating
  IF NOT instructor_is_deployed(v_instr,'2027-01-10') THEN RAISE EXCEPTION 'FAIL inside window'; END IF;
  IF instructor_is_deployed(v_instr,'2026-10-01') THEN RAISE EXCEPTION 'FAIL outside window'; END IF;
  IF instructor_is_deployed(v_instr,'2021-01-10') THEN RAISE EXCEPTION 'FAIL historic'; END IF;
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n < 1 THEN RAISE EXCEPTION 'FAIL super_admin cannot read %', t; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='instructor-hr-photos' AND name='test/rls.jpg';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL super_admin photo'; END IF;
  BEGIN PERFORM 1 FROM instructor_import_staging; RAISE EXCEPTION 'FAIL staging readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO instructor_hr_private(instructor_id) VALUES (gen_random_uuid()); RAISE EXCEPTION 'FAIL super_admin client write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- office (no pure office account exists; uses office+admin without super_admin): HR/links/runs hidden; windows visible
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_office,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM instructor_hr_private; IF n <> 0 THEN RAISE EXCEPTION 'FAIL office hr'; END IF;
  SELECT count(*) INTO n FROM instructor_source_links; IF n <> 0 THEN RAISE EXCEPTION 'FAIL office links'; END IF;
  SELECT count(*) INTO n FROM instructor_import_runs; IF n <> 0 THEN RAISE EXCEPTION 'FAIL office runs'; END IF;
  SELECT count(*) INTO n FROM instructor_deployment_windows WHERE instructor_id=v_instr; IF n <> 1 THEN RAISE EXCEPTION 'FAIL office windows'; END IF;
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES ('instructor-hr-photos','test/office.jpg'); RAISE EXCEPTION 'FAIL office upload';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  RESET ROLE;

  -- teacher: nothing
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_teacher,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL teacher reads %', t; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='instructor-hr-photos'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL teacher photo'; END IF;
  RESET ROLE;

  -- anon: nothing
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  FOREACH t IN ARRAY tbls LOOP
    BEGIN EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n; RAISE EXCEPTION 'FAIL anon reads %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='instructor-hr-photos'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL anon photo'; END IF;
  RESET ROLE;

  RAISE NOTICE 'RLS_ALL_PASSED';
END $$;
ROLLBACK;
