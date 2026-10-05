-- Staff (office/admin) atomic group-course booking for Winter 26/27 source-bound courses.
-- Installed as drizzle/migrations/0003 together with the
-- `staff-group-booking` Edge Function. Rollback: bc_2627_staff_group_booking_rollback.sql
--
-- Contract:
-- * Prices come only from public.quote_bc_2627_product (exact Booking-Corner source tariff +
--   exact day tier). This migration corrects its GROUP-only rule: source group_capacity no
--   longer limits sales (confirmed unlimited group-sales policy); private stays 1-5 persons.
--   Each product+dates+block is quoted ONCE with the real participant count of the request.
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

-- Authoritative 26/27 quote with corrected group participant rule.
CREATE OR REPLACE FUNCTION public.quote_bc_2627_product(p_product_id uuid, p_items jsonb, p_participants integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product record;
  v_item jsonb;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_day_count integer;
  v_item_count integer;
  v_expected_duration integer;
  v_rate numeric(10,2);
  v_tier numeric(10,2);
  v_source_count integer;
  v_capacity integer;
  v_series integer;
  v_first_week date;
  v_dates date[] := ARRAY[]::date[];
  v_morning integer;
  v_afternoon integer;
  v_day date;
  v_total numeric(10,2) := 0;
  v_source_ids text[] := ARRAY[]::text[];
  v_source_id text;
BEGIN
  IF p_participants IS NULL OR p_participants < 1
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid 26/27 quote input' USING ERRCODE='22023';
  END IF;

  SELECT p.id, p.type, p.discipline, p.duration_minutes,
         p.pricing_type, p.season_id, s.start_date, s.end_date
    INTO v_product
    FROM public.products p JOIN public.seasons s ON s.id=p.season_id
   WHERE p.id=p_product_id AND s.name='Winter 26/27'
     AND s.start_date=DATE '2026-12-01' AND s.end_date=DATE '2027-04-15';
  IF NOT FOUND OR v_product.type NOT IN ('private','group','group_toddler')
     OR NOT EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                    WHERE src.product_id=p_product_id AND src.import_status='draft') THEN
    RAISE EXCEPTION 'Product has no validated 26/27 price source' USING ERRCODE='22023';
  END IF;
  -- Private lessons stay limited to 1-5 persons (exact source rate per persons_per_lesson).
  -- Group sales are unlimited (confirmed policy): source group_capacity is planning info only.
  IF v_product.type='private' AND p_participants>5 THEN
    RAISE EXCEPTION 'Invalid 26/27 quote input' USING ERRCODE='22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR COALESCE(v_item->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
       OR COALESCE(v_item->>'time_start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR COALESCE(v_item->>'time_end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid date or time in quote' USING ERRCODE='22023';
    END IF;
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    IF v_date NOT BETWEEN v_product.start_date AND v_product.end_date OR v_end <= v_start THEN
      RAISE EXCEPTION 'Quote date outside season or invalid time' USING ERRCODE='22023';
    END IF;
    v_duration := EXTRACT(EPOCH FROM (v_end-v_start))::integer / 60;
    v_dates := array_append(v_dates, v_date);
    IF v_product.type='private' THEN
      IF v_start < TIME '09:00' OR v_end > TIME '16:00'
         OR v_duration NOT IN (60,120,180,240,300,360,420) THEN
        RAISE EXCEPTION 'Unsupported private duration or time' USING ERRCODE='22023';
      END IF;
      SELECT count(*), max(price_chf), max(source_id)
        INTO v_source_count, v_rate, v_source_id
        FROM public.bc_product_tariff_sources
       WHERE product_id=p_product_id AND import_status='draft'
         AND day_count=1 AND duration_minutes=v_duration
         AND persons_per_lesson=p_participants;
      IF v_source_count<>1 OR v_rate IS NULL OR v_rate<=0 THEN
        RAISE EXCEPTION 'No unique source private rate for duration/persons' USING ERRCODE='22023';
      END IF;
      v_total := v_total + v_rate;
      v_source_ids := array_append(v_source_ids,v_source_id);
    ELSE
      IF (v_start,v_end) NOT IN ((TIME '10:00',TIME '12:00'),(TIME '14:00',TIME '16:00')) THEN
        RAISE EXCEPTION 'Group slot must be 10-12 or 14-16' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;

  SELECT count(DISTINCT x) INTO v_day_count FROM unnest(v_dates) AS x;
  v_item_count := jsonb_array_length(p_items);
  IF v_product.type='private' THEN
    IF v_item_count<>v_day_count THEN
      RAISE EXCEPTION 'Duplicate private day' USING ERRCODE='22023';
    END IF;
  ELSE
    v_expected_duration := v_product.duration_minutes;
    IF v_expected_duration NOT IN (120,240) OR v_day_count NOT BETWEEN 1 AND 5
       OR v_item_count<>v_day_count * (v_expected_duration/120) THEN
      RAISE EXCEPTION 'Wrong group day count or duration' USING ERRCODE='22023';
    END IF;
    v_first_week := date_trunc('week',v_dates[1])::date;
    FOR v_day IN SELECT DISTINCT x FROM unnest(v_dates) x LOOP
      SELECT count(*) FILTER (WHERE (i->>'time_start')='10:00' AND (i->>'time_end')='12:00'),
             count(*) FILTER (WHERE (i->>'time_start')='14:00' AND (i->>'time_end')='16:00')
        INTO v_morning,v_afternoon
        FROM jsonb_array_elements(p_items) AS i WHERE (i->>'date')::date=v_day;
      IF (v_expected_duration=240 AND (v_morning<>1 OR v_afternoon<>1))
         OR (v_expected_duration=120 AND v_morning+v_afternoon<>1) THEN
        RAISE EXCEPTION 'Missing or duplicate group time block' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.bc_product_tariff_sources s
                WHERE s.product_id=p_product_id AND s.source_family='Samstagkurs') THEN
      -- Both series contain five concrete Saturdays; never mix them.
      v_series := CASE WHEN v_dates[1] BETWEEN DATE '2027-01-09' AND DATE '2027-02-06' THEN 1
                       WHEN v_dates[1] BETWEEN DATE '2027-02-20' AND DATE '2027-03-20' THEN 2
                       ELSE 0 END;
      IF v_series=0 OR EXISTS (
          SELECT 1 FROM unnest(v_dates) d
          WHERE EXTRACT(ISODOW FROM d)<>6 OR (v_series=1 AND d NOT BETWEEN DATE '2027-01-09' AND DATE '2027-02-06')
            OR (v_series=2 AND d NOT BETWEEN DATE '2027-02-20' AND DATE '2027-03-20')
      ) THEN
        RAISE EXCEPTION 'Saturday dates must belong to one of the two series' USING ERRCODE='22023';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM unnest(v_dates) d WHERE EXTRACT(ISODOW FROM d)>5 OR date_trunc('week',d)::date<>v_first_week) THEN
      RAISE EXCEPTION 'Weekday group dates must be in one Mon-Fri week' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(cumulative_price) INTO v_source_count,v_tier
      FROM public.product_price_tiers
     WHERE product_id=p_product_id AND day_count=v_day_count;
    IF v_source_count<>1 OR v_tier IS NULL OR v_tier<=0 THEN
      RAISE EXCEPTION 'Missing exact day tier; no fallback/extrapolation' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(source_id) INTO v_source_count,v_source_id
      FROM public.bc_product_tariff_sources
     WHERE product_id=p_product_id AND import_status='draft'
       AND day_count=v_day_count AND duration_minutes=v_expected_duration
       AND persons_per_lesson=1 AND price_chf=v_tier;
    IF v_source_count<>1 THEN
      RAISE EXCEPTION 'Price tier does not match unique Booking source tariff' USING ERRCODE='22023';
    END IF;
    v_source_ids := ARRAY[v_source_id];
    v_total := v_tier * p_participants;
  END IF;
  IF v_total<=0 THEN RAISE EXCEPTION 'Zero price is not a booking quote' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('total_amount',v_total,'currency','CHF','participant_count',p_participants,
    'product_id',p_product_id,'day_count',v_day_count,'source_tariff_ids',v_source_ids,
    'quote_version','bc-2627-exact-v1');
