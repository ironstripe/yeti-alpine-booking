-- pa_phase2_slot_locks: serialize availability checks per instructor+date and
-- give submission_key a database uniqueness guarantee. Additive; API unchanged.

CREATE TABLE public.private_appointment_submissions (
  submission_key text PRIMARY KEY CHECK (length(submission_key) BETWEEN 8 AND 100),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.private_appointment_submissions TO service_role;
REVOKE ALL ON public.private_appointment_submissions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.private_appointment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access to submissions" ON public.private_appointment_submissions
  AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

INSERT INTO public.private_appointment_submissions (submission_key, ticket_id)
SELECT DISTINCT ON (submission_key) submission_key, ticket_id
  FROM public.private_appointments WHERE submission_key IS NOT NULL
 ORDER BY submission_key, created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.pa_lock_slots(p_targets jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT (x->>'instructor_id')::uuid AS ins, (x->>'date')::date AS d
      FROM jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) x
     WHERE x->>'instructor_id' IS NOT NULL AND x->>'date' IS NOT NULL
     ORDER BY 1, 2
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('pa_slot:' || r.ins::text || ':' || r.d::text, 0));
  END LOOP;
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
    VALUES (v_ticket, d, s, t, ins, 'booked', 'pending', e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, discount_percent, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, 0, 'booked', 'pending', 'private', v_persons, v_group, v_aid);
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
  PERFORM public.pa_lock_slots(jsonb_build_array(jsonb_build_object('instructor_id', p_instr, 'date', p_date)));
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
  v_targets jsonb := '[]'::jsonb; s time; t time; ins uuid;
BEGIN
  IF p_group IS NULL OR p_changes IS NULL OR NOT (p_changes ?| ARRAY['time_start','time_end','instructor_id']) THEN
    RETURN jsonb_build_object('error','invalid','field','changes');
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY date, time_start, id FOR UPDATE LOOP
    v_ticket := a.ticket_id;
    j := public.pa_is_protected(a.id);
    IF (j->>'protected')::boolean THEN
      v_excluded := v_excluded || jsonb_build_object('id',a.id,'reasons',j->'reasons'); CONTINUE;
    END IF;
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    IF t <= s OR ins IS NULL THEN RETURN jsonb_build_object('error','invalid','field','changes'); END IF;
    v_targets := v_targets || jsonb_build_object('instructor_id', ins, 'date', a.date);
    v_todo := v_todo || a.id;
  END LOOP;
  IF v_ticket IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  PERFORM public.pa_lock_slots(v_targets);
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) ORDER BY date, time_start, id LOOP
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, a.date, s, t, a.id) LOOP
      v_conf := v_conf || jsonb_build_object('appointment_id',a.id,'date',a.date,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
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

REVOKE ALL ON FUNCTION public.pa_lock_slots(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_create_booking(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_lock_slots(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_create_booking(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) TO service_role;