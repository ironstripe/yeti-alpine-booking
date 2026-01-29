-- =============================================
-- Migration: Instructor Types and Capabilities
-- =============================================

-- 1. Create instructor_role_type ENUM (idempotent)
DO $$ BEGIN
  CREATE TYPE instructor_role_type AS ENUM ('teacher', 'assistant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add instructor_type column to instructors table
ALTER TABLE public.instructors 
ADD COLUMN IF NOT EXISTS instructor_type instructor_role_type NOT NULL DEFAULT 'teacher';

-- 3. Create capabilities table
CREATE TABLE IF NOT EXISTS public.capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create instructor_capabilities join table
CREATE TABLE IF NOT EXISTS public.instructor_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instructor_id, capability_id)
);

-- 5. Populate capabilities (25 total)
INSERT INTO public.capabilities (name, category) VALUES
  -- Ski (15)
  ('Ski Windel-Wedelkurs', 'Ski'),
  ('Ski Swiss Snow Kids Village', 'Ski'),
  ('Ski Blauer Prinz/Prinzessin', 'Ski'),
  ('Ski Blauer König/Königin', 'Ski'),
  ('Ski Blauer Star', 'Ski'),
  ('Ski Roter Prinz/Prinzessin', 'Ski'),
  ('Ski Roter König/Königin', 'Ski'),
  ('Ski Roter Star', 'Ski'),
  ('Ski Schwarzer Prinz/Prinzessin', 'Ski'),
  ('Ski Schwarzer König/Königin', 'Ski'),
  ('Ski Swiss Snow Academy', 'Ski'),
  ('Ski Erwachsene Anfänger', 'Ski'),
  ('Ski Erwachsene Fortgeschritten', 'Ski'),
  ('Ski Erwachsene Wiedereinsteiger', 'Ski'),
  ('Ski Kinder Fortgeschritten', 'Ski'),
  -- Snowboard (2)
  ('Snowboard Anfänger', 'Snowboard'),
  ('Snowboard Fortgeschritten', 'Snowboard'),
  -- Betreuung (1)
  ('Betreuung Mittagsbetreuung', 'Betreuung'),
  -- Gästerennen (4)
  ('Gästerennen SKI-Rennen Kinder', 'Gästerennen'),
  ('Gästerennen SB-Rennen Kinder', 'Gästerennen'),
  ('Gästerennen SKI-Rennen Erwachsene', 'Gästerennen'),
  ('Gästerennen SB-Rennen Erwachsene', 'Gästerennen'),
  -- Skitage (2)
  ('Skitage Anfänger', 'Skitage'),
  ('Skitage Fortgeschritten', 'Skitage'),
  -- Jugendhaus (1)
  ('Jugendhaus Anfänger', 'Jugendhaus')
ON CONFLICT (name) DO NOTHING;

-- 6. Enable RLS on new tables
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_capabilities ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for capabilities table
-- Read access for all authenticated users
CREATE POLICY "Authenticated users can view capabilities"
  ON public.capabilities
  FOR SELECT
  TO authenticated
  USING (true);

-- Write access for admin/office only
CREATE POLICY "Admin and office can manage capabilities"
  ON public.capabilities
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

-- 8. RLS Policies for instructor_capabilities table
-- Read access for all authenticated users
CREATE POLICY "Authenticated users can view instructor capabilities"
  ON public.instructor_capabilities
  FOR SELECT
  TO authenticated
  USING (true);

-- Write access for admin/office only
CREATE POLICY "Admin and office can manage instructor capabilities"
  ON public.instructor_capabilities
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));