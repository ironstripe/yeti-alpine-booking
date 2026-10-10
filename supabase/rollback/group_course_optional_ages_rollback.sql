-- Rollback for group_course_optional_ages.sql. Fails (by design) if any course already
-- has NULL ages; inspect those rows first: SELECT id,name FROM public.group_courses WHERE min_age IS NULL OR max_age IS NULL;
ALTER TABLE public.group_courses ALTER COLUMN min_age SET NOT NULL;
ALTER TABLE public.group_courses ALTER COLUMN max_age SET NOT NULL;
