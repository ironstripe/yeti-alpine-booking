-- ====================================================================
-- Group Course Planning RPC Functions
-- 
-- Three functions for managing the weekly lifecycle of group courses:
-- 1. generate_group_course_instances_for_week - Creates instances from schedules
-- 2. assign_instructor_to_course_week - Bulk assigns instructors to a course
-- 3. copy_instructor_assignments_from_previous_week - Copies previous week's assignments
-- ====================================================================

-- ====================================================================
-- Function 1: generate_group_course_instances_for_week
-- 
-- Purpose: Creates group_course_instances records for all active courses
--          based on their schedules for a specific week.
--
-- Parameters:
--   p_week_start_date: The Monday of the target week (DATE)
--
-- Returns: JSONB with status, message, and instances_created count
--
-- Security: Only admin or office users can execute
-- ====================================================================

CREATE OR REPLACE FUNCTION public.generate_group_course_instances_for_week(
  p_week_start_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_end_date DATE;
  v_instance_count INT := 0;
  v_schedule_record RECORD;
  v_instance_date DATE;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can generate instances.'
    );
  END IF;

  -- Calculate week boundaries (Monday to Sunday)
  v_week_end_date := p_week_start_date + 6;

  -- Loop through all active schedules for active group courses
  FOR v_schedule_record IN
    SELECT 
      s.id AS schedule_id,
      s.course_id,
      s.day_of_week,
      s.start_time,
      s.end_time
    FROM public.group_course_schedules s
    JOIN public.group_courses c ON s.course_id = c.id
    WHERE c.is_active = TRUE
      AND s.is_active = TRUE
      AND c.course_type = 'weekly'
  LOOP
    -- Calculate the actual date: week_start (Monday) + day_of_week offset
    -- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
    -- Adjust calculation: if day_of_week=0 (Sunday), it's +6 from Monday
    IF v_schedule_record.day_of_week = 0 THEN
      v_instance_date := p_week_start_date + 6;
    ELSE
      v_instance_date := p_week_start_date + (v_schedule_record.day_of_week - 1);
    END IF;

    -- Insert the instance if it doesn't already exist
    INSERT INTO public.group_course_instances (
      course_id,
      schedule_id,
      date,
      start_time,
      end_time,
      instructor_id,
      assistant_instructor_id,
      status,
      current_participants,
      notes
    )
    VALUES (
      v_schedule_record.course_id,
      v_schedule_record.schedule_id,
      v_instance_date,
      v_schedule_record.start_time,
      v_schedule_record.end_time,
      NULL,
      NULL,
      'scheduled',
      0,
      NULL
    )
    ON CONFLICT (course_id, date, start_time) DO NOTHING;

    -- Check if a row was inserted
    IF FOUND THEN
      v_instance_count := v_instance_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Week generation complete.',
    'instances_created', v_instance_count,
    'week_start', p_week_start_date,
    'week_end', v_week_end_date
  );
END;
$$;

-- ====================================================================
-- Function 2: assign_instructor_to_course_week
--
-- Purpose: Assigns instructor(s) to all instances of a course for a week
--
-- Parameters:
--   p_course_id: The group course ID
--   p_week_start_date: The Monday of the target week
--   p_instructor_id: The main instructor to assign
--   p_assistant_instructor_id: Optional assistant instructor (NULL to keep/clear)
--
-- Returns: JSONB with status, message, and instances_updated count
-- ====================================================================

CREATE OR REPLACE FUNCTION public.assign_instructor_to_course_week(
  p_course_id UUID,
  p_week_start_date DATE,
  p_instructor_id UUID,
  p_assistant_instructor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_end_date DATE;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can assign instructors.'
    );
  END IF;

  v_week_end_date := p_week_start_date + 6;

  -- Update all instances for the given course in the given week
  UPDATE public.group_course_instances
  SET 
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id
  WHERE course_id = p_course_id
    AND date >= p_week_start_date
    AND date <= v_week_end_date;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments updated.',
    'instances_updated', v_updated_count,
    'course_id', p_course_id,
    'instructor_id', p_instructor_id,
    'assistant_instructor_id', p_assistant_instructor_id
  );
END;
$$;

-- ====================================================================
-- Function 3: copy_instructor_assignments_from_previous_week
--
-- Purpose: Copies instructor assignments from the previous week to target week
--          for all courses that had assignments
--
-- Parameters:
--   p_target_week_start_date: The Monday of the week to copy TO
--
-- Returns: JSONB with status, message, and courses_copied count
-- ====================================================================

CREATE OR REPLACE FUNCTION public.copy_instructor_assignments_from_previous_week(
  p_target_week_start_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_week_start DATE;
  v_source_week_end DATE;
  v_target_week_end DATE;
  v_assignment_record RECORD;
  v_copied_count INT := 0;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can copy assignments.'
    );
  END IF;

  v_source_week_start := p_target_week_start_date - 7;
  v_source_week_end := v_source_week_start + 6;
  v_target_week_end := p_target_week_start_date + 6;

  -- Loop through distinct course assignments from the source week
  FOR v_assignment_record IN
    SELECT DISTINCT 
      course_id,
      instructor_id,
      assistant_instructor_id
    FROM public.group_course_instances
    WHERE date >= v_source_week_start
      AND date <= v_source_week_end
      AND instructor_id IS NOT NULL
  LOOP
    -- Apply the assignment to all instances of this course in target week
    UPDATE public.group_course_instances
    SET 
      instructor_id = v_assignment_record.instructor_id,
      assistant_instructor_id = v_assignment_record.assistant_instructor_id
    WHERE course_id = v_assignment_record.course_id
      AND date >= p_target_week_start_date
      AND date <= v_target_week_end;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count > 0 THEN
      v_copied_count := v_copied_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments copied from previous week.',
    'courses_copied', v_copied_count,
    'source_week', v_source_week_start,
    'target_week', p_target_week_start_date
  );
END;
$$;