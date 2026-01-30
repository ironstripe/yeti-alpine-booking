-- Phase 1: Update role column and add office shift products

-- Update default value for role column (was 'rolle_1')
ALTER TABLE instructors 
  ALTER COLUMN role SET DEFAULT 'instructor';

-- Update existing values to meaningful role names
UPDATE instructors SET role = 'instructor' 
  WHERE role IS NULL OR role = 'rolle_1' OR role = '';

-- Add check constraint for valid roles
ALTER TABLE instructors 
  ADD CONSTRAINT check_staff_role 
  CHECK (role IN ('instructor', 'office_staff', 'management', 'hilfslehrer'));

-- Add index for filtering by role
CREATE INDEX IF NOT EXISTS idx_instructors_role ON instructors(role);

-- Add office shift products
INSERT INTO products (name, type, duration_minutes, price, is_active)
VALUES 
  ('Büro-Schicht Vormittag', 'office_shift', 240, 0, true),
  ('Büro-Schicht Nachmittag', 'office_shift', 240, 0, true)
ON CONFLICT DO NOTHING;