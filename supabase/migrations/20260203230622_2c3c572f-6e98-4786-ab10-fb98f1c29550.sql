-- Create office_hour_blocks table for scheduling office staff
CREATE TABLE public.office_hour_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for efficient queries
CREATE INDEX idx_office_hour_blocks_instructor_date 
  ON public.office_hour_blocks(instructor_id, date);

-- Enable RLS
ALTER TABLE public.office_hour_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies: Admin and office staff can manage office hour blocks
CREATE POLICY "Admin and office can view office hour blocks"
  ON public.office_hour_blocks
  FOR SELECT
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can create office hour blocks"
  ON public.office_hour_blocks
  FOR INSERT
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can update office hour blocks"
  ON public.office_hour_blocks
  FOR UPDATE
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can delete office hour blocks"
  ON public.office_hour_blocks
  FOR DELETE
  USING (public.is_admin_or_office(auth.uid()));