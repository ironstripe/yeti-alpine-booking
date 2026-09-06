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
      AND COALESCE(last_name, '') = COALESCE(v_p->>'last_name', '')
      AND birth_date = (v_p->>'birth_date')::date
    LIMIT 1;

    IF v_participant_id IS NULL THEN
      INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport, level_current_season)
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

REVOKE EXECUTE ON FUNCTION public.finalize_provisional_reservation(uuid, text, jsonb, jsonb, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.finalize_provisional_reservation(uuid, text, jsonb, jsonb, text) TO service_role;