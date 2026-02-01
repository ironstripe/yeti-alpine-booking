-- Phase 1: Event Module Database Schema

-- 1.1 Events Table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Gästeskirennen',
  event_date DATE NOT NULL,
  event_type TEXT DEFAULT 'race' CHECK (event_type IN ('race', 'ceremony', 'other')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')),
  
  course_race_time TIME DEFAULT '10:00',
  guest_race_time TIME DEFAULT '11:30',
  result_ceremony_time TIME DEFAULT '15:30',
  instructor_deadline TIMESTAMP WITH TIME ZONE,
  guest_fee DECIMAL(10,2) DEFAULT 20.00,
  
  total_numbers INTEGER DEFAULT 100,
  reserve_per_group INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookup
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_events_status ON public.events(status);

-- 1.2 Event Categories Table (Start Groups)
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('course', 'guest')),
  training_id UUID REFERENCES public.group_courses(id),
  discipline TEXT CHECK (discipline IN ('ski', 'snowboard')),
  age_group TEXT CHECK (age_group IN ('child', 'adult')),
  start_time TIME,
  sort_order INTEGER DEFAULT 0,
  start_number_from INTEGER,
  start_number_to INTEGER,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_event_categories_event ON public.event_categories(event_id);

-- 1.3 Event Participants Table
CREATE TABLE public.event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.customer_participants(id),
  ticket_item_id UUID REFERENCES public.ticket_items(id),
  
  guest_first_name TEXT,
  guest_last_name TEXT,
  guest_birth_year INTEGER,
  guest_phone TEXT,
  guest_email TEXT,
  
  source TEXT NOT NULL CHECK (source IN ('group_course', 'private_course', 'walkin')),
  days_attended INTEGER DEFAULT 0,
  
  confirmed_by_instructor UUID REFERENCES public.instructors(id),
  opted_out BOOLEAN DEFAULT false,
  opt_out_reason TEXT,
  
  start_number INTEGER,
  
  fee_amount DECIMAL(10,2),
  payment_status TEXT DEFAULT 'not_applicable' CHECK (payment_status IN ('not_applicable', 'pending', 'paid', 'waived')),
  
  finish_time_ms INTEGER,
  rank_in_category INTEGER,
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reason TEXT,
  
  checked_in BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_event_participants_event ON public.event_participants(event_id);
CREATE INDEX idx_event_participants_category ON public.event_participants(category_id);
CREATE INDEX idx_event_participants_participant ON public.event_participants(participant_id) WHERE participant_id IS NOT NULL;

-- Unique constraint: one participant per event (only when participant_id is set)
CREATE UNIQUE INDEX idx_event_participant_unique 
  ON public.event_participants(event_id, participant_id) 
  WHERE participant_id IS NOT NULL;

-- 1.4 RLS Policies

-- Events: Admin/Office full access, authenticated read
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage events" 
  ON public.events FOR ALL 
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Authenticated can view events" 
  ON public.events FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Event Categories: Same pattern
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage event_categories" 
  ON public.event_categories FOR ALL 
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Authenticated can view event_categories" 
  ON public.event_categories FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Event Participants: Admin/Office full, instructors can update their own
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage event_participants" 
  ON public.event_participants FOR ALL 
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Authenticated can view event_participants" 
  ON public.event_participants FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Instructors can update opt_out" 
  ON public.event_participants FOR UPDATE 
  USING (confirmed_by_instructor = public.get_instructor_for_user(auth.uid()))
  WITH CHECK (confirmed_by_instructor = public.get_instructor_for_user(auth.uid()));

-- 1.5 Database Function: Create Weekly Race
CREATE OR REPLACE FUNCTION public.create_next_friday_race_event()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_friday DATE;
  new_event_id UUID;
BEGIN
  -- Security check
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied. Only admin or office staff can create events.';
  END IF;

  -- Find next Friday
  next_friday := date_trunc('week', CURRENT_DATE) + INTERVAL '4 days';
  IF next_friday <= CURRENT_DATE THEN
    next_friday := next_friday + INTERVAL '7 days';
  END IF;
  
  -- Check if event already exists
  SELECT id INTO new_event_id FROM public.events WHERE event_date = next_friday;
  IF new_event_id IS NOT NULL THEN
    RETURN new_event_id;
  END IF;
  
  -- Create new event
  INSERT INTO public.events (name, event_date, status, instructor_deadline)
  VALUES (
    'Gästeskirennen',
    next_friday,
    'registration_open',
    next_friday - INTERVAL '2 days' + TIME '18:00'
  )
  RETURNING id INTO new_event_id;
  
  RETURN new_event_id;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_participants_updated_at
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();