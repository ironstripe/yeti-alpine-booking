-- EMERGENCY ONLY. Restores the INSECURE pre-Gate-A state captured by live introspection
-- on 2026-10-01 ~10:35 UTC. The normal recovery path is a forward fix, not this file.
-- Do not run as part of routine deployment.
--
-- Captured state:
--   instructors ACL: authenticated=arwdDxtm (ALL), anon none, service_role ALL
--   policies (all TO authenticated):
--     "Authenticated users can view all instructors"   SELECT USING (true)
--     "Authenticated users can insert instructors"     INSERT WITH CHECK (true)
--     "Authenticated users can update instructors"     UPDATE USING (true)
--     "Authenticated users can delete instructors"     DELETE USING (true)
--   REPLICA IDENTITY FULL; member of publication supabase_realtime
--   storage.objects (TO authenticated): upload WITH CHECK, update USING, delete USING
--     (bucket_id = 'instructor-avatars')
--   get_instructor_for_user: email join only
-- Additive objects (functions, instructor_user_links, instructor_live_status) are kept so the
-- current frontend keeps working.

BEGIN;

DROP POLICY IF EXISTS "gate_a_instructors_directory_select" ON public.instructors;
REVOKE ALL ON public.instructors FROM authenticated;   -- clears column grants
GRANT ALL ON public.instructors TO authenticated;

CREATE POLICY "Authenticated users can view all instructors" ON public.instructors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert instructors" ON public.instructors
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update instructors" ON public.instructors
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete instructors" ON public.instructors
  FOR DELETE TO authenticated USING (true);

ALTER TABLE public.instructors REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructors;

DROP POLICY IF EXISTS "gate_a_avatars_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "gate_a_avatars_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "gate_a_avatars_staff_delete" ON storage.objects;
CREATE POLICY "Authenticated users can upload instructor avatars" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'instructor-avatars'::text);
CREATE POLICY "Authenticated users can update instructor avatars" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'instructor-avatars'::text);
CREATE POLICY "Authenticated users can delete instructor avatars" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'instructor-avatars'::text);

CREATE OR REPLACE FUNCTION public.get_instructor_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT i.id FROM public.instructors i
  JOIN auth.users u ON LOWER(u.email) = LOWER(i.email)
  WHERE u.id = _user_id
  LIMIT 1
$function$;

COMMIT;
