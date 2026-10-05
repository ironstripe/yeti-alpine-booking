-- Staff (office/admin) atomic group-course booking for Winter 26/27 source-bound courses.
-- PENDING: not applied. Installed only after explicit approval, together with the
-- `staff-group-booking` Edge Function. Rollback: bc_2627_staff_group_booking_rollback.sql
--
-- Contract:
-- * Prices come only from the existing public.quote_bc_2627_product (exact Booking-Corner
--   source tariff + exact day tier). Each participant is quoted with p_participants = 1, so
--   the source group capacity never blocks a sale (capacity is planning info only); the
--   quote is linear per person, so the total equals the per-group quote.
-- * One billing line per participant + course (package price, quantity 1, no discount).
--   Manual discounts stay in the existing invoice module.
-- * One enrollment per real existing course instance (every AM/PM block of every date).
--   Instances are never generated here; an ambiguous or missing instance rejects the booking.
-- * Idempotent by submission_key; any failure rolls back the whole transaction.
-- * No invoice, e-mail, payment or reservation side effects.

CREATE TABLE IF NOT EXISTS public.bc_2627_staff_group_submissions (
  submission_key text PRIMARY KEY CHECK (length(submission_key) BETWEEN 8 AND 100),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.bc_2627_staff_group_submissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bc_2627_staff_group_submissions TO service_role;
ALTER TABLE public.bc_2627_staff_group_submissions ENABLE ROW LEVEL SECURITY;

-- Exact blocks of one course/product/block choice over the given dates, or NULL when the
-- real instances do not cover every date exactly once per required block.
CREATE OR REPLACE FUNCTION public.bc_2627_staff_group_blocks(p_course uuid, p_duration int, p_block text, p_dates date[])
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_slots time[][]; d date; s int; v_n int; v_id uuid; v_out jsonb := '[]'::jsonb;
  v_start time; v_end time;
BEGIN
  IF p_duration = 240 AND p_block IS NULL THEN
    v_slots := ARRAY[ARRAY[TIME '10:00', TIME '12:00'], ARRAY[TIME '14:00', TIME '16:00']];
  ELSIF p_duration = 120 AND p_block = 'am' THEN
    v_slots := ARRAY[ARRAY[TIME '10:00', TIME '12:00']];
  ELSIF p_duration = 120 AND p_block = 'pm' THEN
    v_slots := ARRAY[ARRAY[TIME '14:00', TIME '16:00']];
  ELSE
    RETURN NULL;
  END IF;
  FOREACH d IN ARRAY p_dates LOOP
    FOR s IN 1 .. array_length(v_slots, 1) LOOP
      v_start := v_slots[s][1]; v_end := v_slots[s][2];
      SELECT count(*), max(id::text)::uuid INTO v_n, v_id
        FROM public.group_course_instances
       WHERE course_id = p_course AND date = d AND start_time = v_start AND end_time = v_end
         AND coalesce(status, 'scheduled') <> 'cancelled';
      IF v_n <> 1 THEN RETURN NULL; END IF;
      v_out := v_out || jsonb_build_object('instance_id', v_id, 'date', d,
        'time_start', to_char(v_start, 'HH24:MI'), 'time_end', to_char(v_end, 'HH24:MI'));
    END LOOP;
  END LOOP;
  RETURN v_out;
END $$;

-- Bookable options for the staff wizard (read-only).
CREATE OR REPLACE FUNCTION public.bc_2627_staff_group_options(p_dates date[], p_sport text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  r record; b text; v_blocks jsonb; v_quote jsonb; v_out jsonb := '[]'::jsonb; v_days int;
BEGIN
  IF p_sport NOT IN ('ski', 'snowboard') OR p_dates IS NULL OR cardinality(p_dates) = 0 THEN
    RETURN v_out;
  END IF;
  v_days := (SELECT count(DISTINCT x) FROM unnest(p_dates) x);
  IF v_days <> cardinality(p_dates) THEN RETURN v_out; END IF;
  FOR r IN
    SELECT gc.id AS course_id, gc.name AS course_name, gc.discipline, gc.skill_level_id, gc.meeting_point,
           gc.max_participants, gc.sort_order, p.id AS product_id, p.name AS product_name, p.duration_minutes
      FROM public.group_courses gc
      JOIN public.bc_2627_course_product_variants v ON v.course_id = gc.id
      JOIN public.products p ON p.id = v.product_id
      JOIN public.seasons s ON s.id = p.season_id
     WHERE gc.is_active IS TRUE AND gc.archived_at IS NULL AND coalesce(gc.is_internal, false) = false
       AND coalesce(gc.course_type, '') <> 'office'
       AND gc.discipline = p_sport
       AND p.is_active IS TRUE AND p.type IN ('group', 'group_toddler')
       AND s.name = 'Winter 26/27' AND v_days = ANY (v.eligible_day_counts)
     ORDER BY gc.sort_order NULLS LAST, gc.name, p.duration_minutes DESC
  LOOP
    FOREACH b IN ARRAY (CASE WHEN r.duration_minutes = 240 THEN ARRAY[NULL::text] ELSE ARRAY['am', 'pm'] END) LOOP
      v_blocks := public.bc_2627_staff_group_blocks(r.course_id, r.duration_minutes, b, p_dates);
      CONTINUE WHEN v_blocks IS NULL;
      BEGIN
        v_quote := public.quote_bc_2627_product(r.product_id,
          (SELECT jsonb_agg(x - 'instance_id') FROM jsonb_array_elements(v_blocks) x), 1);
      EXCEPTION WHEN others THEN
        CONTINUE;  -- no exact source tariff: never offered, never priced by fallback
      END;
      v_out := v_out || jsonb_build_object(
        'course_id', r.course_id, 'course_name', r.course_name, 'discipline', r.discipline,
        'skill_level_id', r.skill_level_id, 'meeting_point', r.meeting_point,
        'max_participants', r.max_participants, 'sort_order', r.sort_order,
        'product_id', r.product_id, 'product_name', r.product_name,
        'duration_minutes', r.duration_minutes, 'block', b,
        'blocks', (SELECT jsonb_agg(x - 'instance_id') FROM jsonb_array_elements(v_blocks) x),
        'unit_price', v_quote->'total_amount', 'source_tariff_ids', v_quote->'source_tariff_ids');
    END LOOP;
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.bc_2627_staff_group_book(p jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid; v_existing uuid; v_ticket uuid; v_number text;
  v_lines jsonb := p->'lines'; e jsonb; g jsonb; i int; blk jsonb;
  v_pid uuid; v_course record; v_dates date[]; v_block text; v_blocks jsonb; v_quote jsonb;
  v_price numeric; v_item uuid; v_seen text[] := ARRAY[]::text[]; v_guest jsonb := '{}'::jsonb;
  v_parts uuid[] := ARRAY[]::uuid[]; v_tg uuid; v_first date; v_last date;
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
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 30 THEN
    RETURN jsonb_build_object('error', 'invalid', 'field', 'lines');
  END IF;

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, nullif(p->>'notes', ''))
  RETURNING id INTO v_ticket;
  INSERT INTO public.bc_2627_staff_group_submissions (submission_key, ticket_id, created_by) VALUES (v_key, v_ticket, p_actor);

  FOR i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    e := v_lines->i;
    -- participant: existing of this customer, or explicit new person (never matched by name)
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
       AND gc.discipline = coalesce(e->>'sport', gc.discipline)
     FOR SHARE OF gc;
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
    v_blocks := public.bc_2627_staff_group_blocks(v_course.id, v_course.duration_minutes, v_block, v_dates);
    IF v_blocks IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'blocks', DETAIL = i::text; END IF;

    IF (v_pid::text || ':' || v_course.id::text) = ANY (v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'duplicate', DETAIL = i::text;
    END IF;
    v_seen := v_seen || (v_pid::text || ':' || v_course.id::text);

    -- protect the exact instances against concurrent delete/move until commit
    PERFORM 1 FROM public.group_course_instances
      WHERE id IN (SELECT (x->>'instance_id')::uuid FROM jsonb_array_elements(v_blocks) x) FOR SHARE;
    IF EXISTS (SELECT 1 FROM public.group_course_enrollments en
                WHERE en.participant_id = v_pid
                  AND en.instance_id IN (SELECT (x->>'instance_id')::uuid FROM jsonb_array_elements(v_blocks) x)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already_enrolled', DETAIL = i::text;
    END IF;

    v_quote := public.quote_bc_2627_product(v_course.product_id,
      (SELECT jsonb_agg(x - 'instance_id') FROM jsonb_array_elements(v_blocks) x), 1);
    v_price := (v_quote->>'total_amount')::numeric;
    IF e ? 'expected_unit_price' AND (e->>'expected_unit_price')::numeric IS DISTINCT FROM v_price THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_changed', DETAIL = i::text;
    END IF;

    v_first := v_dates[1]; v_last := v_dates[cardinality(v_dates)];
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, date, end_date, time_start, time_end,
      meeting_point, unit_price, quantity, discount_percent, status, item_type, group_name, skill_level)
    VALUES (v_ticket, v_course.product_id, v_pid, v_first, CASE WHEN v_last <> v_first THEN v_last END,
      (SELECT min((x->>'time_start')::time) FROM jsonb_array_elements(v_blocks) x),
      (SELECT max((x->>'time_end')::time) FROM jsonb_array_elements(v_blocks) x),
      v_course.meeting_point, v_price, 1, 0, 'booked', 'group', v_course.name, v_course.skill_level_id)
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
    IF NOT v_pid = ANY (v_parts) THEN v_parts := v_parts || v_pid; END IF;
  END LOOP;

  UPDATE public.tickets SET participant_count = cardinality(v_parts) WHERE id = v_ticket;
  PERFORM public.pa_recalc_ticket_total(v_ticket);
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
    'participant_ids', to_jsonb(v_parts));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  -- whole transaction rolled back to the function entry; nothing persisted
  GET STACKED DIAGNOSTICS e = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('error', 'invalid', 'field', SQLERRM, 'line', e);
WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('error', 'invalid', 'field', 'tariff', 'message', SQLERRM);
END $$;

REVOKE ALL ON FUNCTION public.bc_2627_staff_group_blocks(uuid, int, text, date[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc_2627_staff_group_options(date[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_blocks(uuid, int, text, date[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_options(date[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) TO service_role;
