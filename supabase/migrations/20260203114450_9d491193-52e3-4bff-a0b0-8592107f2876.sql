-- Create recurring blocks table
CREATE TABLE public.instructor_recurring_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  
  -- Time window
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Recurrence pattern (0=Sun, 1=Mon, ..., 6=Sat)
  weekdays INTEGER[] NOT NULL,
  
  -- Validity period
  valid_from DATE NOT NULL,
  valid_until DATE,  -- NULL = until season end
  
  -- Metadata
  reason TEXT,
  preset_type TEXT,  -- 'lunch', 'morning_only', 'afternoon_only', 'custom'
  
  -- Approval workflow (matching absences pattern)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_recurring_blocks_instructor ON public.instructor_recurring_blocks(instructor_id);
CREATE INDEX idx_recurring_blocks_status ON public.instructor_recurring_blocks(status);
CREATE INDEX idx_recurring_blocks_weekdays ON public.instructor_recurring_blocks USING GIN (weekdays);

-- Enable RLS
ALTER TABLE public.instructor_recurring_blocks ENABLE ROW LEVEL SECURITY;

-- Instructors can view their own blocks
CREATE POLICY "Instructors can view their own blocks" ON public.instructor_recurring_blocks
  FOR SELECT USING (
    instructor_id IN (SELECT id FROM public.instructors WHERE email = auth.jwt()->>'email')
  );

-- Instructors can create their own blocks
CREATE POLICY "Instructors can create their own blocks" ON public.instructor_recurring_blocks
  FOR INSERT WITH CHECK (
    instructor_id IN (SELECT id FROM public.instructors WHERE email = auth.jwt()->>'email')
  );

-- Instructors can update their own pending blocks
CREATE POLICY "Instructors can update their own pending blocks" ON public.instructor_recurring_blocks
  FOR UPDATE USING (
    instructor_id IN (SELECT id FROM public.instructors WHERE email = auth.jwt()->>'email')
    AND status = 'pending'
  );

-- Admins can manage all blocks
CREATE POLICY "Admins can manage all blocks" ON public.instructor_recurring_blocks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Conflict check function
CREATE OR REPLACE FUNCTION public.check_recurring_block_conflicts(
  p_instructor_id UUID,
  p_start_time TIME,
  p_end_time TIME,
  p_weekdays INTEGER[],
  p_valid_from DATE,
  p_valid_until DATE
)
RETURNS TABLE (
  booking_id UUID,
  booking_date DATE,
  time_start TIME,
  time_end TIME,
  participant_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.id,
    ti.date,
    ti.time_start::TIME,
    ti.time_end::TIME,
    COALESCE(cp.first_name || ' ' || cp.last_name, 'Unbekannt')
  FROM public.ticket_items ti
  LEFT JOIN public.customer_participants cp ON cp.id = ti.participant_id
  WHERE ti.instructor_id = p_instructor_id
    AND ti.date >= p_valid_from
    AND (p_valid_until IS NULL OR ti.date <= p_valid_until)
    AND EXTRACT(DOW FROM ti.date)::INTEGER = ANY(p_weekdays)
    AND ti.time_start::TIME < p_end_time
    AND ti.time_end::TIME > p_start_time
    AND ti.status NOT IN ('cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update timestamp trigger
CREATE TRIGGER update_recurring_blocks_updated_at
  BEFORE UPDATE ON public.instructor_recurring_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();