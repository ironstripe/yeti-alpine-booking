-- Gate B instructor_absences regression. No permanent changes: everything, including the
-- temporary policy lock and synthetic absence fixtures, is rolled back.
BEGIN;
CREATE SCHEMA gate_b_test;
CREATE TABLE gate_b_test.before AS SELECT
  (SELECT count(*) FROM public.instructors) instructors,
  (SELECT count(*) FROM public.instructor_absences) absences,
  (SELECT count(*) FROM public.user_roles) roles;

-- LIVE STATUS: APPLIED to YETI Lovable Cloud at 2026-10-01 16:45 CEST.
-- Already live; do not manually re-run. The DDL is idempotent for a future environment.
-- Gate B: instructor_absences holds reasons incl. sickness. Historical USING (true)
-- policies allow every authenticated user to read and edit every instructor's records.
-- Staff may manage all; a teacher may read their own, request pending leave,
-- and edit/delete only their own pending request. No public/anonymous access.
-- Pre-apply and live-lock BEGIN/ROLLBACK role tests each passed 16/16.

DROP POLICY IF EXISTS "Authenticated users can view all absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can insert absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can update absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can delete absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_select" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_insert" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_update" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_delete" ON public.instructor_absences;

REVOKE ALL ON public.instructor_absences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_absences TO authenticated;
ALTER TABLE public.instructor_absences ENABLE ROW LEVEL SECURITY;

-- A teacher may edit the dates/reason of a pending request, but never promote it
-- to approved, change ownership, change creator/requester or edit approval fields.
-- Staff operations and service-role imports are not changed by this guard.
CREATE OR REPLACE FUNCTION public.guard_teacher_absence_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $guard$
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
END $guard$;
REVOKE EXECUTE ON FUNCTION public.guard_teacher_absence_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_teacher_absence_update ON public.instructor_absences;
CREATE TRIGGER trg_guard_teacher_absence_update
  BEFORE UPDATE ON public.instructor_absences
  FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_absence_update();

CREATE POLICY "absence_staff_or_own_select" ON public.instructor_absences
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR
         (public.has_role(auth.uid(), 'teacher'::public.app_role) AND
          instructor_id = public.get_instructor_for_user(auth.uid())));

CREATE POLICY "absence_staff_or_own_pending_insert" ON public.instructor_absences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()
     AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL));

CREATE POLICY "absence_staff_or_own_pending_update" ON public.instructor_absences
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()
     AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL));

CREATE POLICY "absence_staff_or_own_pending_delete" ON public.instructor_absences
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()));


CREATE TABLE gate_b_test.who AS
WITH r AS (SELECT user_id, array_agg(role::text) rs FROM public.user_roles GROUP BY user_id)
SELECT (SELECT r.user_id FROM r JOIN public.instructor_user_links l USING (user_id)
         WHERE rs=ARRAY['teacher'] LIMIT 1) teacher,
       (SELECT user_id FROM r WHERE 'office'=ANY(rs) LIMIT 1) office,
       (SELECT user_id FROM r WHERE 'admin'=ANY(rs) AND NOT rs && ARRAY['office','super_admin'] LIMIT 1) admin,
       (SELECT user_id FROM r WHERE 'super_admin'=ANY(rs) LIMIT 1) superadmin;
DO $pre$
BEGIN
 IF (SELECT teacher IS NULL OR office IS NULL OR admin IS NULL OR superadmin IS NULL FROM gate_b_test.who)
 THEN RAISE EXCEPTION 'required_real_role_unavailable'; END IF;
END $pre$;
CREATE TABLE gate_b_test.fx AS SELECT gen_random_uuid() AS foreign_instructor,
 gen_random_uuid() AS own_absence, gen_random_uuid() AS foreign_absence,
 public.get_instructor_for_user((SELECT teacher FROM gate_b_test.who)) AS own_instructor;
DO $pre$
BEGIN
 IF (SELECT own_instructor IS NULL FROM gate_b_test.fx) THEN RAISE EXCEPTION 'teacher_self_mapping_unavailable'; END IF;
END $pre$;
INSERT INTO public.instructors(id,first_name,last_name,status,show_on_website)
 SELECT foreign_instructor,'GateB','Fixture','inactive',false FROM gate_b_test.fx;
INSERT INTO public.instructor_absences(id,instructor_id,start_date,end_date,type,status,reason,created_by,requested_by)
 SELECT own_absence,own_instructor,'2026-10-10','2026-10-10','vacation','pending',
        'GateB synthetic own', (SELECT teacher FROM gate_b_test.who),(SELECT teacher FROM gate_b_test.who)
 FROM gate_b_test.fx;
INSERT INTO public.instructor_absences(id,instructor_id,start_date,end_date,type,status,reason)
 SELECT foreign_absence,foreign_instructor,'2026-10-11','2026-10-11','sick','confirmed','GateB synthetic foreign'
 FROM gate_b_test.fx;

