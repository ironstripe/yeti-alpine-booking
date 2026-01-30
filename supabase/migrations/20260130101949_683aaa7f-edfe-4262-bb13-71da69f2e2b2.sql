-- Add NOT NULL constraints to age fields now that data is populated
ALTER TABLE group_courses ALTER COLUMN min_age SET NOT NULL;
ALTER TABLE group_courses ALTER COLUMN max_age SET NOT NULL;

-- Add validation check (use trigger-based validation for flexibility)
CREATE OR REPLACE FUNCTION public.validate_group_course_ages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.min_age <= 0 THEN
    RAISE EXCEPTION 'min_age must be greater than 0';
  END IF;
  IF NEW.max_age < NEW.min_age THEN
    RAISE EXCEPTION 'max_age must be greater than or equal to min_age';
  END IF;
  IF NEW.max_age > 99 THEN
    RAISE EXCEPTION 'max_age must not exceed 99';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_group_course_ages_trigger
BEFORE INSERT OR UPDATE ON public.group_courses
FOR EACH ROW
EXECUTE FUNCTION public.validate_group_course_ages();