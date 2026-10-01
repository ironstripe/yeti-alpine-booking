-- Security Gate A role test. Run AFTER the lock migration:
--   psql "$PRIVILEGED_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/gate_a_instructors_rls_test.sql
-- Everything runs in one transaction and ends with ROLLBACK (no data, role or row persists).
-- Prints GATE_A_ALL_PASSED on success; any failed assertion aborts with an exception.
-- Uses existing accounts only as JWT subjects (no auth writes). A standalone super_admin is
-- simulated by a temporary user_roles row for an account without roles, rolled back at the end.

BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM auth.users WHERE email = 'ivo.streiff71@gmail.com') AS teacher,     -- teacher only
  (SELECT id FROM auth.users WHERE email = 'vs.mueller@gmx.at')        AS admin_only,  -- admin only
  (SELECT id FROM auth.users WHERE email = 'hheinerj@hotmail.com')     AS office,      -- admin+office
  (SELECT id FROM auth.users WHERE email = 'minimaroni@yahoo.de')      AS sa_only,     -- no roles -> temp super_admin
  (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t) AS hash_before,
  (SELECT count(*) FROM public.instructors WHERE show_on_website AND status = 'active') AS team_before;
GRANT SELECT ON ids TO authenticated, anon;

INSERT INTO public.user_roles(user_id, role) SELECT sa_only, 'super_admin' FROM ids;

CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok (denied): %', label; RETURN; END;
  RAISE EXCEPTION 'FAIL: expected denial: %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_pass(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE NOTICE 'ok: %', label; END $$;

DO $$
DECLARE t uuid; own uuid; other uuid; n int;
BEGIN
  SELECT teacher INTO t FROM ids;
  PERFORM pg_temp.as_user(t);
  own := public.get_instructor_for_user(t);
  SELECT id INTO other FROM public.instructors WHERE id IS DISTINCT FROM own LIMIT 1;

  -- Teacher: sensitive columns never readable directly
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructors', 'teacher select *');
  PERFORM pg_temp.must_fail('SELECT email FROM public.instructors', 'teacher email');
  PERFORM pg_temp.must_fail('SELECT phone FROM public.instructors', 'teacher phone');
  PERFORM pg_temp.must_fail('SELECT birth_date FROM public.instructors', 'teacher birth_date');
  PERFORM pg_temp.must_fail('SELECT street, zip, city, country FROM public.instructors', 'teacher address');
  PERFORM pg_temp.must_fail('SELECT hourly_rate FROM public.instructors', 'teacher hourly_rate');
  PERFORM pg_temp.must_fail('SELECT iban, bank_name, ahv_number FROM public.instructors', 'teacher bank/ahv');
  PERFORM pg_temp.must_fail('SELECT notes, entry_date FROM public.instructors', 'teacher notes/entry');
  PERFORM pg_temp.must_fail($q$SELECT 1 FROM public.instructors WHERE email ILIKE '%a%'$q$, 'teacher filter on email');
  PERFORM pg_temp.must_fail('SELECT ti.id, i.email FROM public.ticket_items ti JOIN public.instructors i ON i.id = ti.instructor_id', 'teacher join email');
  -- Teacher: directory of all instructors works (schedule needs names)
  SELECT count(*) INTO n FROM (SELECT id, first_name, last_name, status FROM public.instructors) s;
  IF n < 2 THEN RAISE EXCEPTION 'FAIL: teacher directory'; END IF;
  -- Teacher: staff/pay RPCs forbidden
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructors_ops_list()', 'teacher ops_list');
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructors_pay_list()', 'teacher pay_list');
  PERFORM pg_temp.must_fail(format($q$SELECT public.instructor_ops_upsert('{"id":"%s","notes":"x"}')$q$, other), 'teacher ops_upsert foreign');
  PERFORM pg_temp.must_fail(format($q$SELECT public.instructor_delete('%s')$q$, other), 'teacher delete via rpc');
  -- Teacher: no direct writes
  PERFORM pg_temp.must_fail(format($q$UPDATE public.instructors SET first_name = first_name WHERE id = '%s'$q$, other), 'teacher direct update');
  PERFORM pg_temp.must_fail(format($q$DELETE FROM public.instructors WHERE id = '%s'$q$, other), 'teacher direct delete');
  PERFORM pg_temp.must_fail($q$INSERT INTO public.instructors(first_name, last_name) VALUES ('x','y')$q$, 'teacher direct insert');
  -- Teacher: own profile
  IF own IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.instructor_self();
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: instructor_self count %', n; END IF;
    PERFORM pg_temp.must_pass($q$SELECT public.instructor_self_update('{"phone":"+41 79 000 00 00"}')$q$, 'teacher own phone');
    PERFORM pg_temp.must_fail($q$SELECT public.instructor_self_update('{"email":"x@y.z"}')$q$, 'teacher own email');
    PERFORM pg_temp.must_fail($q$SELECT public.instructor_self_update('{"hourly_rate":99}')$q$, 'teacher own pay');
    PERFORM pg_temp.must_fail($q$SELECT public.instructor_self_update('{"show_on_website":true}')$q$, 'teacher own website flag');
  ELSE
    RAISE NOTICE 'SKIP: teacher account has no linked instructor';
  END IF;
  -- Teacher: HR / import / photos
  SELECT count(*) INTO n FROM public.instructor_hr_private;      IF n <> 0 THEN RAISE EXCEPTION 'FAIL hr'; END IF;
  SELECT count(*) INTO n FROM public.instructor_import_runs;     IF n <> 0 THEN RAISE EXCEPTION 'FAIL runs'; END IF;
  SELECT count(*) INTO n FROM public.instructor_source_links;    IF n <> 0 THEN RAISE EXCEPTION 'FAIL links'; END IF;
  SELECT count(*) INTO n FROM public.instructor_photos;          IF n <> 0 THEN RAISE EXCEPTION 'FAIL photos'; END IF;
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructor_import_staging', 'teacher staging');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id IN ('instructor-hr-photos','instructor-import-sources');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL private buckets visible'; END IF;
  PERFORM pg_temp.must_fail($q$INSERT INTO storage.objects(bucket_id, name) VALUES ('instructor-avatars','gate-a-test.jpg')$q$, 'teacher avatar upload');
  -- Teacher: realtime table exposes only id/status/timestamp
  PERFORM pg_temp.must_pass('SELECT instructor_id, real_time_status, updated_at FROM public.instructor_live_status', 'teacher live status');
  RESET ROLE;
