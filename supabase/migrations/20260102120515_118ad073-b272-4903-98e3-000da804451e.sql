-- Create instructor_absences table for vacation/sick leave blocking periods
CREATE TABLE public.instructor_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('vacation', 'sick', 'other')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable Row Level Security
ALTER TABLE public.instructor_absences ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view all absences"
  ON public.instructor_absences FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert absences"
  ON public.instructor_absences FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update absences"
  ON public.instructor_absences FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can delete absences"
  ON public.instructor_absences FOR DELETE USING (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructor_absences;