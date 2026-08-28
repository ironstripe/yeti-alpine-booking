CREATE OR REPLACE FUNCTION public.create_provisional_reservation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer jsonb := p_payload->'customer';
  v_participants jsonb := p_payload->'participants';
  v_items jsonb := p_payload->'items';
  v_product_id uuid := (p_payload->>'product_id')::uuid;
  v_hold_minutes int := COALESCE((p_payload->>'hold_minutes')::int, 15);
  v_source text := COALESCE(p_payload->>'source', 'website');
  v_notes text := p_payload->>'notes';

  v_product RECORD;
  v_customer_id uuid;
  v_participant_id uuid;
  v_participant_ids uuid[] := '{}';
  v_p jsonb;
  v_item jsonb;

  v_n_days int;
  v_total_hours numeric := 0;
  v_participant_count int;
  v_total_amount numeric := 0;
  v_tier_price numeric;

  v_slot_instructor uuid;
  v_inst RECORD;
  v_conflict boolean;
  v_date date;
  v_start time;
  v_end time;
  v_hours numeric;
  v_unit_price numeric;

  v_slot_key text;
  v_ticket_id uuid;
  v_ticket_number text;
  v_token text;
  v_expires_at timestamptz;
  v_assigned jsonb := '[]'::jsonb;
