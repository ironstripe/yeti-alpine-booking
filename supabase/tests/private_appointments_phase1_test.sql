-- Private appointments Phase 1 SQL test.
-- Runs as one DO block that ALWAYS ends with an exception, so every fixture is rolled back.
-- Success = error message 'PA_PHASE1_ALL_PASSED'. Any other message = failure.
DO $$
DECLARE
  v_instr uuid; v_cust uuid; v_part1 uuid; v_part2 uuid; v_prod uuid;
  v_ticket uuid; v_ticket2 uuid; v_appt uuid; v_appt_past uuid; v_item uuid;
  v_future date := public.pa_business_today() + 30;
  v_counts_before bigint; v_counts_after bigint;
  j jsonb; n int; ok boolean;
BEGIN
  SELECT id INTO v_instr FROM public.instructors ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cust FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prod FROM public.products WHERE type = 'private' LIMIT 1;
  IF v_instr IS NULL OR v_cust IS NULL OR v_prod IS NULL THEN RAISE EXCEPTION 'FAIL: missing base fixtures'; END IF;

  SELECT (SELECT count(*) FROM public.ticket_items) + (SELECT count(*) FROM public.tickets) INTO v_counts_before;

  INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date)
    VALUES (v_cust, 'PA', 'Test1', '2010-01-01') RETURNING id INTO v_part1;
  INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date)
    VALUES (v_cust, 'PA', 'Test2', '2011-01-01') RETURNING id INTO v_part2;
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount)
    VALUES ('PA-TEST-1', v_cust, 'confirmed', 0, 0) RETURNING id INTO v_ticket;

  -- 1. protection
  INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation)
    VALUES (v_ticket, v_future, '07:00', '08:00', v_instr, 'scheduled', 'pending') RETURNING id INTO v_appt;
  INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status)
    VALUES (v_ticket, public.pa_business_today() - 1, '07:00', '08:00', v_instr, 'scheduled') RETURNING id INTO v_appt_past;
  j := public.pa_is_protected(v_appt);
  IF (j->>'protected')::boolean THEN RAISE EXCEPTION 'FAIL 1a: future scheduled should not be protected %', j; END IF;
  j := public.pa_is_protected(v_appt_past);
  IF NOT (j->'reasons') ? 'past' THEN RAISE EXCEPTION 'FAIL 1b: past %', j; END IF;
  UPDATE public.private_appointments SET status = 'completed' WHERE id = v_appt_past;
  j := public.pa_is_protected(v_appt_past);
  IF NOT (j->'reasons') ? 'completed' THEN RAISE EXCEPTION 'FAIL 1c: completed %', j; END IF;
  INSERT INTO public.invoices (invoice_number, ticket_id, customer_id, subtotal, total, qr_reference, due_date, status)
    VALUES ('PA-TEST-INV', v_ticket, v_cust, 0, 0, 'x', v_future, 'draft');
  j := public.pa_is_protected(v_appt);
  IF (j->>'protected')::boolean THEN RAISE EXCEPTION 'FAIL 1d: draft invoice must not protect %', j; END IF;
  UPDATE public.invoices SET status = 'open' WHERE invoice_number = 'PA-TEST-INV';
  j := public.pa_is_protected(v_appt);
  IF NOT (j->'reasons') ? 'invoiced' THEN RAISE EXCEPTION 'FAIL 1e: open invoice %', j; END IF;
  UPDATE public.invoices SET status = 'draft', issued_at = now() WHERE invoice_number = 'PA-TEST-INV';
  j := public.pa_is_protected(v_appt);
  IF NOT (j->'reasons') ? 'invoiced' THEN RAISE EXCEPTION 'FAIL 1f: issued_at %', j; END IF;
  DELETE FROM public.invoices WHERE invoice_number = 'PA-TEST-INV';

  -- 2. conflicts
  IF public.pa_slot_is_free(v_instr, v_future, '07:30', '08:30', NULL) THEN RAISE EXCEPTION 'FAIL 2a: appointment conflict missed'; END IF;
  IF NOT public.pa_slot_is_free(v_instr, v_future, '07:30', '08:30', v_appt) THEN
    -- could still conflict with real data; verify only the appointment kind is excluded
    IF EXISTS (SELECT 1 FROM public.pa_slot_conflicts(v_instr, v_future, '07:30', '08:30', v_appt) WHERE ref_id = v_appt) THEN
      RAISE EXCEPTION 'FAIL 2b: excluded appointment still conflicts';
    END IF;
  END IF;
  IF NOT public.pa_slot_is_free(v_instr, v_future, '08:00', '09:00', v_appt)
     AND EXISTS (SELECT 1 FROM public.pa_slot_conflicts(v_instr, v_future, '08:00', '09:00', NULL) WHERE ref_id = v_appt) THEN
    RAISE EXCEPTION 'FAIL 2c: touching end must not overlap';
  END IF;
  INSERT INTO public.instructor_absences (instructor_id, start_date, end_date, type, status, is_full_day)
    VALUES (v_instr, v_future + 1, v_future + 1, 'other', 'confirmed', true);
  IF NOT EXISTS (SELECT 1 FROM public.pa_slot_conflicts(v_instr, v_future + 1, '10:00', '11:00', NULL) WHERE kind = 'absence') THEN
    RAISE EXCEPTION 'FAIL 2d: absence conflict missed';
  END IF;
  INSERT INTO public.instructor_recurring_blocks (instructor_id, start_time, end_time, weekdays, valid_from, valid_until, status, is_active)
    VALUES (v_instr, '06:00', '06:30', ARRAY[extract(dow FROM v_future + 2)::int], v_future, v_future + 10, 'approved', true);
  IF NOT EXISTS (SELECT 1 FROM public.pa_slot_conflicts(v_instr, v_future + 2, '06:15', '06:45', NULL) WHERE kind = 'recurring_block') THEN
    RAISE EXCEPTION 'FAIL 2e: recurring block conflict missed';
  END IF;

  -- 3. guard trigger
  INSERT INTO public.ticket_items (ticket_id, product_id, date, time_start, time_end, unit_price, instructor_id, instructor_confirmation, appointment_id, item_type, status)
    VALUES (v_ticket, v_prod, v_future, '07:00', '08:00', 85, v_instr, 'pending', v_appt, 'private', 'booked') RETURNING id INTO v_item;
  ok := false;
  BEGIN
    UPDATE public.ticket_items SET instructor_confirmation = 'confirmed' WHERE id = v_item;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3a: confirming line without confirmed appointment was allowed'; END IF;
  ok := false;
  BEGIN
    UPDATE public.ticket_items SET time_start = '09:00', time_end = '10:00' WHERE id = v_item;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3b: time drift allowed'; END IF;
  UPDATE public.private_appointments SET instructor_confirmation = 'confirmed' WHERE id = v_appt;
  UPDATE public.ticket_items SET instructor_confirmation = 'confirmed' WHERE id = v_item; -- must pass
  -- legacy row without appointment is unaffected
  INSERT INTO public.ticket_items (ticket_id, product_id, date, time_start, time_end, unit_price, instructor_id, instructor_confirmation, item_type, status)
    VALUES (v_ticket, v_prod, v_future, '15:00', '16:00', 85, v_instr, 'confirmed', 'private', 'booked');

  -- 4. mapping constraints
  INSERT INTO public.private_appointment_participants (appointment_id, participant_id) VALUES (v_appt, v_part1);
  ok := false;
  BEGIN
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id) VALUES (v_appt, v_part1);
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4a: duplicate mapping allowed'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id) VALUES (v_appt, NULL);
  EXCEPTION WHEN not_null_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 4b: null participant allowed'; END IF;

  -- 5. reconcile report (read-only), synthetic legacy ticket: 2 participants, 1 slot
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount)
    VALUES ('PA-TEST-2', v_cust, 'confirmed', 190, 0) RETURNING id INTO v_ticket2;
  INSERT INTO public.ticket_items (ticket_id, product_id, date, time_start, time_end, unit_price, instructor_id, participant_id, item_type, status, instructor_confirmation)
    VALUES (v_ticket2, v_prod, v_future + 5, '10:00', '11:00', 105, v_instr, v_part1, 'private', 'booked', 'pending'),
           (v_ticket2, v_prod, v_future + 5, '10:00', '11:00', 105, v_instr, v_part2, 'private', 'booked', 'pending');
  SELECT count(*) INTO n FROM public.pa_reconcile_report() r
    WHERE r.ticket_id = v_ticket2 AND r.skip_reason = 'total_mismatch' AND r.item_total_before = 210 AND r.item_total_after = 105;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5a: expected total_mismatch 210 vs 105 for multiplied legacy rows'; END IF;
  UPDATE public.ticket_items SET unit_price = 52.5 WHERE ticket_id = v_ticket2;
  SELECT count(*) INTO n FROM public.pa_reconcile_report() r
    WHERE r.ticket_id = v_ticket2 AND r.planned_action = 'backfill' AND r.skip_reason IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5b: expected backfill candidate when totals match'; END IF;
  UPDATE public.ticket_items SET participant_id = NULL WHERE ticket_id = v_ticket2 AND participant_id = v_part2;
  SELECT count(*) INTO n FROM public.pa_reconcile_report() r WHERE r.ticket_id = v_ticket2 AND r.skip_reason = 'ambiguous_slot';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5c: guest row must be ambiguous'; END IF;
  IF (SELECT count(*) FROM public.private_appointment_backfill_log) <> 0 THEN RAISE EXCEPTION 'FAIL 5d: report wrote log rows'; END IF;

  RAISE EXCEPTION 'PA_PHASE1_ALL_PASSED';
END $$;
