-- Non-destructive rollback for bc_import_prerequisite.sql. NOT APPLIED.
-- Aborts if ANY import data exists; never drops populated HR/portrait/mapping tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.instructor_source_links)
     OR EXISTS (SELECT 1 FROM public.instructor_hr_private)
     OR EXISTS (SELECT 1 FROM public.instructor_photos)
     OR EXISTS (SELECT 1 FROM public.instructor_deployment_windows)
     OR EXISTS (SELECT 1 FROM public.instructor_import_runs)
     OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'instructor-hr-photos') THEN
    RAISE EXCEPTION 'rollback_refused: import data present; export and decide manually';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instructors WHERE email IS NULL OR phone IS NULL OR hourly_rate IS NULL) THEN
    RAISE EXCEPTION 'rollback_refused: instructors with missing email/phone/wage exist';
  END IF;
END $$;

DROP POLICY IF EXISTS "bc_hr_photos_staff_select" ON storage.objects;
DROP FUNCTION IF EXISTS public.instructor_is_deployed(uuid, date);
DROP TABLE public.instructor_photos;
DROP FUNCTION IF EXISTS public.bc_photo_path_guard();
DROP TABLE public.instructor_deployment_windows;
DROP TABLE public.instructor_hr_private;
DROP TABLE public.instructor_source_links;
DROP TABLE public.instructor_import_staging;
DROP TABLE public.instructor_import_runs;
ALTER TABLE public.instructors ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.instructors ALTER COLUMN phone SET NOT NULL;
ALTER TABLE public.instructors ALTER COLUMN hourly_rate SET NOT NULL;
-- is_super_admin and the 'super_admin' enum value stay (Postgres cannot drop enum values safely);
-- they grant nothing while no user holds the role.
