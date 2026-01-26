-- Table for task templates (recurring definitions)
CREATE TABLE daily_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  due_time TIME,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('daily', 'weekdays', 'weekly')),
  weekdays INTEGER[] DEFAULT '{1,2,3,4,5}',
  linked_action TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for task completions (daily tracking)
CREATE TABLE daily_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES daily_task_templates(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  completed_by UUID,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(template_id, completed_date)
);

-- Enable RLS
ALTER TABLE daily_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_task_completions ENABLE ROW LEVEL SECURITY;

-- Policies for templates
CREATE POLICY "Authenticated users can view daily_task_templates" 
ON daily_task_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert daily_task_templates" 
ON daily_task_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update daily_task_templates" 
ON daily_task_templates FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete daily_task_templates" 
ON daily_task_templates FOR DELETE TO authenticated USING (true);

-- Policies for completions
CREATE POLICY "Authenticated users can view daily_task_completions" 
ON daily_task_completions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert daily_task_completions" 
ON daily_task_completions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete daily_task_completions" 
ON daily_task_completions FOR DELETE TO authenticated USING (true);

-- Insert default tasks
INSERT INTO daily_task_templates (title, due_time, recurrence, weekdays, linked_action, sort_order) VALUES
  ('Mittagsliste drucken', '09:00', 'weekdays', '{1,2,3,4,5}', 'print_lunch_list', 1),
  ('Gruppeneinteilung prüfen', '08:30', 'weekdays', '{1,2,3,4,5}', NULL, 2),
  ('Kasse zählen', '17:00', 'weekdays', '{1,2,3,4,5}', NULL, 3),
  ('Wochenbericht erstellen', '16:00', 'weekly', '{5}', NULL, 4);