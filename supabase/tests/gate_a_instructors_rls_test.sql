-- Security Gate A role test – executable in the Lovable Cloud SQL editor (runs as postgres).
-- Self-contained: BEGIN → if the lock is not live yet, applies it INSIDE the transaction
-- (mode=simulated_lock_rolled_back); after the real lock it tests the live state (mode=live_lock) → probes each real
-- role via SET LOCAL ROLE + request.jwt.claims → prints a result table → ROLLBACK.
-- Nothing persists: no lock, no role change, no row change. Identities are picked from the
-- CURRENT user_roles rows (no role is added/removed to fake a pass). If a required identity
-- does not exist, its probes report 'UNAVAILABLE' and Gate A must be reported incomplete.
-- Fixtures: two synthetic instructors (inactive, not on website) plus one synthetic row each in
-- source links, HR private, an import run/staging row and a private HR photo object. Every write probe
-- and the delete probe target only these fixtures; real instructors are never written or deleted.
-- Every private-read denial has a positive CONTROL on the same fixture row: if the control fails,
-- the denial is unproven and the run must be reported UNVERIFIED, not PASS.
-- Counts are relative to the in-transaction baseline (no hardcoded 31/14/2).
-- Pass criterion: every row has pass = true. Office probes use any real office account and
-- super_admin probes any real super_admin account (today none is office-only or standalone).

BEGIN;
-- scratch schema for helpers/results (created inside the transaction, rolled back)
CREATE SCHEMA gate_a_test;

-- ---------- fingerprint before ----------
CREATE TABLE gate_a_test.fp AS SELECT
  (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t) AS rows_hash,
  (SELECT count(*) FROM public.instructors) AS n_instructors,
  (SELECT md5(string_agg(user_id::text||role::text, ',' ORDER BY user_id, role)) FROM public.user_roles) AS roles_hash,
  (SELECT count(*) FROM public.user_roles) AS n_roles,
  (SELECT count(*) FROM public.instructors WHERE show_on_website AND status = 'active') AS team;

-- ---------- pending lock (identical to supabase/pending/gate_a_instructors_lock.sql) ----------
-- ---------- lock: applied in-transaction ONLY if not already live (pre-lock simulation) ----------
CREATE TABLE gate_a_test.mode(m text);
DO $lock$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='instructors'
             AND policyname='gate_a_instructors_directory_select') THEN
    INSERT INTO gate_a_test.mode VALUES ('live_lock');
  ELSE
    INSERT INTO gate_a_test.mode VALUES ('simulated_lock_rolled_back');
    EXECUTE $sql$
DROP POLICY IF EXISTS "Authenticated users can view all instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can insert instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can update instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can delete instructors" ON public.instructors;
CREATE POLICY "gate_a_instructors_directory_select" ON public.instructors FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.instructors FROM authenticated;
REVOKE ALL ON public.instructors FROM anon;
GRANT SELECT (id, created_at, first_name, last_name, level, specialization, status, real_time_status,
  languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser)
  ON public.instructors TO authenticated;
ALTER PUBLICATION supabase_realtime DROP TABLE public.instructors;
ALTER TABLE public.instructors REPLICA IDENTITY DEFAULT;
DROP POLICY IF EXISTS "Authenticated users can upload instructor avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update instructor avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete instructor avatars" ON storage.objects;
CREATE POLICY "gate_a_avatars_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));
CREATE POLICY "gate_a_avatars_staff_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));
CREATE POLICY "gate_a_avatars_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));

-- ---------- identities from real roles ----------
    $sql$;
  END IF;
END $lock$;

