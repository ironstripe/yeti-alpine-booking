
-- Create master_bookings table
CREATE TABLE public.master_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES public.instructors(id),
  date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  total_participants INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_instructor_slot UNIQUE (instructor_id, date, start_time, end_time)
);

-- Enable RLS
ALTER TABLE public.master_bookings ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as tickets)
CREATE POLICY "Authenticated users can view master_bookings"
  ON public.master_bookings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert master_bookings"
  ON public.master_bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update master_bookings"
  ON public.master_bookings FOR UPDATE
  USING (true);

CREATE POLICY "Authenticated users can delete master_bookings"
  ON public.master_bookings FOR DELETE
  USING (true);

-- Add columns to tickets table
ALTER TABLE public.tickets
  ADD COLUMN master_booking_id UUID REFERENCES public.master_bookings(id),
  ADD COLUMN is_initiator BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN share_participant_count INTEGER;

-- Trigger for updated_at on master_bookings
CREATE TRIGGER update_master_bookings_updated_at
  BEFORE UPDATE ON public.master_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
