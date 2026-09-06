ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_teaser TEXT NOT NULL DEFAULT 'Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'instructors_website_teaser_len'
  ) THEN
    ALTER TABLE public.instructors
      ADD CONSTRAINT instructors_website_teaser_len CHECK (char_length(website_teaser) <= 280);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS instructors_website_visible_idx
  ON public.instructors (first_name, last_name)
  WHERE show_on_website = true AND status = 'active';

DROP TABLE IF EXISTS public.instructor_public_profiles;