-- Phase 1: Group Capacity Management System Schema

-- 1.1 Create training_groups table for sub-groups within a training level per week
CREATE TABLE training_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES group_courses(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  group_number INTEGER DEFAULT 1,
  custom_name TEXT,
  
  -- Instructors (primary + optional assistant)
  instructor_id UUID REFERENCES instructors(id),
  assistant_instructor_id UUID REFERENCES instructors(id),
  
  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'merged', 'cancelled')),
  merged_into_group_id UUID REFERENCES training_groups(id),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(course_id, week_start, group_number)
);

-- Indexes for quick lookups
CREATE INDEX idx_training_groups_week ON training_groups(week_start);
CREATE INDEX idx_training_groups_course ON training_groups(course_id);
CREATE INDEX idx_training_groups_status ON training_groups(status);

-- 1.2 Add columns to group_course_enrollments
ALTER TABLE group_course_enrollments 
  ADD COLUMN IF NOT EXISTS training_group_id UUID REFERENCES training_groups(id),
  ADD COLUMN IF NOT EXISTS original_course_id UUID REFERENCES group_courses(id);

CREATE INDEX idx_enrollments_training_group ON group_course_enrollments(training_group_id);

-- 1.3 Add min_participants to group_courses
ALTER TABLE group_courses 
  ADD COLUMN IF NOT EXISTS min_participants INTEGER DEFAULT 4;

-- Enable RLS on training_groups
ALTER TABLE training_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_groups
CREATE POLICY "Admin/office can manage training_groups"
ON training_groups
FOR ALL
USING (is_admin_or_office(auth.uid()));

CREATE POLICY "Authenticated users can view training_groups"
ON training_groups
FOR SELECT
USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_training_groups_updated_at
  BEFORE UPDATE ON training_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2.1 RPC: Generate training groups for a week
CREATE OR REPLACE FUNCTION generate_training_groups_for_week(p_week_start DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  course_record RECORD;
  new_group_id UUID;
  groups_created INTEGER := 0;
  enrollments_assigned INTEGER := 0;
BEGIN
  -- For each active weekly course with instances in this week
  FOR course_record IN 
    SELECT DISTINCT gc.id as course_id, gc.name as course_name
    FROM group_courses gc
    JOIN group_course_instances gci ON gci.course_id = gc.id
    WHERE gci.date >= p_week_start 
      AND gci.date < p_week_start + INTERVAL '7 days'
      AND gc.course_type = 'weekly'
      AND gc.is_active = true
  LOOP
    -- Check if group 1 already exists
    SELECT id INTO new_group_id
    FROM training_groups
    WHERE course_id = course_record.course_id
      AND week_start = p_week_start
      AND group_number = 1;
    
    -- Create group 1 if not exists
    IF new_group_id IS NULL THEN
      INSERT INTO training_groups (course_id, week_start, group_number)
      VALUES (course_record.course_id, p_week_start, 1)
      RETURNING id INTO new_group_id;
      
      groups_created := groups_created + 1;
    END IF;
    
    -- Assign enrollments without a training_group_id to this group
    UPDATE group_course_enrollments e
    SET training_group_id = new_group_id
    FROM group_course_instances i
    WHERE e.instance_id = i.id
      AND i.course_id = course_record.course_id
      AND i.date >= p_week_start 
      AND i.date < p_week_start + INTERVAL '7 days'
      AND e.training_group_id IS NULL;
    
    enrollments_assigned := enrollments_assigned + (SELECT COUNT(*) FROM group_course_enrollments WHERE training_group_id = new_group_id);
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'groups_created', groups_created,
    'enrollments_assigned', enrollments_assigned
  );
END;
$$;

