-- =====================================================
-- YETY Ski School - Groups, Trainings & Conversations
-- =====================================================

-- Create groups table (group courses)
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  sport TEXT DEFAULT 'ski',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  time_morning_start TIME DEFAULT '10:00',
  time_morning_end TIME DEFAULT '12:00',
  time_afternoon_start TIME DEFAULT '14:00',
  time_afternoon_end TIME DEFAULT '16:00',
  meeting_point TEXT DEFAULT 'Hotel Gorfion',
  instructor_id UUID REFERENCES public.instructors(id),
  max_participants INTEGER DEFAULT 12,
  min_participants INTEGER DEFAULT 5,
  status TEXT DEFAULT 'planned',
  notes TEXT
);

-- Create indexes for groups
CREATE INDEX idx_groups_start_date ON public.groups(start_date);
CREATE INDEX idx_groups_instructor_id ON public.groups(instructor_id);
CREATE INDEX idx_groups_status ON public.groups(status);

-- Enable RLS on groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for groups
CREATE POLICY "Authenticated users can view all groups"
ON public.groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert groups"
ON public.groups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update groups"
ON public.groups FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete groups"
ON public.groups FOR DELETE TO authenticated USING (true);

-- Create trainings table (internal training events)
CREATE TABLE public.trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  location TEXT,
  lead_instructor_id UUID REFERENCES public.instructors(id),
  max_participants INTEGER,
  is_mandatory BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'planned',
  notes TEXT
);

-- Create index for trainings
CREATE INDEX idx_trainings_date ON public.trainings(date);

-- Enable RLS on trainings
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

-- RLS policies for trainings
CREATE POLICY "Authenticated users can view all trainings"
ON public.trainings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert trainings"
ON public.trainings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update trainings"
ON public.trainings FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete trainings"
ON public.trainings FOR DELETE TO authenticated USING (true);

-- Create training_participants table (instructor participation tracking)
CREATE TABLE public.training_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'invited',
  confirmed_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(training_id, instructor_id)
);

-- Create indexes for training_participants
CREATE INDEX idx_training_participants_training_id ON public.training_participants(training_id);
CREATE INDEX idx_training_participants_instructor_id ON public.training_participants(instructor_id);

-- Enable RLS on training_participants
ALTER TABLE public.training_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies for training_participants
CREATE POLICY "Authenticated users can view all training_participants"
ON public.training_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert training_participants"
ON public.training_participants FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update training_participants"
ON public.training_participants FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete training_participants"
ON public.training_participants FOR DELETE TO authenticated USING (true);

-- Create conversations table (unified inbox)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  customer_id UUID REFERENCES public.customers(id),
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'unread',
  assigned_to UUID,
  ai_extracted_data JSONB,
  ai_confidence_score NUMERIC,
  processed_at TIMESTAMPTZ,
  related_ticket_id UUID REFERENCES public.tickets(id),
  notes TEXT
);

-- Create indexes for conversations
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_channel ON public.conversations(channel);
CREATE INDEX idx_conversations_customer_id ON public.conversations(customer_id);
CREATE INDEX idx_conversations_created_at_desc ON public.conversations(created_at DESC);

-- Enable RLS on conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations
CREATE POLICY "Authenticated users can view all conversations"
ON public.conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert conversations"
ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update conversations"
ON public.conversations FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete conversations"
ON public.conversations FOR DELETE TO authenticated USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.groups IS 'Group courses bundling multiple participants with one instructor';
COMMENT ON COLUMN public.groups.level IS 'Skill level: Snow Kids Village, Blue Prince, Blue King, etc.';
COMMENT ON COLUMN public.groups.status IS 'Group status: planned, confirmed, in_progress, completed, cancelled';

COMMENT ON TABLE public.trainings IS 'Internal instructor training events';
COMMENT ON COLUMN public.trainings.lead_instructor_id IS 'Responsible trainer for this training';
COMMENT ON COLUMN public.trainings.status IS 'Training status: planned, confirmed, completed, cancelled';

COMMENT ON TABLE public.training_participants IS 'Tracks instructor participation in trainings';
COMMENT ON COLUMN public.training_participants.status IS 'Participation status: invited, confirmed, declined, attended, no_show';

COMMENT ON TABLE public.conversations IS 'Unified inbox for all incoming messages';
COMMENT ON COLUMN public.conversations.channel IS 'Message channel: whatsapp, email, phone, walkin';
COMMENT ON COLUMN public.conversations.ai_extracted_data IS 'AI-parsed booking suggestion as JSON';
COMMENT ON COLUMN public.conversations.ai_confidence_score IS 'AI parsing confidence score (0-1)';