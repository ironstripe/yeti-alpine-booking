-- Create action_tasks table for dynamic tasks like "assign instructor"
CREATE TABLE public.action_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  task_type TEXT NOT NULL, -- 'assign_instructor', 'follow_up', etc.
  title TEXT NOT NULL,
  description TEXT,
  related_ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  related_ticket_item_id UUID REFERENCES public.ticket_items(id) ON DELETE CASCADE,
  due_date DATE,
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high'
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'completed', 'dismissed'
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view all action_tasks"
  ON public.action_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert action_tasks"
  ON public.action_tasks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update action_tasks"
  ON public.action_tasks FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete action_tasks"
  ON public.action_tasks FOR DELETE TO authenticated USING (true);

-- Add index for common queries
CREATE INDEX idx_action_tasks_status ON public.action_tasks(status);
CREATE INDEX idx_action_tasks_task_type ON public.action_tasks(task_type);
CREATE INDEX idx_action_tasks_related_ticket ON public.action_tasks(related_ticket_id);