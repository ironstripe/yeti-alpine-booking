-- #46: group course ages are optional in the UI (blank = no age restriction).
-- Allow NULL; validate_group_course_ages() still validates every supplied value
-- (NULL comparisons are skipped, so 1 <= min <= max <= 99 applies when given).
-- Not applied live; install via lov_database--migration after review.
ALTER TABLE public.group_courses ALTER COLUMN min_age DROP NOT NULL;
ALTER TABLE public.group_courses ALTER COLUMN max_age DROP NOT NULL;
COMMENT ON COLUMN public.group_courses.min_age IS 'Optional; NULL = no lower age limit';
COMMENT ON COLUMN public.group_courses.max_age IS 'Optional; NULL = no upper age limit';
