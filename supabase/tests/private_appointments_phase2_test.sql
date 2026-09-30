-- Private appointments Phase 2 SQL test (transactional pa_* operations).
-- Run like the Phase 1 test: execute the whole file as service_role/postgres (Lovable Cloud SQL runner,
-- or psql "$PRIVILEGED_DB_URL" -f supabase/tests/private_appointments_phase2_test.sql).
-- Always ends with an exception so everything rolls back. Success = 'PA_PHASE2_ALL_PASSED'.
DO $$
DECLARE
  i1 uuid; i2 uuid; i3 uuid; v_cust uuid; v_prod uuid; v_p1 uuid; v_p2 uuid;
  f date := public.pa_business_today() + 420;
  r jsonb; r2 jsonb; v_ticket uuid; v_ids uuid[]; v_group uuid; v_past uuid; n int; v_price numeric;
  c_before bigint; c_after bigint; h_before int; q_before int;
BEGIN
  SELECT array_agg(id ORDER BY created_at) INTO v_ids FROM (SELECT id, created_at FROM public.instructors ORDER BY created_at LIMIT 3) x;
  i1 := v_ids[1]; i2 := v_ids[2]; i3 := v_ids[3];
  SELECT id INTO v_cust FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prod FROM public.products WHERE type = 'private' ORDER BY name LIMIT 1;
  IF i3 IS NULL OR v_cust IS NULL OR v_prod IS NULL THEN RAISE EXCEPTION 'FAIL: missing base fixtures'; END IF;
  SELECT (SELECT count(*) FROM public.tickets)+(SELECT count(*) FROM public.ticket_items)+(SELECT count(*) FROM public.private_appointments)
       +(SELECT count(*) FROM public.customer_participants) INTO c_before;
  INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date) VALUES (v_cust,'PA2','One','2012-01-01') RETURNING id INTO v_p1;
  INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date) VALUES (v_cust,'PA2','Two','2013-01-01') RETURNING id INTO v_p2;
  h_before := (SELECT count(*) FROM public.ticket_history WHERE event_type = 'PRIVATE_APPOINTMENT_CHANGED');
  q_before := (SELECT count(*) FROM public.notification_queue WHERE notification_type = 'private_appointment_changed');

  -- 1. create: 3 days, 3 instructors, 3 participants (1 guest)
  r := public.pa_create_booking(jsonb_build_object(
    'submission_key','pa2-test-key-0001','customer_id',v_cust,'product_id',v_prod,
    'appointments', jsonb_build_array(
      jsonb_build_object('date',f,'time_start','10:00','time_end','11:00','instructor_id',i1),
      jsonb_build_object('date',f+1,'time_start','09:00','time_end','11:00','instructor_id',i2),
      jsonb_build_object('date',f+2,'time_start','14:00','time_end','16:00','instructor_id',i3)),
    'participants', jsonb_build_array(
      jsonb_build_object('participant_id',v_p1), jsonb_build_object('participant_id',v_p2),
      jsonb_build_object('guest_key','guest-key-0001','first_name','Gast','last_name','Test','birth_date','2014-02-02'))), NULL);
  IF NOT coalesce((r->>'ok')::boolean,false) THEN RAISE EXCEPTION 'FAIL 1: %', r; END IF;
  v_ticket := (r->>'ticket_id')::uuid;
  IF (SELECT count(*) FROM public.private_appointments WHERE ticket_id = v_ticket) <> 3 THEN RAISE EXCEPTION 'FAIL 1a appts'; END IF;
  IF (SELECT count(*) FROM public.ticket_items WHERE ticket_id = v_ticket AND appointment_id IS NOT NULL AND participant_id IS NULL) <> 3 THEN RAISE EXCEPTION 'FAIL 1b lines'; END IF;
  -- expected: 3p => 85+40=125 ; 75+85 + 2*2*20 = 240 ; 170+80 = 250 ; total 615
  v_price := public.pa_price(f,'10:00','11:00',3) + public.pa_price(f+1,'09:00','11:00',3) + public.pa_price(f+2,'14:00','16:00',3);
  IF v_price <> 615 OR (r->>'total')::numeric <> 615 OR (SELECT total_amount FROM public.tickets WHERE id = v_ticket) <> 615 THEN
    RAISE EXCEPTION 'FAIL 1c total expected 615 got % / %', r->>'total', v_price; END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_items ti JOIN public.private_appointments a ON a.id = ti.appointment_id
             WHERE ti.ticket_id = v_ticket AND (ti.unit_price <> a.price OR ti.line_total <> a.price)) THEN RAISE EXCEPTION 'FAIL 1d line != appt price'; END IF;
  IF (SELECT count(*) FROM public.private_appointment_participants m JOIN public.private_appointments a ON a.id = m.appointment_id WHERE a.ticket_id = v_ticket) <> 9 THEN RAISE EXCEPTION 'FAIL 1e mappings'; END IF;
  IF (SELECT count(*) FROM public.customer_participants WHERE customer_id = v_cust AND first_name = 'Gast' AND last_name = 'Test' AND birth_date = '2014-02-02') <> 1 THEN RAISE EXCEPTION 'FAIL 1f guest'; END IF;
  IF (SELECT count(DISTINCT period_group_id) FROM public.private_appointments WHERE ticket_id = v_ticket AND period_group_id IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'FAIL 1g period group'; END IF;

  -- 2. replay: same submission_key writes nothing
  n := (SELECT count(*) FROM public.tickets);
  r2 := public.pa_create_booking(jsonb_build_object('submission_key','pa2-test-key-0001','customer_id',v_cust,'product_id',v_prod,
          'appointments','[]'::jsonb,'participants','[]'::jsonb), NULL);
  IF NOT (r2->>'replayed')::boolean OR (r2->>'ticket_id')::uuid <> v_ticket OR (SELECT count(*) FROM public.tickets) <> n THEN RAISE EXCEPTION 'FAIL 2 replay %', r2; END IF;

  -- 3. conflicting create writes nothing
  n := (SELECT count(*) FROM public.tickets) + (SELECT count(*) FROM public.customer_participants);
  r2 := public.pa_create_booking(jsonb_build_object('submission_key','pa2-test-key-0002','customer_id',v_cust,'product_id',v_prod,
    'appointments', jsonb_build_array(
      jsonb_build_object('date',f+5,'time_start','10:00','time_end','11:00','instructor_id',i1),
      jsonb_build_object('date',f,'time_start','10:30','time_end','11:30','instructor_id',i1)),
    'participants', jsonb_build_array(jsonb_build_object('guest_key','guest-key-0002','first_name','Neu','birth_date','2015-01-01'))), NULL);
  IF r2->>'error' <> 'conflict' OR (r2->'conflicts'->0->>'index')::int <> 1 THEN RAISE EXCEPTION 'FAIL 3 %', r2; END IF;
  IF (SELECT count(*) FROM public.tickets) + (SELECT count(*) FROM public.customer_participants) <> n THEN RAISE EXCEPTION 'FAIL 3b wrote rows'; END IF;

  -- 4. move to free slot: appt + line move, price recalculated, confirmation reset
  SELECT id INTO v_past FROM public.private_appointments WHERE ticket_id = v_ticket AND date = f;
  PERFORM public.pa_confirm_appointment(v_past, i1, 'confirm', NULL, NULL);
  r2 := public.pa_move_appointment(v_past, f+3, '12:00', '14:00', i1, NULL);
  IF NOT coalesce((r2->>'ok')::boolean,false) OR NOT (r2->>'confirmation_reset')::boolean OR (r2->>'price')::numeric <> 230 THEN RAISE EXCEPTION 'FAIL 4 %', r2; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE appointment_id = v_past AND date = f+3 AND time_start = '12:00' AND unit_price = 230 AND instructor_confirmation = 'pending' AND confirmation_reset_reason = 'private_appointment_changed') THEN RAISE EXCEPTION 'FAIL 4b line'; END IF;
  IF (SELECT total_amount FROM public.tickets WHERE id = v_ticket) <> 720 THEN RAISE EXCEPTION 'FAIL 4c total'; END IF;

  -- 5. move into occupied slot -> conflict, unchanged; protected -> excluded
  r2 := public.pa_move_appointment(v_past, f+1, '10:00', '11:00', i2, NULL);
  IF r2->>'error' <> 'conflict' THEN RAISE EXCEPTION 'FAIL 5a %', r2; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.private_appointments WHERE id = v_past AND date = f+3) THEN RAISE EXCEPTION 'FAIL 5b changed'; END IF;
  v_group := (SELECT period_group_id FROM public.private_appointments WHERE id = v_past);
  UPDATE public.private_appointments SET status = 'completed' WHERE id = v_past;
  r2 := public.pa_move_appointment(v_past, f+6, '10:00', '11:00', i1, NULL);
  IF r2->>'error' <> 'protected' OR NOT (r2->'excluded'->0->'reasons') ? 'completed' THEN RAISE EXCEPTION 'FAIL 5c %', r2; END IF;

  -- 6. period update: 1 protected (completed) excluded, 2 future updated; conflict => none
  n := (SELECT count(*) FROM public.ticket_history WHERE event_type = 'PRIVATE_APPOINTMENT_CHANGED');
  INSERT INTO public.instructor_absences (instructor_id, start_date, end_date, type, status, is_full_day)
    VALUES (i2, f+1, f+1, 'other', 'confirmed', true);
  r2 := public.pa_period_update(v_group, jsonb_build_object('instructor_id', i2), NULL);
  IF r2->>'error' <> 'conflict' THEN RAISE EXCEPTION 'FAIL 6a %', r2; END IF;
  IF (SELECT count(*) FROM public.private_appointments WHERE period_group_id = v_group AND instructor_id = i2) <> 1 THEN RAISE EXCEPTION 'FAIL 6b partial write'; END IF;
  IF (SELECT count(*) FROM public.ticket_history WHERE event_type = 'PRIVATE_APPOINTMENT_CHANGED') <> n THEN RAISE EXCEPTION 'FAIL 6c audit on failure'; END IF;
  DELETE FROM public.instructor_absences WHERE instructor_id = i2 AND start_date = f+1 AND type = 'other';
  r2 := public.pa_period_update(v_group, jsonb_build_object('time_start','14:00','time_end','15:00'), NULL);
  IF NOT coalesce((r2->>'ok')::boolean,false) OR jsonb_array_length(r2->'updated_ids') <> 2 OR jsonb_array_length(r2->'excluded') <> 1
     OR (r2->'excluded'->0->>'id')::uuid <> v_past THEN RAISE EXCEPTION 'FAIL 6d %', r2; END IF;
  IF EXISTS (SELECT 1 FROM public.private_appointments WHERE id = v_past AND time_start = '14:00') THEN RAISE EXCEPTION 'FAIL 6e protected changed'; END IF;

  -- 7. audit + event exactly once per successful change (create, move, period = 3; confirm = 1)
  IF (SELECT count(*) FROM public.ticket_history WHERE event_type = 'PRIVATE_APPOINTMENT_CHANGED') - h_before <> 4
     OR (SELECT count(*) FROM public.notification_queue WHERE notification_type = 'private_appointment_changed') - q_before <> 4 THEN
    RAISE EXCEPTION 'FAIL 7 audit/event counts'; END IF;

  -- 8. confirmation: assigned instructor ok (appt + line), other instructor refused
  SELECT id INTO v_past FROM public.private_appointments WHERE ticket_id = v_ticket AND date = f+2;
  r2 := public.pa_confirm_appointment(v_past, i1, 'confirm', NULL, NULL);
  IF r2->>'error' <> 'forbidden' THEN RAISE EXCEPTION 'FAIL 8a %', r2; END IF;
  r2 := public.pa_confirm_appointment(v_past, i3, 'confirm', NULL, NULL);
  IF NOT coalesce((r2->>'ok')::boolean,false)
     OR NOT EXISTS (SELECT 1 FROM public.private_appointments WHERE id = v_past AND instructor_confirmation = 'confirmed' AND confirmed_at IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE appointment_id = v_past AND instructor_confirmation = 'confirmed') THEN RAISE EXCEPTION 'FAIL 8b %', r2; END IF;
  r2 := public.pa_confirm_appointment(v_past, i3, 'decline', '', NULL);
  IF r2->>'error' <> 'invalid' THEN RAISE EXCEPTION 'FAIL 8c decline needs reason'; END IF;

  -- 9. DB idempotency guarantee: one submission row per key; a duplicate key is rejected by the PK
  IF (SELECT count(*) FROM public.private_appointment_submissions WHERE submission_key = 'pa2-test-key-0001' AND ticket_id = v_ticket) <> 1 THEN
    RAISE EXCEPTION 'FAIL 9a submission row'; END IF;
  BEGIN
    INSERT INTO public.private_appointment_submissions (submission_key, ticket_id) VALUES ('pa2-test-key-0001', v_ticket);
    RAISE EXCEPTION 'FAIL 9b duplicate submission_key accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- 10. slot lock helper: de-duplicates, tolerates empty input, holds xact-scoped advisory locks
  PERFORM public.pa_lock_slots('[]'::jsonb);
  PERFORM public.pa_lock_slots(jsonb_build_array(
    jsonb_build_object('instructor_id', i2, 'date', f), jsonb_build_object('instructor_id', i1, 'date', f),
    jsonb_build_object('instructor_id', i1, 'date', f)));
  IF (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND mode = 'ExclusiveLock') < 2 THEN
    RAISE EXCEPTION 'FAIL 10 advisory slot locks not held'; END IF;

  RAISE EXCEPTION 'PA_PHASE2_ALL_PASSED';
END $$;
