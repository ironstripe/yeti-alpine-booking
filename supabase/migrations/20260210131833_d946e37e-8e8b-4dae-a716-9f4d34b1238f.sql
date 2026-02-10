
CREATE OR REPLACE FUNCTION public.merge_training_groups(
  p_source_group_ids uuid[],
  p_target_group_id uuid,
  p_new_group_name text DEFAULT NULL::text,
  p_instructor_id uuid DEFAULT NULL::uuid,
  p_assistant_instructor_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  -- Always update target group with the user's chosen values
  UPDATE training_groups
  SET 
    custom_name = COALESCE(p_new_group_name, custom_name),
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id,
    updated_at = NOW()
  WHERE id = p_target_group_id;
  
  -- Move all participants from source groups to target
  FOREACH source_id IN ARRAY p_source_group_ids
  LOOP
    IF source_id != p_target_group_id THEN
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
$function$;
