-- pa_phase2_tx: transactional private-appointment operations (service_role only)
ALTER TABLE public.private_appointments ADD COLUMN IF NOT EXISTS submission_key text;
CREATE INDEX IF NOT EXISTS idx_private_appointments_submission_key
  ON public.private_appointments (submission_key) WHERE submission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pa_recalc_ticket_total(p_ticket uuid)
RETURNS numeric LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  SELECT coalesce(sum(coalesce(line_total, unit_price * coalesce(quantity,1) * (1 - coalesce(discount_percent,0)/100))),0)
    INTO v FROM public.ticket_items WHERE ticket_id = p_ticket AND coalesce(status,'') <> 'cancelled';
  UPDATE public.tickets SET total_amount = v WHERE id = p_ticket;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pa_emit_change(p_ticket uuid, p_ids uuid[], p_change text, p_actor uuid, p_details jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
  VALUES (p_ticket, p_actor, 'PRIVATE_APPOINTMENT_CHANGED',
          jsonb_build_object('change', p_change, 'appointment_ids', to_jsonb(p_ids)) || coalesce(p_details,'{}'::jsonb));
  INSERT INTO public.notification_queue (notification_type, recipient_type, payload, status)
  VALUES ('private_appointment_changed', 'system',
          jsonb_build_object('ticket_id', p_ticket, 'appointment_ids', to_jsonb(p_ids), 'change', p_change, 'actor', p_actor),
          'pending');
END $$;

-- Applies new slot values to one (already locked, checked) appointment and its commercial line.
CREATE OR REPLACE FUNCTION public.pa_apply_slot(p_id uuid, p_date date, p_start time, p_end time, p_instr uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record; v_changed boolean; v_persons int; v_price numeric; v_conf text;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id;
  v_changed := a.date IS DISTINCT FROM p_date OR a.time_start IS DISTINCT FROM p_start
            OR a.time_end IS DISTINCT FROM p_end OR a.instructor_id IS DISTINCT FROM p_instr;
  SELECT greatest(count(*),1) INTO v_persons FROM public.private_appointment_participants WHERE appointment_id = p_id;
  v_price := public.pa_price(p_date, p_start, p_end, v_persons);
  v_conf := CASE WHEN v_changed THEN 'pending' ELSE a.instructor_confirmation END;
  UPDATE public.private_appointments
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr, price = v_price,
         instructor_confirmation = v_conf,
         confirmed_at = CASE WHEN v_changed THEN NULL ELSE confirmed_at END,
         confirmed_by = CASE WHEN v_changed THEN NULL ELSE confirmed_by END
   WHERE id = p_id;
  UPDATE public.ticket_items
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr,
         instructor_confirmation = v_conf, unit_price = v_price, line_total = v_price,
         instructor_confirmed_at = CASE WHEN v_changed THEN NULL ELSE instructor_confirmed_at END,
         confirmation_reset_at = CASE WHEN v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending' THEN now() ELSE confirmation_reset_at END,
         confirmation_reset_reason = CASE WHEN v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending' THEN 'private_appointment_changed' ELSE confirmation_reset_reason END
   WHERE appointment_id = p_id;
  RETURN jsonb_build_object('changed', v_changed, 'price', v_price,
    'confirmation_reset', v_changed AND a.instructor_confirmation IS DISTINCT FROM 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.pa_create_booking(p jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid := (p->>'customer_id')::uuid;
  v_product uuid := (p->>'product_id')::uuid;
  v_existing uuid; v_ticket uuid; v_number text; v_group uuid; v_persons int;
  v_appts jsonb := p->'appointments'; v_parts jsonb := p->'participants';
  v_conflicts jsonb := '[]'::jsonb; v_part_ids uuid[] := ARRAY[]::uuid[];
  v_guest_map jsonb := '{}'::jsonb; v_ids uuid[] := ARRAY[]::uuid[];
  e jsonb; e2 jsonb; i int; k int; v_pid uuid; v_aid uuid; v_price numeric; c record;
  d date; s time; t time; ins uuid;
BEGIN
  IF v_key IS NULL OR length(v_key) < 8 THEN RETURN jsonb_build_object('error','invalid','field','submission_key'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pa_create:' || v_key));
  SELECT ticket_id INTO v_existing FROM public.private_appointments WHERE submission_key = v_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'ticket_id', v_existing,
      'ticket_number', (SELECT ticket_number FROM public.tickets WHERE id = v_existing),
      'appointment_ids', (SELECT to_jsonb(array_agg(id ORDER BY date, time_start)) FROM public.private_appointments WHERE ticket_id = v_existing AND submission_key = v_key),
      'total', (SELECT total_amount FROM public.tickets WHERE id = v_existing));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer) THEN RETURN jsonb_build_object('error','not_found','field','customer_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product AND type = 'private') THEN RETURN jsonb_build_object('error','invalid','field','product_id'); END IF;
  IF jsonb_typeof(v_appts) <> 'array' OR jsonb_array_length(v_appts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END IF;
  IF jsonb_typeof(v_parts) <> 'array' OR jsonb_array_length(v_parts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','participants'); END IF;

  -- availability (all-or-nothing, nothing written yet)
  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    IF d < public.pa_business_today() OR t <= s OR ins IS NULL THEN
      RETURN jsonb_build_object('error','invalid','field','appointments','index',i);
    END IF;
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, d, s, t, NULL) LOOP
      v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
    FOR k IN 0 .. i - 1 LOOP
      e2 := v_appts->k;
      IF (e2->>'instructor_id')::uuid = ins AND (e2->>'date')::date = d
         AND (e2->>'time_start')::time < t AND (e2->>'time_end')::time > s THEN
        v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind','request','ref_id',NULL);
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conflicts) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conflicts); END IF;

  -- participants (existing must belong to customer; guests persisted once per guest_key)
  FOR i IN 0 .. jsonb_array_length(v_parts) - 1 LOOP
    e := v_parts->i;
    IF e ? 'participant_id' THEN
      SELECT id INTO v_pid FROM public.customer_participants WHERE id = (e->>'participant_id')::uuid AND customer_id = v_customer;
      IF v_pid IS NULL THEN RETURN jsonb_build_object('error','invalid','field','participants','index',i); END IF;
    ELSE
      IF coalesce(e->>'guest_key','') = '' OR coalesce(e->>'first_name','') = '' OR (e->>'birth_date') IS NULL THEN
        RETURN jsonb_build_object('error','invalid','field','participants','index',i);
      END IF;
      IF v_guest_map ? (e->>'guest_key') THEN
        v_pid := (v_guest_map->>(e->>'guest_key'))::uuid;
      ELSE
        SELECT id INTO v_pid FROM public.customer_participants
         WHERE customer_id = v_customer AND NOT is_archived AND merged_into_id IS NULL
           AND lower(trim(first_name)) = lower(trim(e->>'first_name'))
           AND lower(trim(coalesce(last_name,''))) = lower(trim(coalesce(e->>'last_name','')))
           AND birth_date = (e->>'birth_date')::date
         ORDER BY created_at LIMIT 1;
        IF v_pid IS NULL THEN
          INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport)
          VALUES (v_customer, trim(e->>'first_name'), nullif(trim(coalesce(e->>'last_name','')),''), (e->>'birth_date')::date, coalesce(e->>'sport','ski'))
          RETURNING id INTO v_pid;
        END IF;
        v_guest_map := v_guest_map || jsonb_build_object(e->>'guest_key', v_pid);
      END IF;
    END IF;
    IF NOT v_pid = ANY(v_part_ids) THEN v_part_ids := v_part_ids || v_pid; END IF;
  END LOOP;
  v_persons := cardinality(v_part_ids);

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, participant_count, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, v_persons, p->>'notes')
  RETURNING id INTO v_ticket;
  IF jsonb_array_length(v_appts) > 1 THEN v_group := gen_random_uuid(); END IF;

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    v_price := public.pa_price(d, s, t, v_persons);
    INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
    VALUES (v_ticket, d, s, t, ins, 'booked', 'pending', e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, line_total, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, v_price, 'booked', 'pending', 'private', v_persons, v_group, v_aid);
    v_ids := v_ids || v_aid;
  END LOOP;

  PERFORM public.pa_recalc_ticket_total(v_ticket);
  PERFORM public.pa_emit_change(v_ticket, v_ids, 'created', p_actor, jsonb_build_object('persons', v_persons));
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'appointment_ids', to_jsonb(v_ids), 'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket));
END $$;

CREATE OR REPLACE FUNCTION public.pa_move_appointment(p_id uuid, p_date date, p_start time, p_end time, p_instr uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record; j jsonb; v_conf jsonb := '[]'::jsonb; c record; r jsonb;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = a.ticket_id FOR UPDATE;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  j := public.pa_is_protected(p_id);
  IF (j->>'protected')::boolean THEN
    RETURN jsonb_build_object('error','protected','excluded', jsonb_build_array(jsonb_build_object('id',p_id,'reasons',j->'reasons')));
  END IF;
  IF p_date < public.pa_business_today() OR p_end <= p_start OR p_instr IS NULL THEN
    RETURN jsonb_build_object('error','invalid','field','slot');
  END IF;
  FOR c IN SELECT * FROM public.pa_slot_conflicts(p_instr, p_date, p_start, p_end, p_id) LOOP
    v_conf := v_conf || jsonb_build_object('date',p_date,'kind',c.kind,'ref_id',c.ref_id);
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  r := public.pa_apply_slot(p_id, p_date, p_start, p_end, p_instr);
  PERFORM public.pa_recalc_ticket_total(a.ticket_id);
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_id], 'moved', p_actor,
    jsonb_build_object('from', jsonb_build_object('date',a.date,'time_start',a.time_start,'time_end',a.time_end,'instructor_id',a.instructor_id),
                       'to', jsonb_build_object('date',p_date,'time_start',p_start,'time_end',p_end,'instructor_id',p_instr)));
  RETURN jsonb_build_object('ok', true, 'price', r->'price', 'confirmation_reset', r->'confirmation_reset',
    'appointment', (SELECT to_jsonb(x) - 'submission_key' FROM public.private_appointments x WHERE id = p_id));