END;
$function$;

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
  v_parts uuid[] := ARRAY[]::uuid[]; v_counts jsonb := '{}'::jsonb; v_qkey text; v_n int; v_tg uuid; v_first date; v_last date; v_detail text;
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

  -- participant count per identical product+dates+block: one authoritative group quote each
  FOR e IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_qkey := coalesce(e->>'product_id','') || '|' || coalesce(e->>'block','') || '|' ||
      coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM jsonb_array_elements_text(e->'dates') x), '');
    v_counts := v_counts || jsonb_build_object(v_qkey, coalesce((v_counts->>v_qkey)::int, 0) + 1);
  END LOOP;

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

    v_qkey := coalesce(e->>'product_id','') || '|' || coalesce(e->>'block','') || '|' ||
      coalesce((SELECT string_agg(x, ',' ORDER BY x) FROM jsonb_array_elements_text(e->'dates') x), '');
    v_n := (v_counts->>v_qkey)::int;
    v_quote := public.quote_bc_2627_product(v_course.product_id,
      (SELECT jsonb_agg(x - 'instance_id') FROM jsonb_array_elements(v_blocks) x), v_n);
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
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('error', 'invalid', 'field', SQLERRM, 'line', v_detail);
WHEN SQLSTATE '22023' THEN
  RETURN jsonb_build_object('error', 'invalid', 'field', 'tariff', 'message', SQLERRM);
END $$;

REVOKE ALL ON FUNCTION public.bc_2627_staff_group_blocks(uuid, int, text, date[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc_2627_staff_group_options(date[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_blocks(uuid, int, text, date[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_options(date[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bc_2627_staff_group_book(jsonb, uuid) TO service_role;
