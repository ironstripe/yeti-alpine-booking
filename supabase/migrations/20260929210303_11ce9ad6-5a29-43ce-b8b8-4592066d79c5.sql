-- P0.2 Step 1: lock down SECURITY DEFINER functions. Additive: no table/policy changes.
-- Helper functions used inside RLS policies (has_role, is_admin_or_office, get_instructor_for_user)
-- are intentionally left unchanged so existing policies keep evaluating.

REVOKE EXECUTE ON FUNCTION public.search_customers(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_training_groups(uuid[], uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_training_groups(uuid[], uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.split_training_group(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.move_participant_to_group(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_training_groups_for_week(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.duplicate_products_for_season(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_recurring_block_conflicts(uuid, time, time, integer[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_customers(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_training_groups(uuid[], uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_training_groups(uuid[], uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.split_training_group(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_participant_to_group(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_training_groups_for_week(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_products_for_season(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_recurring_block_conflicts(uuid, time, time, integer[], date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.queue_confirmation_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_confirmation_reminders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_instructor_to_course_week(uuid, date, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copy_instructor_assignments_from_previous_week(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_next_friday_race_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_group_course_instances_for_week(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_customers(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_participants(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.preview_customer_merge(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rollback_entity_merge(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_instructor_capabilities(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_participant_transfer_request(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_participant_transfer_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_to_participant_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_instructor_to_course_week(uuid, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copy_instructor_assignments_from_previous_week(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_next_friday_race_event() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_group_course_instances_for_week(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_participants(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_customer_merge(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_entity_merge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_instructor_capabilities(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_participant_transfer_request(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_participant_transfer_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_to_participant_transfer(uuid, text) TO authenticated, service_role;

-- Trigger-only functions (EXECUTE is not checked when a trigger fires).
REVOKE EXECUTE ON FUNCTION public.ensure_single_primary_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_credit_remaining() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_group_instance_instructor_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_item_instructor_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_booking_cancelled() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ticket_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ticket_item_instructor_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ticket_status_changed() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_recurring_block_conflicts(p_instructor_id uuid, p_start_time time without time zone, p_end_time time without time zone, p_weekdays integer[], p_valid_from date, p_valid_until date)
 RETURNS TABLE(booking_id uuid, booking_date date, time_start time without time zone, time_end time without time zone, participant_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT (public.is_admin_or_office(auth.uid())
          OR (auth.uid() IS NOT NULL AND p_instructor_id = public.get_instructor_for_user(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT 
    ti.id,
    ti.date,
    ti.time_start::TIME,
    ti.time_end::TIME,
    COALESCE(cp.first_name || ' ' || cp.last_name, 'Unbekannt')
  FROM public.ticket_items ti
  LEFT JOIN public.customer_participants cp ON cp.id = ti.participant_id
  WHERE ti.instructor_id = p_instructor_id
    AND ti.date >= p_valid_from
    AND (p_valid_until IS NULL OR ti.date <= p_valid_until)
    AND EXTRACT(DOW FROM ti.date)::INTEGER = ANY(p_weekdays)
    AND ti.time_start::TIME < p_end_time
    AND ti.time_end::TIME > p_start_time
    AND ti.status NOT IN ('cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION public.duplicate_products_for_season(p_source_season_id uuid, p_target_season_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_product RECORD;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR v_product IN
    SELECT * FROM public.products WHERE season_id = p_source_season_id
  LOOP
    INSERT INTO public.products (
      season_id, name, description, type, price, currency, vat_rate,
      duration_minutes, min_age, max_age, is_active, sort_order, pricing_type,
      is_training_product, discipline, audience, reporting_category
    ) VALUES (
      p_target_season_id, v_product.name, v_product.description, v_product.type,
      v_product.price, v_product.currency, v_product.vat_rate, v_product.duration_minutes,
      v_product.min_age, v_product.max_age, v_product.is_active, v_product.sort_order,
      v_product.pricing_type, v_product.is_training_product,
      v_product.discipline, v_product.audience, v_product.reporting_category
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.product_price_tiers (product_id, min_participants, max_participants, price, sort_order)
    SELECT v_new_id, min_participants, max_participants, price, sort_order
    FROM public.product_price_tiers WHERE product_id = v_product.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_training_groups_for_week(p_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  course_record RECORD;
  new_group_id UUID;
  groups_created INTEGER := 0;
  enrollments_assigned INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.merge_training_groups(p_source_group_ids uuid[], p_target_group_id uuid, p_new_group_name text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.merge_training_groups(p_source_group_ids uuid[], p_target_group_id uuid, p_new_group_name text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid, p_assistant_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  source_id UUID;
  participants_moved INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.move_participant_to_group(p_enrollment_id uuid, p_target_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enrollment_record RECORD;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.search_customers(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, customer_number text, first_name text, last_name text, organization_name text, customer_type text, email text, phone text, city text, country text, participant_names text[], match_reason text, match_rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := public.yeti_normalize(p_query);
  v_tokens text[];
  v_digits text := public.yeti_digits(p_query);
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RETURN;
  END IF;
  v_tokens := string_to_array(v_norm, ' ');

  RETURN QUERY
  WITH base AS (
    SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
           c.customer_type, c.email, c.phone, c.city, c.country,
           public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name || ' ' ||
             coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '') || ' ' ||
             coalesce(c.organization_name, '') || ' ' || coalesce(c.email, '') || ' ' ||
             coalesce(c.billing_email, '') || ' ' || coalesce(c.customer_number, '')) AS hay,
           public.yeti_digits(coalesce(c.phone, '')) || ' ' ||
             public.yeti_digits(coalesce(c.additional_phones::text, '')) AS phone_hay,
           lower(coalesce(c.customer_number, '')) AS cnum,
           lower(coalesce(c.email, '')) AS cmail
    FROM public.customers c
    WHERE c.is_archived = false
  ),
  parts AS (
    SELECT p.customer_id,
           array_agg(btrim(p.first_name || ' ' || coalesce(p.last_name, '')) ORDER BY p.first_name) AS names,
           array_agg(public.yeti_normalize(p.first_name || ' ' || coalesce(p.last_name, ''))) AS norm_names
    FROM public.customer_participants p
    WHERE p.is_archived = false
    GROUP BY p.customer_id
  ),
  candidates AS (
    SELECT b.*, pa.names, pa.norm_names,
      (SELECT bool_and(b.hay LIKE '%' || tk || '%') FROM unnest(v_tokens) tk) AS all_in_customer,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE (SELECT bool_and((b.hay || ' ' || pn) LIKE '%' || tk || '%') FROM unnest(v_tokens) tk)
      ) AS all_with_participant,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE pn = v_norm
      ) AS participant_exact,
      (length(v_digits) >= 5 AND b.phone_hay LIKE '%' || v_digits || '%') AS phone_hit
    FROM base b
    LEFT JOIN parts pa ON pa.customer_id = b.id
  )
  SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
         c.customer_type, c.email, c.phone, c.city, c.country,
         coalesce(c.names, ARRAY[]::text[]) AS participant_names,
         CASE
           WHEN c.cnum = v_norm THEN 'Kundennummer ' || c.customer_number
           WHEN c.cmail = v_norm THEN 'E-Mail-Treffer'
           WHEN c.phone_hit THEN 'Telefonnummer-Treffer'
           WHEN c.participant_exact THEN 'Gefunden über Teilnehmer/in ' ||
             (SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE public.yeti_normalize(n) = v_norm LIMIT 1)
           WHEN c.all_in_customer THEN 'Namenstreffer'
           WHEN c.all_with_participant THEN 'Gefunden über Teilnehmer/in ' ||
             coalesce((SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE (SELECT bool_and((c.hay || ' ' || public.yeti_normalize(n)) LIKE '%' || tk || '%')
                     FROM unnest(v_tokens) tk) LIMIT 1), '')
           ELSE 'Treffer'
         END AS match_reason,
         CASE
           WHEN c.cnum = v_norm THEN 1
           WHEN c.cmail = v_norm OR c.phone_hit THEN 2
           WHEN c.all_in_customer AND public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name) = v_norm THEN 3
           WHEN c.all_in_customer AND public.yeti_normalize(c.last_name || ' ' || coalesce(c.first_name, '')) = v_norm THEN 3
           WHEN c.participant_exact THEN 4
           WHEN c.hay LIKE v_norm || '%' THEN 5
           ELSE 6
         END::integer AS match_rank
  FROM candidates c
  WHERE c.all_in_customer OR c.all_with_participant OR c.phone_hit
  ORDER BY match_rank, c.last_name, c.first_name
  LIMIT greatest(1, coalesce(p_limit, 20));
END;
$function$;

CREATE OR REPLACE FUNCTION public.split_training_group(p_source_group_id uuid, p_new_groups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  source_group RECORD;
  new_group JSONB;
  new_group_id UUID;
  participant_id UUID;
  groups_created INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO source_group FROM training_groups WHERE id = p_source_group_id;
  
  IF source_group IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Source group not found');
  END IF;
  
  FOR new_group IN SELECT * FROM jsonb_array_elements(p_new_groups)
  LOOP
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
$function$;