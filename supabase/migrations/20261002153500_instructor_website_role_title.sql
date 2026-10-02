-- Public-facing display title only. Never reuse operational `role`, `roles`, or `gender`
-- for a school-specific title such as "Leiter Skischule".
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS website_role_title text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_website_role_title_format') THEN
    ALTER TABLE public.instructors
      ADD CONSTRAINT instructors_website_role_title_format
      CHECK (
        website_role_title IS NULL OR
        (
          char_length(website_role_title) BETWEEN 1 AND 80 AND
          website_role_title = btrim(website_role_title) AND
          website_role_title !~ '[[:cntrl:]]'
        )
      );
  END IF;
END $$;

-- The title is public wording; this adds NO write permission and NO access to HR columns.
GRANT SELECT (website_role_title) ON public.instructors TO authenticated;

-- No data backfill: all existing rows retain NULL and resolve to an automatically
-- generated, gender-aware teaching title. Instructor/admin rights are unchanged.
