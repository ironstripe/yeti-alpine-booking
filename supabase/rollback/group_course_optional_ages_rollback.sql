-- Rollback for group_course_optional_ages.sql. No data backfill.
-- NOT NULL is restored only when no course has NULL ages; otherwise it stays nullable (NOTICE).
BEGIN;
ALTER TABLE public.group_courses DROP CONSTRAINT IF EXISTS group_courses_age_bounds_check;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.group_courses WHERE min_age IS NULL OR max_age IS NULL) THEN
    RAISE NOTICE 'group_courses has NULL ages; NOT NULL not restored';
  ELSE
    ALTER TABLE public.group_courses ALTER COLUMN min_age SET NOT NULL;
    ALTER TABLE public.group_courses ALTER COLUMN max_age SET NOT NULL;
  END IF;
END $$;
COMMIT;
