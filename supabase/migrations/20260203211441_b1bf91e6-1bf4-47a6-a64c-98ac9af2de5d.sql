-- Function 1: Create a participant transfer request
CREATE OR REPLACE FUNCTION public.create_participant_transfer_request(
  p_source_group_id UUID,
  p_target_group_id UUID,
  p_participant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requesting_instructor_id UUID;
  v_new_request_id UUID;
BEGIN
  -- Get the instructor ID of the currently authenticated user
  v_requesting_instructor_id := public.get_instructor_for_user(auth.uid());

  -- Authorization Check: Ensure the user is an instructor
  IF v_requesting_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Authorization Check: Ensure the instructor is the leader of the source group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_course_instances
    WHERE id = p_source_group_id
      AND instructor_id = v_requesting_instructor_id
  ) THEN
    RAISE EXCEPTION 'You are not the leader of the source group';
  END IF;

  -- Insert the new request
  INSERT INTO public.participant_transfer_requests (
    source_group_id,
    target_group_id,
    participant_id,
    requesting_instructor_id
  )
  VALUES (
    p_source_group_id,
    p_target_group_id,
    p_participant_id,
    v_requesting_instructor_id
  )
  RETURNING id INTO v_new_request_id;

  -- Return the ID of the newly created request
  RETURN jsonb_build_object('status', 'success', 'request_id', v_new_request_id);
END;
$$;

-- Function 2: Respond to a participant transfer request (accept/reject)
CREATE OR REPLACE FUNCTION public.respond_to_participant_transfer(
  p_request_id UUID,
  p_response TEXT -- 'accepted' or 'rejected'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_responding_instructor_id UUID;
  v_request RECORD;
  v_target_course RECORD;
  v_enrollment_id UUID;
BEGIN
  -- Validate response value
  IF p_response NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid response. Must be "accepted" or "rejected"';
  END IF;

  -- Get the instructor ID of the currently authenticated user
  v_responding_instructor_id := public.get_instructor_for_user(auth.uid());

  -- Authorization Check: Ensure the user is an instructor
  IF v_responding_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Fetch the request details
  SELECT * INTO v_request
  FROM public.participant_transfer_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'This request has already been processed';
  END IF;

  -- Authorization Check: Ensure the responder is the leader of the target group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_course_instances
    WHERE id = v_request.target_group_id
      AND instructor_id = v_responding_instructor_id
  ) THEN
    RAISE EXCEPTION 'You are not the leader of the target group';
  END IF;

  -- Update the request status
  UPDATE public.participant_transfer_requests
  SET status = p_response
  WHERE id = p_request_id;

  -- If the request is accepted, perform the transfer logic
  IF p_response = 'accepted' THEN
    -- 1. Find the participant's enrollment in the source group instance
    SELECT e.id INTO v_enrollment_id
    FROM public.group_course_enrollments e
    WHERE e.instance_id = v_request.source_group_id
      AND e.participant_id = v_request.participant_id
    LIMIT 1;

    IF v_enrollment_id IS NULL THEN
      RAISE EXCEPTION 'Could not find the enrollment for the participant in the source group';
    END IF;

    -- 2. Update the enrollment to point to the new group instance
    -- Store original course for tracking if not already set
    UPDATE public.group_course_enrollments
    SET 
      instance_id = v_request.target_group_id,
      original_course_id = COALESCE(original_course_id, (
        SELECT course_id FROM public.group_course_instances WHERE id = v_request.source_group_id
      ))
    WHERE id = v_enrollment_id;

    -- 3. Get the target course details (for skill level update)
    SELECT gc.id, gc.skill_level_id, gc.discipline
    INTO v_target_course
    FROM public.group_course_instances gci
    JOIN public.group_courses gc ON gc.id = gci.course_id
    WHERE gci.id = v_request.target_group_id;

    -- 4. Update the participant's skill level based on discipline
    IF v_target_course.skill_level_id IS NOT NULL THEN
      IF v_target_course.discipline = 'ski' THEN
        UPDATE public.customer_participants
        SET current_ski_level_id = v_target_course.skill_level_id
        WHERE id = v_request.participant_id;
      ELSIF v_target_course.discipline = 'snowboard' THEN
        UPDATE public.customer_participants
        SET current_snowboard_level_id = v_target_course.skill_level_id
        WHERE id = v_request.participant_id;
      END IF;
    END IF;

    -- 5. Update participant counts on both instances
    UPDATE public.group_course_instances
    SET current_participants = GREATEST(0, COALESCE(current_participants, 0) - 1)
    WHERE id = v_request.source_group_id;

    UPDATE public.group_course_instances
    SET current_participants = COALESCE(current_participants, 0) + 1
    WHERE id = v_request.target_group_id;
  END IF;

  RETURN jsonb_build_object('status', 'success', 'new_status', p_response);
END;
$$;

-- Function 3: Allow requesting instructor to cancel their own request
CREATE OR REPLACE FUNCTION public.cancel_participant_transfer_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_id UUID;
  v_request RECORD;
BEGIN
  -- Get the instructor ID of the currently authenticated user
  v_instructor_id := public.get_instructor_for_user(auth.uid());

  IF v_instructor_id IS NULL THEN
    RAISE EXCEPTION 'User is not a registered instructor';
  END IF;

  -- Fetch the request
  SELECT * INTO v_request
  FROM public.participant_transfer_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  -- Authorization: Only the requesting instructor can cancel
  IF v_request.requesting_instructor_id != v_instructor_id THEN
    RAISE EXCEPTION 'You can only cancel your own transfer requests';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be canceled';
  END IF;

  -- Update the status
  UPDATE public.participant_transfer_requests
  SET status = 'canceled'
  WHERE id = p_request_id;

  RETURN jsonb_build_object('status', 'success', 'new_status', 'canceled');
END;
$$;