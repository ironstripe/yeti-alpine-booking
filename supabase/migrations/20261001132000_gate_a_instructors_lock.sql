-- Security Gate A. Already applied directly to YETI Lovable Cloud on 2026-10-01.
-- Reconciliation migration for reproducible new environments. Do not run the pending
-- gate_a_instructors_lock.sql or the insecure emergency rollback on the live database.
-- Requires 20261001104734_* (safe RPCs, user links, PII-free realtime status).
-- No instructor row, website flag, role or photo object is modified.

DO $gate_a$
BEGIN
  IF to_regprocedure('public.is_staff(uuid)') IS NULL OR
     to_regprocedure('public.instructors_ops_list(uuid)') IS NULL OR
     to_regclass('public.instructor_live_status') IS NULL THEN
    RAISE EXCEPTION 'Gate A prerequisites missing; stop rather than expose HR data';
  END IF;
END $gate_a$;

DROP POLICY IF EXISTS "Authenticated users can view all instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can insert instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can update instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can delete instructors" ON public.instructors;
DROP POLICY IF EXISTS "gate_a_instructors_directory_select" ON public.instructors;
CREATE POLICY "gate_a_instructors_directory_select" ON public.instructors
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.instructors FROM authenticated;
REVOKE ALL ON public.instructors FROM anon;
GRANT SELECT (id, created_at, first_name, last_name, level, specialization, status, real_time_status,
  languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser)
  ON public.instructors TO authenticated;
-- service_role retains full access for checked Edge Functions and the public Team endpoint.

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                AND tablename = 'instructors') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.instructors;
  END IF;
END $realtime$;
ALTER TABLE public.instructors REPLICA IDENTITY DEFAULT;

-- The avatar bucket remains publicly readable; only staff can write objects.
DROP POLICY IF EXISTS "Authenticated users can upload instructor avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update instructor avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete instructor avatars" ON storage.objects;
DROP POLICY IF EXISTS "gate_a_avatars_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "gate_a_avatars_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "gate_a_avatars_staff_delete" ON storage.objects;
CREATE POLICY "gate_a_avatars_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));
CREATE POLICY "gate_a_avatars_staff_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));
CREATE POLICY "gate_a_avatars_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_staff(auth.uid()));
