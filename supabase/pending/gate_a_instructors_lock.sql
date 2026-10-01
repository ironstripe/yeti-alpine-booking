-- Security Gate A – step 3 (LOCK). NOT APPLIED. Owner review required before running.
-- Prerequisite (already live): is_staff, instructors_ops_list, instructors_pay_list, instructor_self,
-- instructor_ops_upsert, instructor_pay_update, instructor_delete, instructor_self_update,
-- instructor_user_links, instructor_live_status (+ trigger, realtime).
-- Does NOT change any instructor row, website flag, user role or photo.
-- Rollback: supabase/rollback/gate_a_instructors_rollback.sql (emergency only).

-- 1) instructors: drop the four "true" policies
DROP POLICY IF EXISTS "Authenticated users can view all instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can insert instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can update instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can delete instructors" ON public.instructors;

-- Rows stay visible to signed-in users as a directory; columns are limited by grants below.
-- No client INSERT/UPDATE/DELETE policy: writes go only through the checked server functions.
CREATE POLICY "gate_a_instructors_directory_select" ON public.instructors
  FOR SELECT TO authenticated USING (true);

-- 2) Column-level privileges
REVOKE ALL ON public.instructors FROM authenticated;
REVOKE ALL ON public.instructors FROM anon;
GRANT SELECT (id, created_at, first_name, last_name, level, specialization, status, real_time_status,
  languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser)
  ON public.instructors TO authenticated;
-- service_role keeps ALL (Edge Functions, public Team API, import).

-- 3) Realtime: no more full instructor rows; status flows via instructor_live_status.
ALTER PUBLICATION supabase_realtime DROP TABLE public.instructors;
ALTER TABLE public.instructors REPLICA IDENTITY DEFAULT;

-- 4) Public avatar bucket: writes only by staff (public read unchanged, no files touched)
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
