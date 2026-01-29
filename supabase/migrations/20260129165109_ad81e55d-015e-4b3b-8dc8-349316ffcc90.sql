-- =============================================
-- SIMPLIFY GROUP COURSE DATA MODEL
-- Trainings ARE the skill levels for children
-- =============================================

-- 1. Add new columns to group_courses for progression tracking
ALTER TABLE group_courses 
  ADD COLUMN IF NOT EXISTS next_training_id UUID REFERENCES group_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 2. Rename participant skill level columns to training references
-- First add new columns
ALTER TABLE customer_participants
  ADD COLUMN IF NOT EXISTS current_ski_training_id UUID REFERENCES group_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_snowboard_training_id UUID REFERENCES group_courses(id) ON DELETE SET NULL;

-- 3. Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_group_courses_next_training ON group_courses(next_training_id);
CREATE INDEX IF NOT EXISTS idx_participants_ski_training ON customer_participants(current_ski_training_id);
CREATE INDEX IF NOT EXISTS idx_participants_snowboard_training ON customer_participants(current_snowboard_training_id);

-- 4. Note: We'll migrate existing skill_level_id data to new columns in a separate step
-- and keep skill_level_id for now as it's still referenced in code until the frontend is updated

-- 5. Note: self_assessed_ski_level and self_assessed_snowboard_level remain unchanged
-- They are only used for adult private lessons