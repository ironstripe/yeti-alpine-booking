-- Add time columns for partial-day absence support
ALTER TABLE instructor_absences
ADD COLUMN time_start TIME,
ADD COLUMN time_end TIME,
ADD COLUMN is_full_day BOOLEAN DEFAULT TRUE;

-- Add comment for clarity
COMMENT ON COLUMN instructor_absences.is_full_day IS 'When true, blocks entire day. When false, uses time_start and time_end.';
COMMENT ON COLUMN instructor_absences.time_start IS 'Start time for partial-day absences (e.g., 12:00)';
COMMENT ON COLUMN instructor_absences.time_end IS 'End time for partial-day absences (e.g., 14:00)';