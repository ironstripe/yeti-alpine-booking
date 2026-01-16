-- Add course type and period fields to group_courses
ALTER TABLE group_courses ADD COLUMN IF NOT EXISTS course_type TEXT 
  DEFAULT 'weekly' 
  CHECK (course_type IN ('weekly', 'saturday_course', 'custom'));

ALTER TABLE group_courses ADD COLUMN IF NOT EXISTS period_start_date DATE;
ALTER TABLE group_courses ADD COLUMN IF NOT EXISTS period_end_date DATE;

-- Create training_course_dates table for Saturday courses
CREATE TABLE IF NOT EXISTS training_course_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES group_courses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_cancelled BOOLEAN DEFAULT false,
  instructor_id UUID REFERENCES instructors(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(training_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_dates_training ON training_course_dates(training_id);
CREATE INDEX IF NOT EXISTS idx_course_dates_date ON training_course_dates(date);

-- Enable RLS
ALTER TABLE training_course_dates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view course dates" 
  ON training_course_dates FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin/office can manage course dates" 
  ON training_course_dates FOR ALL 
  USING (is_admin_or_office(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_training_course_dates_updated_at
  BEFORE UPDATE ON training_course_dates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();