END $$;

CREATE OR REPLACE FUNCTION public.pa_period_update(p_group uuid, p_changes jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record; j jsonb; c record; v_ticket uuid;
  v_excluded jsonb := '[]'::jsonb; v_conf jsonb := '[]'::jsonb; v_todo uuid[] := ARRAY[]::uuid[];
  s time; t time; ins uuid;
BEGIN
  IF p_group IS NULL OR p_changes IS NULL OR NOT (p_changes ?| ARRAY['time_start','time_end','instructor_id']) THEN
    RETURN jsonb_build_object('error','invalid','field','changes');
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY date, time_start FOR UPDATE LOOP
    v_ticket := a.ticket_id;
    j := public.pa_is_protected(a.id);
    IF (j->>'protected')::boolean THEN
      v_excluded := v_excluded || jsonb_build_object('id',a.id,'reasons',j->'reasons'); CONTINUE;
    END IF;
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    IF t <= s OR ins IS NULL THEN RETURN jsonb_build_object('error','invalid','field','changes'); END IF;
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, a.date, s, t, a.id) LOOP
      v_conf := v_conf || jsonb_build_object('appointment_id',a.id,'date',a.date,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
    v_todo := v_todo || a.id;
  END LOOP;
  IF v_ticket IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  PERFORM 1 FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) LOOP
    PERFORM public.pa_apply_slot(a.id, a.date,
      coalesce((p_changes->>'time_start')::time, a.time_start),
      coalesce((p_changes->>'time_end')::time, a.time_end),
      coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id));
  END LOOP;
  IF cardinality(v_todo) > 0 THEN
    PERFORM public.pa_recalc_ticket_total(v_ticket);
    PERFORM public.pa_emit_change(v_ticket, v_todo, 'period_updated', p_actor,
      jsonb_build_object('changes', p_changes, 'excluded', v_excluded));
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated_ids', to_jsonb(v_todo), 'excluded', v_excluded);
END $$;

