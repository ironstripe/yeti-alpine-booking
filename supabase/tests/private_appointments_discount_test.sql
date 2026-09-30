-- Manual discount regression test for canonical private bookings (pa_create_booking / pa_apply_slot).
-- Run like the Phase 2 test as service_role/postgres. Always ends with an exception so everything
-- rolls back. Success = 'PA_DISCOUNT_ALL_PASSED'.
DO $$
DECLARE
  i1 uuid; v_cust uuid; v_prod uuid; v_ticket uuid; v_aid uuid; r jsonb; n int; c_before bigint; c_after bigint;
  f date := public.pa_business_today() + 430;
  v_parts jsonb := jsonb_build_array(jsonb_build_object('guest_key','guest-disc-0001','first_name','Disc','last_name','Test','birth_date','2011-02-03'));
  v_p1 numeric; v_p2 numeric; v_total numeric;
  base jsonb;
BEGIN
  SELECT id INTO i1 FROM public.instructors WHERE status = 'active' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cust FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prod FROM public.products WHERE type = 'private' ORDER BY name LIMIT 1;
  IF i1 IS NULL OR v_cust IS NULL OR v_prod IS NULL THEN RAISE EXCEPTION 'FAIL: missing base fixtures'; END IF;
  SELECT (SELECT count(*) FROM public.tickets)+(SELECT count(*) FROM public.ticket_items)+(SELECT count(*) FROM public.private_appointments) INTO c_before;
  base := jsonb_build_object('customer_id',v_cust,'product_id',v_prod,'participants',v_parts,
    'appointments', jsonb_build_array(jsonb_build_object('date',f,'time_start','10:00','time_end','11:00','instructor_id',i1)));

  -- 1. invalid discounts are rejected and write nothing
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-bad-0001','discount_percent',10), NULL);
  IF r->>'field' IS DISTINCT FROM 'discount_reason' THEN RAISE EXCEPTION 'FAIL 1a missing reason: %', r; END IF;
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-bad-0002','discount_percent',10,'discount_reason','   '), NULL);
  IF r->>'field' IS DISTINCT FROM 'discount_reason' THEN RAISE EXCEPTION 'FAIL 1b blank reason: %', r; END IF;
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-bad-0003','discount_percent',101,'discount_reason','x'), NULL);
  IF r->>'field' IS DISTINCT FROM 'discount_percent' THEN RAISE EXCEPTION 'FAIL 1c >100: %', r; END IF;
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-bad-0004','discount_percent',-1,'discount_reason','x'), NULL);
  IF r->>'field' IS DISTINCT FROM 'discount_percent' THEN RAISE EXCEPTION 'FAIL 1d <0: %', r; END IF;
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-bad-0005','discount_percent','10','discount_reason','x'), NULL);
  IF r->>'field' IS DISTINCT FROM 'discount_percent' THEN RAISE EXCEPTION 'FAIL 1e string percent: %', r; END IF;
  SELECT (SELECT count(*) FROM public.tickets)+(SELECT count(*) FROM public.ticket_items)+(SELECT count(*) FROM public.private_appointments) INTO c_after;
  IF c_after <> c_before THEN RAISE EXCEPTION 'FAIL 1f rejected requests wrote rows'; END IF;

  -- 2. 10% on two appointments: undiscounted unit_price from pa_price, discount on every line, exact total
  r := public.pa_create_booking(jsonb_build_object('submission_key','pa-disc-ok-0001','customer_id',v_cust,'product_id',v_prod,
    'participants',v_parts,'discount_percent',10,'discount_reason','  Stammkunde ',
    'appointments', jsonb_build_array(
      jsonb_build_object('date',f,'time_start','10:00','time_end','12:00','instructor_id',i1),
      jsonb_build_object('date',f+1,'time_start','13:00','time_end','14:00','instructor_id',i1))), NULL);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 2a create: %', r; END IF;
  v_ticket := (r->>'ticket_id')::uuid;
  v_p1 := public.pa_price(f, '10:00', '12:00', 1); v_p2 := public.pa_price(f+1, '13:00', '14:00', 1);
  SELECT count(*) INTO n FROM public.ticket_items WHERE ticket_id = v_ticket
    AND discount_percent = 10 AND discount_reason = 'Stammkunde' AND quantity = 1;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 2b discount not on every line (%)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = v_ticket AND date = f AND unit_price = v_p1)
     OR NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = v_ticket AND date = f+1 AND unit_price = v_p2) THEN
    RAISE EXCEPTION 'FAIL 2c unit_price must be undiscounted pa_price'; END IF;
  v_total := round((v_p1 + v_p2) * 0.9, 2);
  IF round((SELECT total_amount FROM public.tickets WHERE id = v_ticket), 2) <> v_total
     OR round((r->>'total')::numeric, 2) <> v_total THEN
    RAISE EXCEPTION 'FAIL 2d total % expected %', (SELECT total_amount FROM public.tickets WHERE id = v_ticket), v_total; END IF;

  -- 3. replay returns the same ticket and total, no duplicate lines
  r := public.pa_create_booking(jsonb_build_object('submission_key','pa-disc-ok-0001','customer_id',v_cust,'product_id',v_prod,
    'participants',v_parts,'discount_percent',10,'discount_reason','Stammkunde',
    'appointments', jsonb_build_array(jsonb_build_object('date',f,'time_start','10:00','time_end','12:00','instructor_id',i1))), NULL);
  IF (r->>'replayed')::boolean IS NOT TRUE OR (r->>'ticket_id')::uuid <> v_ticket THEN RAISE EXCEPTION 'FAIL 3a replay: %', r; END IF;
  IF (SELECT count(*) FROM public.ticket_items WHERE ticket_id = v_ticket) <> 2 THEN RAISE EXCEPTION 'FAIL 3b duplicate lines'; END IF;

  -- 4. moving keeps the discount and reprices from the new slot
  SELECT id INTO v_aid FROM public.private_appointments WHERE ticket_id = v_ticket ORDER BY date LIMIT 1;
  PERFORM public.pa_apply_slot(v_aid, f, '14:00', '15:00', i1);
  PERFORM public.pa_recalc_ticket_total(v_ticket);
  IF NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE appointment_id = v_aid AND discount_percent = 10
                 AND discount_reason = 'Stammkunde' AND unit_price = public.pa_price(f, '14:00', '15:00', 1)) THEN
    RAISE EXCEPTION 'FAIL 4a move lost discount or price'; END IF;
  v_total := round((public.pa_price(f, '14:00', '15:00', 1) + v_p2) * 0.9, 2);
  IF round((SELECT total_amount FROM public.tickets WHERE id = v_ticket), 2) <> v_total THEN RAISE EXCEPTION 'FAIL 4b total after move'; END IF;

  -- 5. zero / absent discount never persists a reason
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-zero-001','discount_percent',0,'discount_reason','Versehen'), NULL);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 5a: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = (r->>'ticket_id')::uuid AND (discount_percent <> 0 OR discount_reason IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL 5b zero discount persisted reason'; END IF;
  r := public.pa_create_booking(base || jsonb_build_object('submission_key','pa-disc-none-001',
    'appointments', jsonb_build_array(jsonb_build_object('date',f+2,'time_start','10:00','time_end','11:00','instructor_id',i1))), NULL);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 5c: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = (r->>'ticket_id')::uuid AND (discount_percent <> 0 OR discount_reason IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL 5d absent discount persisted values'; END IF;

  RAISE EXCEPTION 'PA_DISCOUNT_ALL_PASSED';
END $$;
