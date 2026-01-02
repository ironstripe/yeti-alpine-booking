-- Create ticket_comments table for comment history
CREATE TABLE public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_item_id uuid REFERENCES ticket_items(id) ON DELETE CASCADE,
  comment_type text NOT NULL CHECK (comment_type IN ('internal', 'instructor')),
  content text NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Indexes for faster queries
CREATE INDEX idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_ticket_item_id ON public.ticket_comments(ticket_item_id);
CREATE INDEX idx_ticket_comments_type ON public.ticket_comments(comment_type);

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view all comments" 
  ON public.ticket_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert comments" 
  ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update own comments" 
  ON public.ticket_comments FOR UPDATE TO authenticated USING (created_by_user_id = auth.uid());

CREATE POLICY "Authenticated users can delete own comments" 
  ON public.ticket_comments FOR DELETE TO authenticated USING (created_by_user_id = auth.uid());