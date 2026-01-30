-- First drop the existing course_type check constraint
ALTER TABLE public.group_courses DROP CONSTRAINT IF EXISTS group_courses_course_type_check;

-- Recreate the constraint to include 'office' as a valid course_type
ALTER TABLE public.group_courses ADD CONSTRAINT group_courses_course_type_check 
  CHECK (course_type IN ('weekly', 'saturday_course', 'custom', 'office'));

-- Add is_internal column to group_courses for office trainings
ALTER TABLE public.group_courses 
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Create index for filtering internal trainings
CREATE INDEX IF NOT EXISTS idx_group_courses_is_internal ON public.group_courses(is_internal);

-- Create multi-assignment table for office shifts (equal staff assignment)
CREATE TABLE IF NOT EXISTS public.office_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(instance_id, instructor_id)
);

-- Enable RLS
ALTER TABLE public.office_shift_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for office_shift_assignments
CREATE POLICY "Authenticated users can view office_shift_assignments"
ON public.office_shift_assignments FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admin/office can manage office_shift_assignments"
ON public.office_shift_assignments FOR ALL
USING (public.is_admin_or_office(auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_office_shift_assignments_instance 
ON public.office_shift_assignments(instance_id);

CREATE INDEX IF NOT EXISTS idx_office_shift_assignments_instructor 
ON public.office_shift_assignments(instructor_id);

-- Seed default office trainings
INSERT INTO public.group_courses (
  name, description, discipline, min_age, max_age, 
  max_participants, price_per_day, course_type, is_internal, is_active, color
) VALUES 
  ('Büro Vormittag', 'Büroschicht am Morgen', 'ski', 18, 99, 10, 0, 'office', true, true, '#6B7280'),
  ('Büro Nachmittag', 'Büroschicht am Nachmittag', 'ski', 18, 99, 10, 0, 'office', true, true, '#6B7280'),
  ('Büro Ganztag', 'Ganztägige Büroschicht', 'ski', 18, 99, 10, 0, 'office', true, true, '#6B7280')
ON CONFLICT DO NOTHING;