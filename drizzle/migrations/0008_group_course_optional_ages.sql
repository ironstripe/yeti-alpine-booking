ALTER TABLE public.group_courses ALTER COLUMN min_age DROP NOT NULL;
ALTER TABLE public.group_courses ALTER COLUMN max_age DROP NOT NULL;
ALTER TABLE public.group_courses ADD CONSTRAINT group_courses_age_bounds_check CHECK (
  (min_age IS NULL OR min_age BETWEEN 1 AND 99)
  AND (max_age IS NULL OR max_age BETWEEN 1 AND 99)
  AND (min_age IS NULL OR max_age IS NULL OR min_age <= max_age)
);
COMMENT ON COLUMN public.group_courses.min_age IS 'Optional; NULL = no lower age limit';
COMMENT ON COLUMN public.group_courses.max_age IS 'Optional; NULL = no upper age limit';