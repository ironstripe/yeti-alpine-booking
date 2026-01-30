-- Add roles array to instructors table
ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS 
  roles TEXT[] DEFAULT '{}';

-- Migrate existing data based on specialization
UPDATE public.instructors SET roles = ARRAY['ski'] 
WHERE (specialization = 'ski' OR specialization IS NULL) AND (roles = '{}' OR roles IS NULL);

UPDATE public.instructors SET roles = ARRAY['snowboard'] 
WHERE specialization = 'snowboard' AND (roles = '{}' OR roles IS NULL);

UPDATE public.instructors SET roles = ARRAY['ski', 'snowboard'] 
WHERE specialization = 'both' AND (roles = '{}' OR roles IS NULL);

-- Handle office staff based on role column
UPDATE public.instructors SET roles = array_append(roles, 'office')
WHERE role = 'office_staff' AND NOT ('office' = ANY(roles));

-- Extend trainings table with training_type and is_internal columns
ALTER TABLE public.trainings ADD COLUMN IF NOT EXISTS 
  training_type TEXT DEFAULT 'group' CHECK (training_type IN ('group', 'camp', 'office'));

ALTER TABLE public.trainings ADD COLUMN IF NOT EXISTS 
  is_internal BOOLEAN DEFAULT false;

-- Create index for filtering internal trainings
CREATE INDEX IF NOT EXISTS idx_trainings_internal ON public.trainings(is_internal);
CREATE INDEX IF NOT EXISTS idx_trainings_training_type ON public.trainings(training_type);

-- Seed default office trainings
INSERT INTO public.trainings (name, training_type, is_internal, time_start, time_end, date, location, status)
VALUES
  ('Büro Vormittag', 'office', true, '09:00', '12:00', CURRENT_DATE, 'Büro', 'planned'),
  ('Büro Nachmittag', 'office', true, '13:00', '17:00', CURRENT_DATE, 'Büro', 'planned'),
  ('Büro Ganztag', 'office', true, '09:00', '17:00', CURRENT_DATE, 'Büro', 'planned')
ON CONFLICT DO NOTHING;