CREATE TABLE gate_b_test.results(n serial PRIMARY KEY, actor text, test text, expected text, got text);
CREATE FUNCTION gate_b_test.must(ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'assert'; END IF; END $$;
CREATE FUNCTION gate_b_test.probe(uid uuid, actor_role text, q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
   PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role',actor_role)::text,true);
   EXECUTE format('SET LOCAL ROLE %I',actor_role);
   EXECUTE q;
   EXECUTE 'RESET ROLE';
   RETURN 'ok';
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE='42501' OR SQLERRM='assert' THEN RETURN 'denied'; END IF;
   RETURN 'error:'||SQLSTATE||' '||left(SQLERRM,90);
 END;
END $$;
CREATE FUNCTION gate_b_test.test(actor text,label text,expected text,q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid; actor_role text:='authenticated';
BEGIN
 IF actor='anon' THEN actor_role:='anon';
 ELSE EXECUTE format('SELECT %I FROM gate_b_test.who',actor) INTO uid; END IF;
 INSERT INTO gate_b_test.results(actor,test,expected,got)
 VALUES(actor,label,expected,gate_b_test.probe(uid,actor_role,q));
 EXECUTE 'RESET ROLE';
END $$;
GRANT USAGE ON SCHEMA gate_b_test TO authenticated,anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gate_b_test TO authenticated,anon;
GRANT SELECT ON gate_b_test.fx,gate_b_test.who TO authenticated,anon;

DO $tests$
DECLARE own uuid; other uuid; oi uuid; fi uuid; teacher uuid;
BEGIN
 SELECT own_absence,foreign_absence,own_instructor,foreign_instructor INTO own,other,oi,fi FROM gate_b_test.fx;
 SELECT w.teacher INTO teacher FROM gate_b_test.who w;
 PERFORM gate_b_test.test('anon','anonymous cannot read','denied','SELECT id FROM public.instructor_absences');
 PERFORM gate_b_test.test('teacher','read own request','ok',format('SELECT gate_b_test.must(count(*)=1) FROM public.instructor_absences WHERE id=%L',own));
 PERFORM gate_b_test.test('teacher','read foreign reason blocked','denied',format('SELECT gate_b_test.must(count(*)=1) FROM public.instructor_absences WHERE id=%L',other));
 PERFORM gate_b_test.test('teacher','create own pending','ok',format('INSERT INTO public.instructor_absences(instructor_id,start_date,end_date,type,status,created_by,requested_by) VALUES (%L,%L,%L,%L,%L,%L,%L)',oi,'2026-10-12','2026-10-12','vacation','pending',teacher,teacher));
 PERFORM gate_b_test.test('teacher','create foreign pending blocked','denied',format('INSERT INTO public.instructor_absences(instructor_id,start_date,end_date,type,status,created_by,requested_by) VALUES (%L,%L,%L,%L,%L,%L,%L)',fi,'2026-10-12','2026-10-12','vacation','pending',teacher,teacher));
 PERFORM gate_b_test.test('teacher','self-approval insert blocked','denied',format('INSERT INTO public.instructor_absences(instructor_id,start_date,end_date,type,status,created_by,requested_by) VALUES (%L,%L,%L,%L,%L,%L,%L)',oi,'2026-10-12','2026-10-12','vacation','confirmed',teacher,teacher));
 PERFORM gate_b_test.test('teacher','edit own pending reason','ok',format('WITH u AS (UPDATE public.instructor_absences SET reason=%L WHERE id=%L RETURNING id) SELECT gate_b_test.must((SELECT count(*) FROM u)=1)','GateB edited',own));
 PERFORM gate_b_test.test('teacher','self-approval update blocked','denied',format('UPDATE public.instructor_absences SET status=%L WHERE id=%L','confirmed',own));
 PERFORM gate_b_test.test('teacher','change approval fields blocked','denied',format('UPDATE public.instructor_absences SET approved_by=%L WHERE id=%L',teacher,own));
 PERFORM gate_b_test.test('teacher','move own record to foreign blocked','denied',format('UPDATE public.instructor_absences SET instructor_id=%L WHERE id=%L',fi,own));
 PERFORM gate_b_test.test('teacher','foreign update returns no row','ok',format('WITH u AS (UPDATE public.instructor_absences SET reason=%L WHERE id=%L RETURNING id) SELECT gate_b_test.must((SELECT count(*) FROM u)=0)','attack',other));
 PERFORM gate_b_test.test('teacher','foreign delete returns no row','ok',format('WITH d AS (DELETE FROM public.instructor_absences WHERE id=%L RETURNING id) SELECT gate_b_test.must((SELECT count(*) FROM d)=0)',other));
 PERFORM gate_b_test.test('teacher','delete own pending','ok',format('WITH d AS (DELETE FROM public.instructor_absences WHERE id=%L RETURNING id) SELECT gate_b_test.must((SELECT count(*) FROM d)=1)',own));
 PERFORM gate_b_test.test('office','office reads all synthetic records','ok',format('SELECT gate_b_test.must(count(*)=1) FROM public.instructor_absences WHERE id=%L',other));
 PERFORM gate_b_test.test('admin','admin can edit foreign status','ok',format('WITH u AS (UPDATE public.instructor_absences SET status=%L WHERE id=%L RETURNING id) SELECT gate_b_test.must((SELECT count(*) FROM u)=1)','rejected',other));
 PERFORM gate_b_test.test('superadmin','superadmin reads foreign','ok',format('SELECT gate_b_test.must(count(*)=1) FROM public.instructor_absences WHERE id=%L',other));
END $tests$;

SELECT n,actor,test,expected,got,(expected=got) AS pass FROM gate_b_test.results ORDER BY n;
SELECT count(*) AS assertions, count(*) FILTER (WHERE expected=got) AS passed,
       count(*) FILTER (WHERE expected<>got) AS failed,
       bool_and(expected=got) AS all_passed,
       (SELECT instructors FROM gate_b_test.before) AS original_instructors,
       (SELECT absences FROM gate_b_test.before) AS original_absences,
       (SELECT roles FROM gate_b_test.before) AS original_roles
FROM gate_b_test.results;
ROLLBACK;