END $$;

-- Office / admin: approved personnel fields yes, pay/bank/AHV no
DO $$
DECLARE u uuid; x uuid; n int;
BEGIN
  FOR u IN SELECT unnest(ARRAY[office, admin_only]) FROM ids LOOP
    PERFORM pg_temp.as_user(u);
    PERFORM pg_temp.must_pass('SELECT email, phone, street, zip, city, country, birth_date, entry_date, notes FROM public.instructors_ops_list()', 'staff ops_list personnel');
    PERFORM pg_temp.must_fail('SELECT hourly_rate FROM public.instructors', 'staff direct hourly_rate');
    PERFORM pg_temp.must_fail('SELECT iban FROM public.instructors', 'staff direct iban');
    PERFORM pg_temp.must_fail('SELECT * FROM public.instructors', 'staff select *');
    PERFORM pg_temp.must_fail('SELECT * FROM public.instructors_pay_list()', 'staff pay_list');
    PERFORM pg_temp.must_fail($q$SELECT public.instructor_ops_upsert('{"first_name":"T","last_name":"T","hourly_rate":30}')$q$, 'staff upsert with pay');
    SELECT count(*) INTO n FROM public.instructor_hr_private; IF n <> 0 THEN RAISE EXCEPTION 'FAIL staff hr'; END IF;
    x := public.instructor_ops_upsert('{"first_name":"Gate","last_name":"ATest","notes":"n","birth_date":"1990-01-01","street":"S"}');
    PERFORM public.instructor_ops_upsert(jsonb_build_object('id', x, 'notes', 'n2', 'phone', '+41 79 111 11 11'));
    PERFORM public.instructor_delete(x);
    RAISE NOTICE 'ok: staff create (no hourly_rate) / edit personnel / delete';
    RESET ROLE;
  END LOOP;
END $$;

-- Standalone super_admin (no admin/office)
DO $$
DECLARE u uuid; x uuid;
BEGIN
  SELECT sa_only INTO u FROM ids;
  PERFORM pg_temp.as_user(u);
  PERFORM pg_temp.must_pass('SELECT * FROM public.instructors_ops_list()', 'super_admin ops_list');
  PERFORM pg_temp.must_pass('SELECT * FROM public.instructors_pay_list()', 'super_admin pay_list');
  PERFORM pg_temp.must_pass('SELECT * FROM public.instructor_hr_private', 'super_admin hr');
  PERFORM pg_temp.must_pass('SELECT * FROM public.instructor_import_runs', 'super_admin runs');
  x := public.instructor_ops_upsert('{"first_name":"Gate","last_name":"SA"}');
  PERFORM public.instructor_pay_update(x, '{"hourly_rate":35,"iban":"CH00"}');
  PERFORM public.instructor_delete(x);
  RAISE NOTICE 'ok: super_admin create / pay update / delete';
  RESET ROLE;
END $$;

-- Anonymous
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail('SELECT id FROM public.instructors', 'anon directory');
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructors_ops_list()', 'anon ops_list');
  PERFORM pg_temp.must_fail('SELECT * FROM public.instructor_live_status', 'anon live status');
  RESET ROLE;
END $$;

-- Structure + no row/flag changes
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'instructors';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: instructors still in realtime'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema='public' AND table_name='instructor_live_status';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: live status column count %', n; END IF;
  IF (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t) <> (SELECT hash_before FROM ids)
    THEN RAISE EXCEPTION 'FAIL: instructor rows changed (outside rolled-back test writes)'; END IF;
  IF (SELECT count(*) FROM public.instructors WHERE show_on_website AND status='active') <> (SELECT team_before FROM ids)
    THEN RAISE EXCEPTION 'FAIL: public team count changed'; END IF;
END $$;

SELECT 'GATE_A_ALL_PASSED' AS result;
ROLLBACK;