CREATE TABLE gate_a_test.who AS
WITH r AS (SELECT user_id, array_agg(role::text) rs FROM public.user_roles GROUP BY user_id)
SELECT
  (SELECT r.user_id FROM r JOIN public.instructor_user_links l USING (user_id) WHERE rs = ARRAY['teacher'] LIMIT 1) AS teacher,
  (SELECT user_id FROM r WHERE 'office' = ANY(rs) AND NOT rs && ARRAY['admin','super_admin'] LIMIT 1) AS office,
  (SELECT user_id FROM r WHERE 'admin' = ANY(rs) AND NOT rs && ARRAY['office','super_admin'] LIMIT 1) AS admin,
  (SELECT user_id FROM r WHERE 'super_admin' = ANY(rs) AND NOT rs && ARRAY['admin','office'] LIMIT 1) AS sa_only,
  (SELECT user_id FROM r WHERE 'super_admin' = ANY(rs) LIMIT 1) AS sa_any,
  (SELECT user_id FROM r WHERE 'office' = ANY(rs) AND NOT 'super_admin' = ANY(rs) LIMIT 1) AS office_any;

-- ---------- synthetic fixtures (inserted as postgres, rolled back; no real record is written) ----------
CREATE TABLE gate_a_test.fx AS SELECT gen_random_uuid() AS ins, gen_random_uuid() AS ins_del, gen_random_uuid() AS run;
INSERT INTO public.instructors(id, first_name, last_name, status, show_on_website)
  SELECT ins, 'GateA', 'Fixture', 'inactive', false FROM gate_a_test.fx
  UNION ALL SELECT ins_del, 'GateA', 'DeleteFixture', 'inactive', false FROM gate_a_test.fx;
INSERT INTO public.instructor_import_runs(id, source_system, rollout, xlsx_sha256, created_by)
  SELECT run, 'gate_a_test', 'test', 'x', (SELECT sa_any FROM gate_a_test.who) FROM gate_a_test.fx;
INSERT INTO public.instructor_source_links(source_system, rollout, source_id, instructor_id, source_checksum)
  SELECT 'gate_a_test', 'test', 'fx-1', ins, 'x' FROM gate_a_test.fx;
INSERT INTO public.instructor_hr_private(instructor_id, wage_raw) SELECT ins, 'synthetic' FROM gate_a_test.fx;
INSERT INTO public.instructor_import_staging(run_id, source_id, classification, confidence, source_checksum, normalized)
  SELECT run, 'fx-1', 'create', 'high', 'x', '{}'::jsonb FROM gate_a_test.fx;
INSERT INTO storage.objects(bucket_id, name) VALUES ('instructor-hr-photos', 'gate-a-test/fixture.jpg');

CREATE TABLE gate_a_test.res(n serial, actor text, test text, expect text, got text);

CREATE FUNCTION gate_a_test.probe(uid uuid, r text, q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF r = 'authenticated' AND uid IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', r)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', r);
    EXECUTE q;
    EXECUTE 'RESET ROLE';
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    -- only a genuine refusal counts: privilege/RLS/role check (42501) or an empty result
    -- from an RLS-filtered read ('assert'). Anything else (typo, missing object) is an error.
    IF SQLSTATE = '42501' OR SQLERRM = 'assert' THEN RETURN 'denied'; END IF;
    RETURN 'error:' || SQLSTATE || ' ' || left(SQLERRM, 80);
  END;
END $$;