-- 2.2 RPC: Split a training group
CREATE OR REPLACE FUNCTION split_training_group(
  p_source_group_id UUID,
  p_new_groups JSONB -- Array of { group_number, custom_name, instructor_id, participant_ids[] }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_group RECORD;
  new_group JSONB;
  new_group_id UUID;
  participant_id UUID;
  groups_created INTEGER := 0;
BEGIN
  -- Get source group info
  SELECT * INTO source_group FROM training_groups WHERE id = p_source_group_id;
  
  IF source_group IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Source group not found');
  END IF;
  
  -- Process each new group
  FOR new_group IN SELECT * FROM jsonb_array_elements(p_new_groups)
  LOOP
    -- Insert new group
    INSERT INTO training_groups (
      course_id,
      week_start,
      group_number,
      custom_name,
      instructor_id,
      status
    )
    VALUES (
      source_group.course_id,
      source_group.week_start,
      (new_group->>'group_number')::INTEGER,
      new_group->>'custom_name',
      (new_group->>'instructor_id')::UUID,
      'active'
    )
    ON CONFLICT (course_id, week_start, group_number) 
    DO UPDATE SET
      custom_name = EXCLUDED.custom_name,
      instructor_id = EXCLUDED.instructor_id,
      updated_at = NOW()
    RETURNING id INTO new_group_id;
    
    groups_created := groups_created + 1;
    
    -- Move participants to new group
    FOR participant_id IN SELECT jsonb_array_elements_text(new_group->'participant_ids')::UUID
    LOOP
      UPDATE group_course_enrollments
      SET training_group_id = new_group_id
      WHERE id = participant_id;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'groups_created', groups_created
  );
END;
$$;

-- 2.3 RPC: Merge training groups
CREATE OR REPLACE FUNCTION merge_training_groups(
  p_source_group_ids UUID[],
  p_target_group_id UUID,
  p_new_group_name TEXT DEFAULT NULL,
  p_instructor_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  -- Update target group if new name/instructor provided
  IF p_new_group_name IS NOT NULL OR p_instructor_id IS NOT NULL THEN
    UPDATE training_groups
    SET 
      custom_name = COALESCE(p_new_group_name, custom_name),
      instructor_id = COALESCE(p_instructor_id, instructor_id),
      updated_at = NOW()
    WHERE id = p_target_group_id;
  END IF;
  
  -- Move all participants from source groups to target
  FOREACH source_id IN ARRAY p_source_group_ids
  LOOP
    IF source_id != p_target_group_id THEN
      -- Save original course for tracking
      UPDATE group_course_enrollments e
      SET 
        training_group_id = p_target_group_id,
        original_course_id = COALESCE(e.original_course_id, (
          SELECT i.course_id 
          FROM group_course_instances i 
          WHERE i.id = e.instance_id
        ))
      WHERE e.training_group_id = source_id;
      
      participants_moved := participants_moved + (
        SELECT COUNT(*) FROM group_course_enrollments WHERE training_group_id = p_target_group_id
      );
      
      -- Mark source group as merged
      UPDATE training_groups
      SET 
        status = 'merged',
        merged_into_group_id = p_target_group_id,
        updated_at = NOW()
      WHERE id = source_id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'success',
    'participants_moved', participants_moved
  );
END;
$$;

-- 2.4 RPC: Move single participant to different group
CREATE OR REPLACE FUNCTION move_participant_to_group(
  p_enrollment_id UUID,
  p_target_group_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enrollment_record RECORD;
BEGIN
  -- Get enrollment info
  SELECT e.*, i.course_id as current_course_id
  INTO enrollment_record
  FROM group_course_enrollments e
  JOIN group_course_instances i ON i.id = e.instance_id
  WHERE e.id = p_enrollment_id;
  
  IF enrollment_record IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Enrollment not found');
  END IF;
  
  -- Update enrollment with new group, preserve original course
  UPDATE group_course_enrollments
  SET 
    training_group_id = p_target_group_id,
    original_course_id = COALESCE(original_course_id, enrollment_record.current_course_id)
  WHERE id = p_enrollment_id;
  
  RETURN jsonb_build_object('status', 'success');
END;
$$;