-- Make skill_level_id nullable since trainings ARE the levels now
-- and we no longer require this mapping
ALTER TABLE group_courses 
  ALTER COLUMN skill_level_id DROP NOT NULL;