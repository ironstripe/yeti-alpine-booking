-- Rollback 0007: restore the 0006 group save and 0001 private save bodies, drop the level helper.
CREATE OR REPLACE FUNCTION public.bc_2627_staff_group_book(p jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid; v_existing uuid; v_ticket uuid; v_number text;
  v_lines jsonb := p->'lines'; e jsonb; g jsonb; i int; blk jsonb; d date;
  v_pid uuid; v_course record; v_dates date[]; v_block text; v_blocks jsonb; v_quote jsonb;
  v_price numeric; v_item uuid; v_seen text[] := ARRAY[]::text[]; v_guest jsonb := '{}'::jsonb;
  v_parts uuid[] := ARRAY[]::uuid[]; v_counts jsonb := '{}'::jsonb; v_quotes jsonb := '{}'::jsonb;
  v_qkey text; v_n int; v_tg uuid; v_first date; v_last date; v_detail text;
  v_course_ids uuid[] := ARRAY[]::uuid[]; v_inst_ids uuid[] := ARRAY[]::uuid[]; v_snap jsonb := '[]'::jsonb;
  v_cid uuid; v_dur int; v_mp text; v_lunch date[]; v_veg boolean;
  v_lunch_product uuid; v_lunch_price numeric; v_lunch_n int; v_any_lunch boolean := false;
  v_disc numeric := 0; v_disc_reason text;
  c_points constant text[] := ARRAY['sammelplatz_gorfion', 'malbipark', 'kasse_taeli', 'schneeflucht'];
BEGIN
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 100 THEN
    RETURN jsonb_build_object('error', 'invalid', 'field', 'submission_key');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bc_staff_group:' || v_key));
  SELECT ticket_id INTO v_existing FROM public.bc_2627_staff_group_submissions WHERE submission_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'ticket_id', v_existing,
      'ticket_number', (SELECT ticket_number FROM public.tickets WHERE id = v_existing),
      'total', (SELECT total_amount FROM public.tickets WHERE id = v_existing));
  END IF;

  BEGIN v_customer := (p->>'customer_id')::uuid;
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'customer_id'); END;
  IF v_customer IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer
       AND NOT is_archived AND merged_into_id IS NULL) THEN
    RETURN jsonb_build_object('error', 'not_found', 'field', 'customer_id');
  END IF;
  BEGIN v_disc := coalesce(nullif(p->>'discount_percent', '')::numeric, 0);
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'discount_percent'); END;
  v_disc_reason := nullif(left(trim(coalesce(p->>'discount_reason', '')), 500), '');
  IF v_disc < 0 OR v_disc > 100 THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'discount_percent'); END IF;
  IF v_disc > 0 AND v_disc_reason IS NULL THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'discount_reason'); END IF;
  IF v_disc = 0 THEN v_disc_reason := NULL; END IF;
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 30 THEN
    RETURN jsonb_build_object('error', 'invalid', 'field', 'lines');
  END IF;

  -- Pre-pass (read-only): shape checks, course ids, quote group sizes, lunch presence.
  FOR i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    e := v_lines->i;
    BEGIN
      v_cid := (e->>'course_id')::uuid;
      PERFORM (e->>'product_id')::uuid;
      SELECT array_agg(x::date ORDER BY x::date) INTO v_dates FROM jsonb_array_elements_text(e->'dates') x;
      SELECT array_agg(x::date ORDER BY x::date) INTO v_lunch FROM jsonb_array_elements_text(coalesce(e->'lunch_dates', '[]'::jsonb)) x;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('error', 'invalid', 'field', 'line_shape', 'line', i::text);
    END;
    IF v_cid IS NULL THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'course', 'line', i::text); END IF;
    IF NOT v_cid = ANY (v_course_ids) THEN v_course_ids := v_course_ids || v_cid; END IF;
    IF v_lunch IS NOT NULL AND cardinality(v_lunch) > 0 THEN v_any_lunch := true; END IF;
    v_qkey := coalesce(e->>'product_id','') || '|' || coalesce(e->>'block','') || '|' ||
      coalesce((SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(v_dates) x), '');
    v_counts := v_counts || jsonb_build_object(v_qkey, coalesce((v_counts->>v_qkey)::int, 0) + 1);
  END LOOP;

  IF v_any_lunch THEN
    SELECT count(*), max(id::text)::uuid, max(price) INTO v_lunch_n, v_lunch_product, v_lunch_price
      FROM public.products WHERE type = 'lunch' AND is_active IS TRUE;
    IF v_lunch_n <> 1 OR coalesce(v_lunch_price, 0) <= 0 THEN
      RETURN jsonb_build_object('error', 'invalid', 'field', 'lunch_product');
    END IF;
  END IF;

  -- Deterministic lock order: courses (SHARE, same order as course delete: course before children),
  -- then every referenced instance FOR UPDATE, all before the first write.
  PERFORM 1 FROM public.group_courses WHERE id = ANY (v_course_ids) ORDER BY id FOR SHARE;
  FOR i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    e := v_lines->i;
    SELECT p2.duration_minutes INTO v_dur FROM public.products p2 WHERE p2.id = (e->>'product_id')::uuid;
    SELECT array_agg(x::date ORDER BY x::date) INTO v_dates FROM jsonb_array_elements_text(e->'dates') x;
    v_blocks := CASE WHEN v_dur IS NULL OR v_dates IS NULL THEN NULL
      ELSE public.bc_2627_staff_group_blocks((e->>'course_id')::uuid, v_dur, nullif(e->>'block', ''), v_dates) END;
    v_snap := v_snap || jsonb_build_array(coalesce(v_blocks, 'null'::jsonb));
    IF v_blocks IS NOT NULL THEN
      v_inst_ids := v_inst_ids || ARRAY(SELECT (x->>'instance_id')::uuid FROM jsonb_array_elements(v_blocks) x);
    END IF;
  END LOOP;
  PERFORM 1 FROM public.group_course_instances WHERE id = ANY (v_inst_ids) ORDER BY id FOR UPDATE;

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, nullif(p->>'notes', ''))
  RETURNING id INTO v_ticket;
  INSERT INTO public.bc_2627_staff_group_submissions (submission_key, ticket_id, created_by) VALUES (v_key, v_ticket, p_actor);

  FOR i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    e := v_lines->i;
    IF e ? 'participant_id' THEN
      SELECT id INTO v_pid FROM public.customer_participants
       WHERE id = (e->>'participant_id')::uuid AND customer_id = v_customer
         AND NOT is_archived AND merged_into_id IS NULL;
      IF v_pid IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'participant', DETAIL = i::text; END IF;
    ELSE
      g := e->'guest';
      IF g IS NULL OR coalesce(g->>'guest_key', '') = '' OR coalesce(trim(g->>'first_name'), '') = '' OR (g->>'birth_date') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'participant', DETAIL = i::text;
      END IF;
      IF v_guest ? (g->>'guest_key') THEN
        v_pid := (v_guest->>(g->>'guest_key'))::uuid;
      ELSE
        INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport)
        VALUES (v_customer, trim(g->>'first_name'), nullif(trim(coalesce(g->>'last_name', '')), ''),
                (g->>'birth_date')::date, coalesce(nullif(g->>'sport', ''), 'ski'))
        RETURNING id INTO v_pid;
        v_guest := v_guest || jsonb_build_object(g->>'guest_key', v_pid);
      END IF;
    END IF;

    SELECT gc.id, gc.name, gc.discipline, gc.meeting_point, gc.skill_level_id, p2.id AS product_id, p2.duration_minutes
      INTO v_course
      FROM public.group_courses gc
      JOIN public.bc_2627_course_product_variants v ON v.course_id = gc.id AND v.product_id = (e->>'product_id')::uuid
      JOIN public.products p2 ON p2.id = v.product_id
      JOIN public.seasons s ON s.id = p2.season_id
     WHERE gc.id = (e->>'course_id')::uuid
       AND gc.is_active IS TRUE AND gc.archived_at IS NULL AND coalesce(gc.is_internal, false) = false
       AND coalesce(gc.course_type, '') <> 'office'
       AND p2.is_active IS TRUE AND p2.type IN ('group', 'group_toddler') AND s.name = 'Winter 26/27'
       AND gc.discipline = coalesce(e->>'sport', gc.discipline);
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'course', DETAIL = i::text; END IF;

    SELECT array_agg(x::date ORDER BY x::date) INTO v_dates FROM jsonb_array_elements_text(e->'dates') x;
    IF v_dates IS NULL OR cardinality(v_dates) <> (SELECT count(DISTINCT x) FROM unnest(v_dates) x)
       OR v_dates[1] < public.pa_business_today()
       OR NOT EXISTS (SELECT 1 FROM public.bc_2627_course_product_variants v
                       WHERE v.course_id = v_course.id AND v.product_id = v_course.product_id
                         AND cardinality(v_dates) = ANY (v.eligible_day_counts)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'dates', DETAIL = i::text;
    END IF;
    v_block := nullif(e->>'block', '');
    -- Re-resolved AFTER the locks; must equal the locked snapshot (no stale/moved instance).
    v_blocks := public.bc_2627_staff_group_blocks(v_course.id, v_course.duration_minutes, v_block, v_dates);
    IF v_blocks IS NULL OR v_blocks IS DISTINCT FROM (v_snap->i) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'blocks', DETAIL = i::text;
    END IF;

    -- Meeting point: authoritative course value, otherwise explicit office choice.
    v_mp := nullif(trim(coalesce(e->>'meeting_point', '')), '');
    IF v_course.meeting_point IS NOT NULL THEN
      IF v_mp IS NOT NULL AND v_mp <> v_course.meeting_point THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meeting_point', DETAIL = i::text;
      END IF;
      v_mp := v_course.meeting_point;
    ELSIF v_mp IS NULL OR NOT v_mp = ANY (c_points) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meeting_point', DETAIL = i::text;
    END IF;

    SELECT array_agg(x::date ORDER BY x::date) INTO v_lunch FROM jsonb_array_elements_text(coalesce(e->'lunch_dates', '[]'::jsonb)) x;
    v_lunch := coalesce(v_lunch, ARRAY[]::date[]);
    IF cardinality(v_lunch) <> (SELECT count(DISTINCT x) FROM unnest(v_lunch) x) OR NOT (v_lunch <@ v_dates) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'lunch', DETAIL = i::text;
    END IF;
    v_veg := cardinality(v_lunch) > 0 AND coalesce((e->>'vegetarian')::boolean, false);
    IF cardinality(v_lunch) > 0 AND e ? 'expected_lunch_unit_price'
       AND (e->>'expected_lunch_unit_price')::numeric IS DISTINCT FROM v_lunch_price THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'lunch_price_changed', DETAIL = i::text;
    END IF;

    IF (v_pid::text || ':' || v_course.id::text) = ANY (v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'duplicate', DETAIL = i::text;
    END IF;
    v_seen := v_seen || (v_pid::text || ':' || v_course.id::text);

    IF EXISTS (SELECT 1 FROM public.group_course_enrollments en
                WHERE en.participant_id = v_pid
                  AND en.instance_id IN (SELECT (x->>'instance_id')::uuid FROM jsonb_array_elements(v_blocks) x)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_enrolled', DETAIL = i::text;
    END IF;

    v_qkey := coalesce(e->>'product_id','') || '|' || coalesce(e->>'block','') || '|' ||
      coalesce((SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(v_dates) x), '');
    v_n := (v_counts->>v_qkey)::int;
    IF v_quotes ? v_qkey THEN
      v_quote := v_quotes->v_qkey;
    ELSE
      v_quote := public.quote_bc_2627_product(v_course.product_id,
        (SELECT jsonb_agg(x - 'instance_id') FROM jsonb_array_elements(v_blocks) x), v_n);
      v_quotes := v_quotes || jsonb_build_object(v_qkey, v_quote);
    END IF;
    IF (v_quote->>'participant_count')::int <> v_n
       OR round((v_quote->>'total_amount')::numeric / v_n, 2) * v_n <> (v_quote->>'total_amount')::numeric THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tariff', DETAIL = i::text;
    END IF;
    v_price := round((v_quote->>'total_amount')::numeric / v_n, 2);
    IF e ? 'expected_unit_price' AND (e->>'expected_unit_price')::numeric IS DISTINCT FROM v_price THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_changed', DETAIL = i::text;
    END IF;

    v_first := v_dates[1]; v_last := v_dates[cardinality(v_dates)];
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, date, end_date, time_start, time_end,
      meeting_point, unit_price, quantity, discount_percent, discount_reason, status, item_type, group_name, skill_level, is_vegetarian)
    VALUES (v_ticket, v_course.product_id, v_pid, v_first, CASE WHEN v_last <> v_first THEN v_last END,
      (SELECT min((x->>'time_start')::time) FROM jsonb_array_elements(v_blocks) x),
      (SELECT max((x->>'time_end')::time) FROM jsonb_array_elements(v_blocks) x),
      v_mp, v_price, 1, v_disc, v_disc_reason, 'booked', 'group', v_course.name, v_course.skill_level_id, v_veg)
    RETURNING id INTO v_item;

    FOR blk IN SELECT value FROM jsonb_array_elements(v_blocks) LOOP
      SELECT max(training_group_id::text)::uuid INTO v_tg FROM public.bc_2627_course_period_sources
       WHERE course_id = v_course.id AND (blk->>'date')::date = ANY (teaching_dates)
       HAVING count(*) = 1;
      INSERT INTO public.group_course_enrollments (instance_id, ticket_item_id, participant_id, attendance_status, training_group_id)
      VALUES ((blk->>'instance_id')::uuid, v_item, v_pid, 'registered', v_tg);
      UPDATE public.group_course_instances SET current_participants = coalesce(current_participants, 0) + 1
       WHERE id = (blk->>'instance_id')::uuid;
    END LOOP;

    FOREACH d IN ARRAY v_lunch LOOP
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, date, unit_price, quantity,
        discount_percent, discount_reason, status, item_type, is_vegetarian, meeting_point)
      VALUES (v_ticket, v_lunch_product, v_pid, d, v_lunch_price, 1, v_disc, v_disc_reason, 'booked', 'lunch', v_veg, NULL);
    END LOOP;
    IF NOT v_pid = ANY (v_parts) THEN v_parts := v_parts || v_pid; END IF;
  END LOOP;

  UPDATE public.tickets SET participant_count = cardinality(v_parts) WHERE id = v_ticket;
  PERFORM public.pa_recalc_ticket_total(v_ticket);
  -- Office settlement/notes in the SAME transaction (a failure rolls back the whole booking).
  IF p ? 'finalization' THEN PERFORM public.staff_booking_finalize(v_ticket, p->'finalization', p_actor); END IF;
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
    'participant_ids', to_jsonb(v_parts));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('error', 'invalid', 'field', SQLERRM, 'line', v_detail);
WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('error', 'invalid', 'field', 'tariff', 'message', SQLERRM);
END $$;


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
DROP FUNCTION IF EXISTS public.staff_guest_level_ok(text, text);