CREATE OR REPLACE FUNCTION public.pa_confirm_appointment(p_appointment uuid, p_instructor uuid, p_action text, p_reason text, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record; v_state text;
BEGIN
  IF p_action NOT IN ('confirm','decline') OR (p_action = 'decline' AND coalesce(trim(p_reason),'') = '') THEN
    RETURN jsonb_build_object('error','invalid','field','action');
  END IF;
  SELECT * INTO a FROM public.private_appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF a.instructor_id IS DISTINCT FROM p_instructor THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  v_state := CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'declined' END;
  UPDATE public.private_appointments
     SET instructor_confirmation = v_state,
         confirmed_at = CASE WHEN p_action = 'confirm' THEN now() ELSE NULL END,
         confirmed_by = CASE WHEN p_action = 'confirm' THEN p_actor ELSE NULL END
   WHERE id = p_appointment;
  UPDATE public.ticket_items
     SET instructor_confirmation = v_state,
         instructor_confirmed_at = CASE WHEN p_action = 'confirm' THEN now() ELSE NULL END,
         instructor_declined_at = CASE WHEN p_action = 'decline' THEN now() ELSE NULL END,
         instructor_decline_reason = CASE WHEN p_action = 'decline' THEN p_reason ELSE NULL END
   WHERE appointment_id = p_appointment;
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_appointment], v_state, p_actor,
    jsonb_build_object('instructor_id', p_instructor, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment, 'instructor_confirmation', v_state);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.pa_recalc_ticket_total(uuid)',
    'public.pa_emit_change(uuid, uuid[], text, uuid, jsonb)',
    'public.pa_apply_slot(uuid, date, time, time, uuid)',
    'public.pa_create_booking(jsonb, uuid)',
    'public.pa_move_appointment(uuid, date, time, time, uuid, uuid)',
    'public.pa_period_update(uuid, jsonb, uuid)',
    'public.pa_confirm_appointment(uuid, uuid, text, text, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;