BEGIN
  IF v_customer IS NULL OR v_customer->>'email' IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'customer with email is required');
  END IF;
  IF v_participants IS NULL OR jsonb_array_length(v_participants) = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'at least one participant is required');
  END IF;
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'at least one date/time slot is required');
  END IF;

  SELECT string_agg((it->>'date') || '|' || (it->>'time_start') || '|' || (it->>'time_end'), ';' ORDER BY (it->>'date'), (it->>'time_start'))
  INTO v_slot_key
  FROM jsonb_array_elements(v_items) it;

  PERFORM pg_advisory_xact_lock(hashtextextended('reservation:' || COALESCE(p_payload->>'slot_key', v_slot_key), 0));

  SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND is_active = true;
  IF v_product IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'product not found or inactive');
  END IF;

  v_participant_count := jsonb_array_length(v_participants);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    IF v_date < CURRENT_DATE THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'date ' || v_date || ' is in the past');
    END IF;
    IF v_end <= v_start THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'end_time must be after start_time');
    END IF;
    v_total_hours := v_total_hours + (EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0);
  END LOOP;

  v_n_days := (SELECT count(DISTINCT (it->>'date')) FROM jsonb_array_elements(v_items) it);

  IF v_product.pricing_type = 'tiered' THEN
    SELECT cumulative_price INTO v_tier_price
    FROM public.product_price_tiers
    WHERE product_id = v_product.id AND day_count <= v_n_days
    ORDER BY day_count DESC LIMIT 1;
    v_total_amount := COALESCE(v_tier_price, v_product.price * v_n_days) * v_participant_count;
  ELSIF v_product.pricing_type = 'hourly' THEN
    v_total_amount := v_product.price * v_total_hours;
  ELSE
    v_total_amount := v_product.price * v_participant_count;
  END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE LOWER(email) = LOWER(v_customer->>'email') LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (first_name, last_name, email, phone, street, zip, city, country, holiday_address, customer_type)
    VALUES (
      v_customer->>'first_name', v_customer->>'last_name', LOWER(v_customer->>'email'),
      v_customer->>'phone', v_customer->>'street', v_customer->>'zip', v_customer->>'city',
      COALESCE(v_customer->>'country', 'CH'), '', 'private'
    )
    RETURNING id INTO v_customer_id;
  END IF;

  FOR v_p IN SELECT * FROM jsonb_array_elements(v_participants) LOOP
    SELECT id INTO v_participant_id FROM public.customer_participants
    WHERE customer_id = v_customer_id
      AND first_name = v_p->>'first_name'
      AND last_name = v_p->>'last_name'
      AND birth_date = (v_p->>'birth_date')::date
    LIMIT 1;
    IF v_participant_id IS NULL THEN
      INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport, level_last_season)
      VALUES (v_customer_id, v_p->>'first_name', v_p->>'last_name', (v_p->>'birth_date')::date,
              v_p->>'discipline', v_p->>'skill_level')
      RETURNING id INTO v_participant_id;
    END IF;
    v_participant_ids := v_participant_ids || v_participant_id;
  END LOOP;

  v_ticket_number := public.generate_ticket_number();
  v_expires_at := now() + make_interval(mins => v_hold_minutes);

  INSERT INTO public.tickets (ticket_number, customer_id, status, notes, ticket_type, source,
                              total_amount, paid_amount, reservation_expires_at)
  VALUES (v_ticket_number, v_customer_id, 'provisional', v_notes, 'standard', v_source,
          v_total_amount, 0, v_expires_at)
  RETURNING id, reservation_token INTO v_ticket_id, v_token;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    v_hours := EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0;

    IF v_product.pricing_type = 'hourly' THEN
      v_unit_price := v_product.price * v_hours;
    ELSE
      v_unit_price := v_product.price;
    END IF;

    v_slot_instructor := NULL;
    FOR v_inst IN
      SELECT i.id,
        (SELECT count(*) FROM public.ticket_items ti
         JOIN public.tickets t ON t.id = ti.ticket_id
         WHERE ti.instructor_id = i.id AND ti.date = v_date
           AND COALESCE(ti.status, '') NOT IN ('cancelled', 'storno')
           AND t.status NOT IN ('cancelled', 'storno', 'expired')) AS day_load
      FROM public.instructors i
      WHERE i.status = 'active'
        AND (i.roles IS NULL OR i.roles && ARRAY['ski','snowboard','telemark','langlauf'])
      ORDER BY day_load ASC, i.id
    LOOP
      v_conflict := false;

      IF EXISTS (
        SELECT 1 FROM public.ticket_items ti
        JOIN public.tickets t ON t.id = ti.ticket_id
        WHERE ti.instructor_id = v_inst.id
          AND ti.date = v_date
          AND ti.time_start < v_end AND ti.time_end > v_start
          AND COALESCE(ti.status, '') NOT IN ('cancelled', 'storno')
          AND t.status NOT IN ('cancelled', 'storno', 'expired')
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.instructor_absences a
        WHERE a.instructor_id = v_inst.id
          AND COALESCE(a.status, 'pending') NOT IN ('rejected', 'declined', 'cancelled', 'abgelehnt')
          AND a.start_date <= v_date AND a.end_date >= v_date
          AND (COALESCE(a.is_full_day, true) OR (a.time_start < v_end AND a.time_end > v_start))
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.instructor_recurring_blocks rb
        WHERE rb.instructor_id = v_inst.id
          AND rb.is_active = true
          AND COALESCE(rb.status, 'pending') NOT IN ('rejected', 'declined', 'cancelled', 'abgelehnt')
          AND rb.valid_from <= v_date
          AND (rb.valid_until IS NULL OR rb.valid_until >= v_date)
          AND EXTRACT(DOW FROM v_date)::int = ANY(rb.weekdays)
          AND rb.start_time < v_end AND rb.end_time > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.group_course_instances gi
        WHERE (gi.instructor_id = v_inst.id OR gi.assistant_instructor_id = v_inst.id)
          AND gi.date = v_date
          AND COALESCE(gi.status, '') NOT IN ('cancelled', 'storno')
          AND gi.start_time < v_end AND gi.end_time > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict AND EXISTS (
        SELECT 1 FROM public.office_hour_blocks ob
        WHERE ob.instructor_id = v_inst.id
          AND ob.date = v_date
          AND ob.time_start < v_end AND ob.time_end > v_start
      ) THEN v_conflict := true; END IF;

      IF NOT v_conflict THEN
        v_slot_instructor := v_inst.id;
        EXIT;
      END IF;
    END LOOP;

    IF v_slot_instructor IS NULL THEN
      RAISE EXCEPTION 'slot_unavailable: no instructor available on % %-%', v_date, v_start, v_end;
    END IF;

    v_assigned := v_assigned || jsonb_build_object('date', v_date, 'time_start', v_start, 'time_end', v_end, 'instructor_id', v_slot_instructor);

    FOREACH v_participant_id IN ARRAY v_participant_ids LOOP
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id,
                                       date, time_start, time_end, unit_price, quantity, item_type, status)
      VALUES (v_ticket_id, v_product.id, v_participant_id, v_slot_instructor,
              v_date, v_start, v_end, v_unit_price, 1, 'participant', 'booked');
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_number,
    'reservation_token', v_token,
    'reservation_expires_at', v_expires_at,
    'total_amount', v_total_amount,
    'currency', COALESCE(v_product.currency, 'CHF'),
    'customer_id', v_customer_id,
    'assignments', v_assigned
  );

EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'slot_unavailable%' THEN
      RETURN jsonb_build_object('status', 'error', 'code', 'slot_unavailable', 'message', SQLERRM);
    END IF;
    RAISE;
END;
$function$;