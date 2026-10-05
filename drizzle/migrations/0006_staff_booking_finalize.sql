-- Staff booking finalization (incremental migration 0006).
-- Moves the office booking's settlement/notes out of follow-up browser writes into the SAME
-- transaction as the core booking:
-- * public.staff_booking_finalize(ticket, finalization, actor): payment method, hotel billing partner,
--   due date; "paid now" with an immediate method records one completed payment of the server total
--   and sets paid_amount; internal/instructor notes become ticket comments; optional inbox
--   conversation link. Invalid input raises P0001 (field name) so the caller rolls everything back.
-- * bc_2627_staff_group_book: calls it before returning (replay returns the already finalized ticket).
-- * public.pa_create_booking_finalized(p, actor): runs pa_create_booking and the finalization in one
--   subtransaction; any error result or invalid finalization rolls back every write of the attempt.
-- * bc_2627_staff_group_book: optional office discretionary discount (discount_percent 0-100 +
--   discount_reason required when > 0) applied to every booked line, exactly like the existing
--   private/legacy office path (ticket_items.discount_percent/discount_reason). No automatic rule.
-- No invoice, e-mail, online charge or new pricing/discount rule.
CREATE OR REPLACE FUNCTION public.staff_booking_finalize(p_ticket uuid, f jsonb, p_actor uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_method text; v_settle text; v_partner uuid; v_due date; v_conv uuid; v_total numeric; v_name text;
BEGIN
  IF f IS NULL OR jsonb_typeof(f) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'finalization';
  END IF;
  v_method := nullif(f->>'payment_method', '');
  v_settle := coalesce(nullif(f->>'settlement', ''), 'pay_later');
  IF v_method IS NOT NULL AND v_method NOT IN ('cash', 'card', 'twint', 'voucher', 'invoice', 'hotel') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'payment_method';
  END IF;
  IF v_settle NOT IN ('paid_now', 'pay_later') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'settlement';
  END IF;
  BEGIN
    v_partner := nullif(f->>'billing_partner_id', '')::uuid;
    v_due := nullif(f->>'payment_due_date', '')::date;
    v_conv := nullif(f->>'conversation_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'finalization';
  END;
  IF v_method = 'hotel' THEN
    IF v_partner IS NULL OR NOT EXISTS (SELECT 1 FROM public.billing_partners WHERE id = v_partner) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'billing_partner_id';
    END IF;
  ELSE
    v_partner := NULL;
  END IF;

  UPDATE public.tickets SET payment_method = v_method, billing_partner_id = v_partner, payment_due_date = v_due
   WHERE id = p_ticket RETURNING total_amount INTO v_total;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket'; END IF;

  v_name := coalesce(nullif(trim(f->>'actor_name'), ''), 'System');
  IF v_settle = 'paid_now' AND v_method IN ('cash', 'card', 'twint', 'voucher') AND coalesce(v_total, 0) > 0 THEN
    INSERT INTO public.payments (ticket_id, amount, payment_method, payment_date, status, created_by)
    VALUES (p_ticket, v_total, v_method, public.pa_business_today(), 'completed', p_actor);
    UPDATE public.tickets SET paid_amount = v_total WHERE id = p_ticket;
    INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
    VALUES (p_ticket, 'PAYMENT_RECORDED', p_actor, jsonb_build_object('amount', v_total, 'payment_method', v_method,
      'settlement', 'paid_now', 'actor_email', nullif(f->>'actor_email', '')));
  END IF;

  IF coalesce(trim(f->>'internal_notes'), '') <> '' THEN
    INSERT INTO public.ticket_comments (ticket_id, comment_type, content, created_by_user_id, created_by_name)
    VALUES (p_ticket, 'internal', left(trim(f->>'internal_notes'), 5000), p_actor, v_name);
  END IF;
  IF coalesce(trim(f->>'instructor_notes'), '') <> '' THEN
    INSERT INTO public.ticket_comments (ticket_id, comment_type, content, created_by_user_id, created_by_name)
    VALUES (p_ticket, 'instructor', left(trim(f->>'instructor_notes'), 5000), p_actor, v_name);
  END IF;
  IF v_conv IS NOT NULL THEN
    UPDATE public.conversations SET related_ticket_id = p_ticket, status = 'processed' WHERE id = v_conv;
  END IF;
END $$;

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

REVOKE ALL ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pa_create_booking_finalized(p jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  BEGIN
    r := public.pa_create_booking(p - 'finalization', p_actor);
    IF r ? 'error' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__pa_error';
    END IF;
    IF coalesce((r->>'replayed')::boolean, false) = false AND p ? 'finalization' THEN
      PERFORM public.staff_booking_finalize((r->>'ticket_id')::uuid, p->'finalization', p_actor);
      r := r || jsonb_build_object('total', (SELECT total_amount FROM public.tickets WHERE id = (r->>'ticket_id')::uuid));
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    -- Every write of this attempt (participants, ticket, appointments) is rolled back.
    IF SQLERRM = '__pa_error' THEN RETURN r; END IF;
    RETURN jsonb_build_object('error', 'invalid', 'field', SQLERRM);
  END;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.staff_booking_finalize(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_booking_finalize(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_create_booking_finalized(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_create_booking_finalized(jsonb, uuid) TO service_role;