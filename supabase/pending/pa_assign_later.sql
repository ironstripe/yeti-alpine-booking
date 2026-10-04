-- PENDING (not applied): private lessons "Später zuweisen" (assign later).
-- Additive: replaces pa_create_booking and pa_apply_slot only; no table/constraint change.
--  * create accepts an appointment WITHOUT instructor_id only with explicit "assign_later": true
--    (unassigned => instructor_confirmation NULL, no teacher lock/conflict/notification);
--    one 'assign_instructor' action task per ticket in the same transaction.
--  * later assignment stays on pa_move_appointment / pa_period_update (teacher required,
--    slot lock + conflict check, all-or-nothing). NULL -> teacher sets 'pending' and is not
--    reported as a confirmation reset.
-- Privileges are kept by CREATE OR REPLACE (service_role only). Rollback: supabase/rollback/pa_assign_later_rollback.sql
BEGIN;
CREATE OR REPLACE FUNCTION public.pa_create_booking(p jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid := (p->>'customer_id')::uuid;
  v_product uuid := (p->>'product_id')::uuid;
  v_existing uuid; v_ticket uuid; v_number text; v_group uuid; v_persons int;
  v_appts jsonb := p->'appointments'; v_parts jsonb := p->'participants';
  v_conflicts jsonb := '[]'::jsonb; v_part_ids uuid[] := ARRAY[]::uuid[];
  v_guest_map jsonb := '{}'::jsonb; v_ids uuid[] := ARRAY[]::uuid[];
  e jsonb; e2 jsonb; i int; k int; v_pid uuid; v_aid uuid; v_price numeric; c record;
  d date; s time; t time; ins uuid; v_later boolean; v_unassigned date[] := ARRAY[]::date[];
  v_disc numeric; v_reason text := nullif(trim(coalesce(p->>'discount_reason','')),'');
BEGIN
  IF v_key IS NULL OR length(v_key) < 8 THEN RETURN jsonb_build_object('error','invalid','field','submission_key'); END IF;
  IF p ? 'discount_percent' AND jsonb_typeof(p->'discount_percent') <> 'number' THEN
    RETURN jsonb_build_object('error','invalid','field','discount_percent');
  END IF;
  v_disc := coalesce((p->>'discount_percent')::numeric, 0);
  IF v_disc < 0 OR v_disc > 100 THEN RETURN jsonb_build_object('error','invalid','field','discount_percent'); END IF;
  IF v_disc > 0 AND v_reason IS NULL THEN RETURN jsonb_build_object('error','invalid','field','discount_reason'); END IF;
  IF v_disc = 0 THEN v_reason := NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pa_create:' || v_key));
  SELECT ticket_id INTO v_existing FROM public.private_appointment_submissions WHERE submission_key = v_key;
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

  PERFORM public.pa_lock_slots((SELECT coalesce(jsonb_agg(jsonb_build_object('instructor_id', x->>'instructor_id', 'date', x->>'date')), '[]'::jsonb)
                                  FROM jsonb_array_elements(v_appts) x));

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    -- "Später zuweisen": a NULL teacher is valid ONLY with explicit per-appointment intent,
    -- and never together with a teacher. A merely missing teacher stays invalid.
    v_later := coalesce(e->'assign_later' = 'true'::jsonb, false);
    IF e ? 'assign_later' AND jsonb_typeof(e->'assign_later') <> 'boolean' THEN v_later := NULL; END IF;
    IF d < public.pa_business_today() OR t <= s OR v_later IS NULL
       OR (ins IS NULL AND NOT v_later) OR (ins IS NOT NULL AND v_later) THEN
      RETURN jsonb_build_object('error','invalid','field','appointments','index',i);
    END IF;
    IF ins IS NULL THEN CONTINUE; END IF; -- unassigned: no teacher slot to check or lock
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
  INSERT INTO public.private_appointment_submissions (submission_key, ticket_id) VALUES (v_key, v_ticket);
  IF jsonb_array_length(v_appts) > 1 THEN v_group := gen_random_uuid(); END IF;

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    v_price := public.pa_price(d, s, t, v_persons);
    INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
    VALUES (v_ticket, d, s, t, ins, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, discount_percent, discount_reason, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, v_disc, v_reason, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, 'private', v_persons, v_group, v_aid);
    v_ids := v_ids || v_aid;
    IF ins IS NULL THEN v_unassigned := v_unassigned || d; END IF;
  END LOOP;

  PERFORM public.pa_recalc_ticket_total(v_ticket);
  -- Same disposition the legacy wizard created for "Später zuweisen", now in the same transaction.
  IF cardinality(v_unassigned) > 0 THEN
    INSERT INTO public.action_tasks (task_type, title, description, related_ticket_id, due_date, priority, status, created_by)
    VALUES ('assign_instructor', 'Skilehrer zuweisen',
            v_number || ' – ' || cardinality(v_unassigned) || ' Privatlektion(en) ohne Lehrperson',
            v_ticket, (SELECT min(x) FROM unnest(v_unassigned) x), 'high', 'pending', p_actor);
  END IF;
  PERFORM public.pa_emit_change(v_ticket, v_ids, 'created', p_actor,
    jsonb_build_object('persons', v_persons, 'discount_percent', v_disc, 'discount_reason', v_reason,
                       'unassigned', cardinality(v_unassigned)));
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'appointment_ids', to_jsonb(v_ids), 'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket));
END $$;

CREATE OR REPLACE FUNCTION public.pa_apply_slot(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
         instructor_confirmation = v_conf, unit_price = v_price, quantity = 1,
         instructor_confirmed_at = CASE WHEN v_changed THEN NULL ELSE instructor_confirmed_at END,
         confirmation_reset_at = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN now() ELSE confirmation_reset_at END,
         confirmation_reset_reason = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN 'private_appointment_changed' ELSE confirmation_reset_reason END
   WHERE appointment_id = p_id;
  RETURN jsonb_build_object('changed', v_changed, 'price', v_price,
    'confirmation_reset', v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending');
END $$;

COMMIT;
