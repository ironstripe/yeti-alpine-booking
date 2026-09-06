-- 1. Schema changes
ALTER TABLE public.tickets ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS participant_count integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_ticket_customer_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL
     AND COALESCE(NEW.status, '') NOT IN ('provisional', 'payment_pending', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'customer_id is required for tickets in status %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ticket_customer_required ON public.tickets;
CREATE TRIGGER trg_enforce_ticket_customer_required
BEFORE INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_customer_required();

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

CREATE UNIQUE INDEX IF NOT EXISTS payments_ticket_reference_unique
  ON public.payments (ticket_id, reference) WHERE reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_open_ticket_unique
  ON public.invoices (ticket_id) WHERE status = 'open';

-- 2. Reservation function: anonymous holds
CREATE OR REPLACE FUNCTION public.create_provisional_reservation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer jsonb := p_payload->'customer';
  v_items jsonb := p_payload->'items';
  v_product_id uuid := (p_payload->>'product_id')::uuid;
  v_hold_minutes int := COALESCE((p_payload->>'hold_minutes')::int, 15);
  v_source text := COALESCE(p_payload->>'source', 'website');
  v_notes text := p_payload->>'notes';

  v_product RECORD;
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
  v_i int;

  v_slot_key text;
  v_ticket_id uuid;
  v_ticket_number text;
  v_token text;
  v_expires_at timestamptz;
  v_assigned jsonb := '[]'::jsonb;
BEGIN
  -- participant_count is authoritative; legacy payloads may still send participants
  v_participant_count := COALESCE(
    (p_payload->>'participant_count')::int,
    CASE WHEN jsonb_typeof(p_payload->'participants') = 'array'
         THEN jsonb_array_length(p_payload->'participants') END
  );

  IF v_participant_count IS NULL OR v_participant_count < 1 OR v_participant_count > 20 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'participant_count must be between 1 and 20');
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

  v_ticket_number := public.generate_ticket_number();
  v_expires_at := now() + make_interval(mins => v_hold_minutes);

  INSERT INTO public.tickets (ticket_number, customer_id, status, notes, ticket_type, source,
                              total_amount, paid_amount, reservation_expires_at, participant_count)
  VALUES (v_ticket_number, NULL, 'provisional', v_notes, 'standard', v_source,
          v_total_amount, 0, v_expires_at, v_participant_count)
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

    FOR v_i IN 1..v_participant_count LOOP
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id,
                                       date, time_start, time_end, unit_price, quantity, item_type, status)
      VALUES (v_ticket_id, v_product.id, NULL, v_slot_instructor,
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
    'participant_count', v_participant_count,
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

-- 3. Finalization function
CREATE OR REPLACE FUNCTION public.finalize_provisional_reservation(
  p_ticket_id uuid,
  p_token text,
  p_customer jsonb,
  p_participants jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket RECORD;
  v_customer_id uuid;
  v_participant_id uuid;
  v_participant_ids uuid[] := '{}';
  v_p jsonb;
  v_count int;
  v_email text;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket IS NULL OR v_ticket.reservation_token IS DISTINCT FROM p_token THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'not_found', 'message', 'Reservation not found');
  END IF;

  -- idempotent: already finalized
  IF v_ticket.finalized_at IS NOT NULL AND v_ticket.customer_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'already_finalized', true,
                              'customer_id', v_ticket.customer_id, 'ticket_id', v_ticket.id);
  END IF;

  IF v_ticket.status = 'expired'
     OR (v_ticket.reservation_expires_at IS NOT NULL AND v_ticket.reservation_expires_at < now()) THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'expired', 'message', 'Reservation expired');
  END IF;

  IF v_ticket.status NOT IN ('provisional', 'payment_pending') THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_status', 'message', v_ticket.status);
  END IF;

  IF p_customer IS NULL OR COALESCE(p_customer->>'email', '') = '' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_customer', 'message', 'customer with email is required');
  END IF;

  IF jsonb_typeof(p_participants) <> 'array' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_participants', 'message', 'participants array is required');
  END IF;

  v_count := jsonb_array_length(p_participants);
  IF COALESCE(v_ticket.participant_count, v_count) <> v_count THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'participant_count_mismatch',
                              'message', format('expected %s participants, got %s', v_ticket.participant_count, v_count));
  END IF;

  v_email := LOWER(TRIM(p_customer->>'email'));

  SELECT id INTO v_customer_id FROM public.customers WHERE LOWER(email) = v_email LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (first_name, last_name, email, phone, street, zip, city, country, holiday_address, customer_type)
    VALUES (p_customer->>'first_name', p_customer->>'last_name', v_email,
            p_customer->>'phone', p_customer->>'street', p_customer->>'zip', p_customer->>'city',
            COALESCE(p_customer->>'country', 'CH'), '', 'private')
    RETURNING id INTO v_customer_id;
  END IF;

  FOR v_p IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    SELECT id INTO v_participant_id FROM public.customer_participants
    WHERE customer_id = v_customer_id
      AND first_name = v_p->>'first_name'
      AND last_name = v_p->>'last_name'
      AND birth_date = (v_p->>'birth_date')::date
    LIMIT 1;

    IF v_participant_id IS NULL THEN
      INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, discipline, skill_level)
      VALUES (v_customer_id, v_p->>'first_name', v_p->>'last_name', (v_p->>'birth_date')::date,
              v_p->>'discipline', v_p->>'skill_level')
      RETURNING id INTO v_participant_id;
    END IF;

    v_participant_ids := v_participant_ids || v_participant_id;
  END LOOP;

  UPDATE public.tickets
  SET customer_id = v_customer_id,
      notes = COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), notes),
      finalized_at = now(),
      updated_at = now()
  WHERE id = p_ticket_id;

  -- assign real participants to the reserved items, keeping instructor/date/time untouched
  UPDATE public.ticket_items ti
  SET participant_id = v_participant_ids[r.rn]
  FROM (
    SELECT id, row_number() OVER (PARTITION BY date, time_start, time_end ORDER BY created_at, id) AS rn
    FROM public.ticket_items
    WHERE ticket_id = p_ticket_id
  ) r
  WHERE ti.id = r.id AND r.rn <= array_length(v_participant_ids, 1);

  RETURN jsonb_build_object('status', 'success', 'ticket_id', p_ticket_id, 'customer_id', v_customer_id,
                            'participant_ids', to_jsonb(v_participant_ids));
END;
$function$;

-- 4. Clean up existing placeholder records
DELETE FROM public.ticket_items ti
USING public.tickets t, public.customers c
WHERE ti.ticket_id = t.id AND t.customer_id = c.id
  AND c.email ILIKE 'reservierung+%@schneesportschule.li'
  AND t.status IN ('provisional', 'payment_pending', 'expired', 'cancelled');

DELETE FROM public.tickets t
USING public.customers c
WHERE t.customer_id = c.id
  AND c.email ILIKE 'reservierung+%@schneesportschule.li'
  AND t.status IN ('provisional', 'payment_pending', 'expired', 'cancelled');

DELETE FROM public.customer_participants p
USING public.customers c
WHERE p.customer_id = c.id
  AND c.email ILIKE 'reservierung+%@schneesportschule.li'
  AND NOT EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.participant_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.event_participants ep WHERE ep.participant_id = p.id);

DELETE FROM public.customers c
WHERE c.email ILIKE 'reservierung+%@schneesportschule.li'
  AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.customer_participants p WHERE p.customer_id = c.id);