CREATE FUNCTION gate_a_test.t(actor text, test text, expect text, q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid; r text := 'authenticated';
BEGIN
  IF actor = 'anon' THEN r := 'anon';
  ELSIF actor = 'service' THEN r := 'service_role';
  ELSE EXECUTE format('SELECT %I FROM gate_a_test.who', actor) INTO uid; END IF;
  INSERT INTO gate_a_test.res(actor, test, expect, got) VALUES (actor, test, expect, gate_a_test.probe(uid, r, q));
  EXECUTE 'RESET ROLE';
END $$;

-- helpers used inside probes (assert → error when false)
CREATE FUNCTION gate_a_test.must(b boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF b IS NOT TRUE THEN RAISE EXCEPTION 'assert'; END IF; END $$;
GRANT USAGE ON SCHEMA gate_a_test TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gate_a_test TO authenticated, anon, service_role;
GRANT SELECT ON gate_a_test.fp, gate_a_test.fx TO authenticated, anon, service_role;

DO $$
DECLARE other uuid; own uuid;
BEGIN
  own := public.get_instructor_for_user((SELECT teacher FROM gate_a_test.who));
  other := (SELECT ins FROM gate_a_test.fx);  -- writes only ever target the synthetic fixture

  -- Teacher: negative
  PERFORM gate_a_test.t('teacher','select *','denied','SELECT * FROM public.instructors');
  PERFORM gate_a_test.t('teacher','email','denied','SELECT email FROM public.instructors');
  PERFORM gate_a_test.t('teacher','phone','denied','SELECT phone FROM public.instructors');
  PERFORM gate_a_test.t('teacher','birth_date','denied','SELECT birth_date FROM public.instructors');
  PERFORM gate_a_test.t('teacher','address','denied','SELECT street, zip, city, country FROM public.instructors');
  PERFORM gate_a_test.t('teacher','notes/entry_date','denied','SELECT notes, entry_date FROM public.instructors');
  PERFORM gate_a_test.t('teacher','hourly_rate','denied','SELECT hourly_rate FROM public.instructors');
  PERFORM gate_a_test.t('teacher','bank/iban/ahv','denied','SELECT bank_name, iban, ahv_number FROM public.instructors');
  PERFORM gate_a_test.t('teacher','filter on email','denied',$q$SELECT 1 FROM public.instructors WHERE email ILIKE '%a%'$q$);
  PERFORM gate_a_test.t('teacher','join email via ticket_items','denied','SELECT i.email FROM public.ticket_items ti JOIN public.instructors i ON i.id = ti.instructor_id');
  PERFORM gate_a_test.t('teacher','ops_list RPC','denied','SELECT * FROM public.instructors_ops_list(NULL)');
  PERFORM gate_a_test.t('teacher','pay_list RPC','denied','SELECT * FROM public.instructors_pay_list(NULL)');
  PERFORM gate_a_test.t('teacher','direct UPDATE other','denied',format($q$UPDATE public.instructors SET first_name = first_name WHERE id = %L$q$, other));
  PERFORM gate_a_test.t('teacher','direct UPDATE own','denied',format($q$UPDATE public.instructors SET first_name = first_name WHERE id = %L$q$, own));
  PERFORM gate_a_test.t('teacher','direct DELETE','denied',format($q$DELETE FROM public.instructors WHERE id = %L$q$, other));
  PERFORM gate_a_test.t('teacher','direct INSERT','denied',$q$INSERT INTO public.instructors(first_name,last_name) VALUES ('x','y')$q$);
  PERFORM gate_a_test.t('teacher','ops_upsert other','denied',format($q$SELECT public.instructor_ops_upsert(jsonb_build_object('id',%L,'first_name','x'))$q$, other));
  PERFORM gate_a_test.t('teacher','instructor_delete','denied',format($q$SELECT public.instructor_delete(%L)$q$, other));
  PERFORM gate_a_test.t('teacher','self_update email','denied',$q$SELECT public.instructor_self_update('{"email":"x@example.invalid"}')$q$);
  PERFORM gate_a_test.t('teacher','self_update hourly_rate','denied',$q$SELECT public.instructor_self_update('{"hourly_rate":99}')$q$);
  -- private HR reads: probe the synthetic fixture row; a positive control proves the row is visible to an allowed role
  PERFORM gate_a_test.t('teacher','HR source links (fixture)','denied','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_source_links WHERE instructor_id = (SELECT ins FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('sa_any','CONTROL HR source links (fixture)','ok','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_source_links WHERE instructor_id = (SELECT ins FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('teacher','HR private (fixture)','denied','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_hr_private WHERE instructor_id = (SELECT ins FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('office_any','HR private (fixture)','denied','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_hr_private WHERE instructor_id = (SELECT ins FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('sa_any','CONTROL HR private (fixture)','ok','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_hr_private WHERE instructor_id = (SELECT ins FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('teacher','import staging (fixture)','denied','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_import_staging WHERE run_id = (SELECT run FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('service','CONTROL import staging (fixture)','ok','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_import_staging WHERE run_id = (SELECT run FROM gate_a_test.fx)');
  PERFORM gate_a_test.t('teacher','private HR photo object (fixture)','denied',$q$SELECT gate_a_test.must(count(*) = 1) FROM storage.objects WHERE bucket_id = 'instructor-hr-photos' AND name = 'gate-a-test/fixture.jpg'$q$);
  PERFORM gate_a_test.t('admin','CONTROL private HR photo object (fixture)','ok',$q$SELECT gate_a_test.must(count(*) = 1) FROM storage.objects WHERE bucket_id = 'instructor-hr-photos' AND name = 'gate-a-test/fixture.jpg'$q$);
  PERFORM gate_a_test.t('teacher','public avatar upload','denied',$q$INSERT INTO storage.objects(bucket_id, name) VALUES ('instructor-avatars','gate-a-probe.jpg')$q$);
  -- Teacher: positive
  PERFORM gate_a_test.t('teacher','directory (all names)','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM (SELECT id, first_name, last_name, status, real_time_status FROM public.instructors) s');
  PERFORM gate_a_test.t('teacher','own profile instructor_self','ok','SELECT gate_a_test.must(count(*) = 1) FROM public.instructor_self()');
  PERFORM gate_a_test.t('teacher','self_update phone','ok',$q$SELECT public.instructor_self_update(jsonb_build_object('phone', (SELECT phone FROM public.instructor_self())))$q$);
  PERFORM gate_a_test.t('teacher','live status feed','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM public.instructor_live_status');

  -- Office / Admin / standalone super_admin
  PERFORM gate_a_test.t('office_any','ops_list incl. personnel','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM (SELECT email, phone, street, zip, city, country, birth_date, entry_date, notes FROM public.instructors_ops_list(NULL)) s');
  PERFORM gate_a_test.t('office_any','pay_list','denied','SELECT * FROM public.instructors_pay_list(NULL)');
  PERFORM gate_a_test.t('office_any','direct hourly_rate','denied','SELECT hourly_rate FROM public.instructors');
  PERFORM gate_a_test.t('office_any','ops_upsert personnel (no wage)','ok',format($q$SELECT public.instructor_ops_upsert(jsonb_build_object('id',%L,'notes',(SELECT notes FROM public.instructors_ops_list(%L))))$q$, other, other));
  PERFORM gate_a_test.t('office_any','ops_upsert with iban','denied',format($q$SELECT public.instructor_ops_upsert(jsonb_build_object('id',%L,'iban','CH00'))$q$, other));
  PERFORM gate_a_test.t('office_any','pay_update','denied',format($q$SELECT public.instructor_pay_update(%L,'{"hourly_rate":1}')$q$, other));
  PERFORM gate_a_test.t('admin','ops_list incl. personnel','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM (SELECT email, birth_date, notes FROM public.instructors_ops_list(NULL)) s');
  PERFORM gate_a_test.t('admin','pay_list','denied','SELECT * FROM public.instructors_pay_list(NULL)');
  PERFORM gate_a_test.t('admin','ops_upsert with hourly_rate','denied',format($q$SELECT public.instructor_ops_upsert(jsonb_build_object('id',%L,'hourly_rate',1))$q$, other));
  PERFORM gate_a_test.t('admin','public avatar upload','ok',$q$INSERT INTO storage.objects(bucket_id, name) VALUES ('instructor-avatars','gate-a-probe-admin.jpg')$q$);
  PERFORM gate_a_test.t('sa_any','ops_list','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM public.instructors_ops_list(NULL)');
  PERFORM gate_a_test.t('sa_any','pay_list','ok','SELECT gate_a_test.must(count(*) = (SELECT n_instructors + 2 FROM gate_a_test.fp)) FROM public.instructors_pay_list(NULL)');
  PERFORM gate_a_test.t('sa_any','pay_update (rolled back)','ok',format($q$SELECT public.instructor_pay_update(%L, jsonb_build_object('hourly_rate',(SELECT hourly_rate FROM public.instructors_pay_list(%L))))$q$, other, other));

  -- Anonymous
  PERFORM gate_a_test.t('anon','select id','denied','SELECT id FROM public.instructors');
  PERFORM gate_a_test.t('anon','ops_list','denied','SELECT * FROM public.instructors_ops_list(NULL)');
  PERFORM gate_a_test.t('anon','live status','denied','SELECT gate_a_test.must(count(*) > 0) FROM public.instructor_live_status');

  -- Public Team API path (Edge Function uses service_role)
  PERFORM gate_a_test.t('service','public Team read','ok',$q$SELECT gate_a_test.must(count(*) = (SELECT team FROM gate_a_test.fp)) FROM public.instructors WHERE status='active' AND show_on_website$q$);
  -- fingerprint after all non-destructive probes (before the delete probe)
  INSERT INTO gate_a_test.res(actor,test,expect,got)
  SELECT 'system','fingerprint: real rows/roles/flags identical to baseline (if changed: concurrent edit, re-run)','ok',
    CASE WHEN f.rows_hash = (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t
                             WHERE t.id NOT IN (SELECT ins FROM gate_a_test.fx UNION ALL SELECT ins_del FROM gate_a_test.fx))
          AND f.team = (SELECT count(*) FROM public.instructors WHERE show_on_website AND status = 'active')
          AND f.n_roles = (SELECT count(*) FROM public.user_roles)
          AND f.roles_hash = (SELECT md5(string_agg(user_id::text||role::text, ',' ORDER BY user_id, role)) FROM public.user_roles)
         THEN 'ok' ELSE 'changed' END FROM gate_a_test.fp f;
  PERFORM gate_a_test.t('admin','instructor_delete (synthetic fixture only)','ok',format($q$SELECT public.instructor_delete(%L)$q$, (SELECT ins_del FROM gate_a_test.fx)));
  INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'system','delete fixture actually gone','ok',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.instructors WHERE id = (SELECT ins_del FROM gate_a_test.fx)) THEN 'ok' ELSE 'still present' END;
END $$;

RESET ROLE;
INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'system','realtime: instructors not published','ok',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='instructors') THEN 'ok' ELSE 'denied' END;
INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'system','identities: teacher-only, admin-only, office (any), super_admin (any)','ok',
  CASE WHEN teacher IS NOT NULL AND admin IS NOT NULL AND office_any IS NOT NULL AND sa_any IS NOT NULL THEN 'ok' ELSE 'UNAVAILABLE' END FROM gate_a_test.who;
-- informational (not a pass criterion): does an office-only / standalone super_admin account exist?
INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'info','office-only account exists',
  CASE WHEN office IS NULL THEN 'none' ELSE 'yes' END, CASE WHEN office IS NULL THEN 'none' ELSE 'yes' END FROM gate_a_test.who;
INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'info','standalone super_admin exists',
  CASE WHEN sa_only IS NULL THEN 'none' ELSE 'yes' END, CASE WHEN sa_only IS NULL THEN 'none' ELSE 'yes' END FROM gate_a_test.who;

INSERT INTO gate_a_test.res(actor,test,expect,got) SELECT 'info','mode', m, m FROM gate_a_test.mode;
SELECT n, actor, test, expect, got, (expect = got) AS pass FROM gate_a_test.res
UNION ALL
SELECT 999, 'system', 'SUMMARY', 'all pass', count(*) FILTER (WHERE expect <> got)::text || ' failures', bool_and(expect = got) FROM gate_a_test.res
ORDER BY 1;

ROLLBACK;
