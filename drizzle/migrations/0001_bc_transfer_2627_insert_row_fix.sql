CREATE OR REPLACE FUNCTION bc_transfer_20261003.insert_row(p_table text, p_row jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ',' ORDER BY attnum) INTO cols FROM pg_attribute
   WHERE attrelid = ('public.' || quote_ident(p_table))::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '';
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', p_table, cols, cols, p_table) USING p_row;
END $$;
REVOKE ALL ON FUNCTION bc_transfer_20261003.insert_row(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bc_transfer_20261003.insert_row(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION bc_transfer_20261003.apply_sale(p_run text, p_sale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := bc_transfer_20261003.pkg(); b jsonb; v_hash text; st record; v_tid uuid; v_cust_lab uuid; mcu record;
  v_cust uuid; x jsonb; c public.customers; pr public.customer_participants; ti public.ticket_items; pa public.private_appointments;
  v_season uuid; v_num text; v_changed text[]; v_pre jsonb; f text; cw record; n_ins int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bc_transfer_20261003:' || p_sale));
  IF NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.runs WHERE run_id = p_run) THEN RAISE EXCEPTION 'unknown run %', p_run; END IF;
  b := bc_transfer_20261003.sale_bundle(p_sale);
  IF b IS NULL THEN RAISE EXCEPTION 'sale % not found / not unique', p_sale; END IF;
  v_hash := md5(b::text);
  SELECT * INTO st FROM bc_transfer_20261003.sale_status WHERE sale_code = p_sale;
  IF FOUND AND st.status = 'applied' THEN
    IF st.source_hash <> v_hash THEN RAISE EXCEPTION 'source changed for already applied sale %', p_sale; END IF;
    RETURN jsonb_build_object('sale', p_sale, 'status', 'already_applied');
  END IF;

  v_tid := (b->'ticket'->>'id')::uuid; v_cust_lab := (b->'customer'->>'id')::uuid;
  SELECT id INTO v_season FROM public.seasons WHERE name = 'Winter 26/27';
  INSERT INTO bc_transfer_20261003.active_tx VALUES (txid_current(), v_tid, p_run, p_sale);

  -- Customer
  SELECT * INTO mcu FROM bc_transfer_20261003.map_customer WHERE lab_customer_id = v_cust_lab;
  IF NOT FOUND OR mcu.action NOT IN ('insert','reuse') THEN RAISE EXCEPTION 'customer not uniquely mapped for sale %', p_sale; END IF;
  IF mcu.action = 'reuse' THEN
    v_cust := mcu.target_customer_id;
    SELECT * INTO c FROM public.customers WHERE id = v_cust FOR UPDATE;
    v_pre := to_jsonb(c); v_changed := ARRAY[]::text[];
    FOREACH f IN ARRAY ARRAY['phone','first_name','street','house_number','zip','city'] LOOP
      IF coalesce(v_pre->>f, '') = '' AND coalesce(b->'customer'->>f, '') <> '' THEN v_changed := v_changed || f; END IF;
    END LOOP;
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
      VALUES (p_run, p_sale, 'customers', v_cust, 'preimage', jsonb_build_object('row', v_pre, 'filled_fields', to_jsonb(v_changed)), md5(v_pre::text));
    IF cardinality(v_changed) > 0 THEN
      UPDATE public.customers SET
        phone = CASE WHEN 'phone' = ANY(v_changed) THEN b->'customer'->>'phone' ELSE phone END,
        first_name = CASE WHEN 'first_name' = ANY(v_changed) THEN b->'customer'->>'first_name' ELSE first_name END,
        street = CASE WHEN 'street' = ANY(v_changed) THEN b->'customer'->>'street' ELSE street END,
        house_number = CASE WHEN 'house_number' = ANY(v_changed) THEN b->'customer'->>'house_number' ELSE house_number END,
        zip = CASE WHEN 'zip' = ANY(v_changed) THEN b->'customer'->>'zip' ELSE zip END,
        city = CASE WHEN 'city' = ANY(v_changed) THEN b->'customer'->>'city' ELSE city END
      WHERE id = v_cust;
    END IF;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('customers', v_cust_lab, v_cust, 'reuse', p_run, p_sale);
  ELSE
    c := jsonb_populate_record(NULL::public.customers, b->'customer');
    c.customer_number := NULL; c.merged_into_id := NULL; c.merged_at := NULL; c.merged_by := NULL;
    c.is_archived := false; c.created_at := now(); c.holiday_address := coalesce(c.holiday_address, '');
    c.kulanz_score := coalesce(c.kulanz_score, 0); c.additional_phones := coalesce(c.additional_phones, '[]');
    c.additional_emails := coalesce(c.additional_emails, '[]');
    PERFORM bc_transfer_20261003.insert_row('customers', to_jsonb(c));
    v_cust := c.id;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('customers', v_cust_lab, v_cust, 'insert', p_run, p_sale);
  END IF;

  -- People: canonical rows inserted, merged rows recorded as aliases only
  FOR x IN SELECT * FROM jsonb_array_elements(b->'participants') LOOP
    IF x->>'merged_into_id' IS NULL THEN
      pr := jsonb_populate_record(NULL::public.customer_participants, x);
      pr.customer_id := v_cust; pr.merged_into_id := NULL; pr.merged_at := NULL; pr.merged_by := NULL;
      pr.current_ski_training_id := NULL; pr.current_snowboard_training_id := NULL; pr.is_archived := false; pr.created_at := now();
      PERFORM bc_transfer_20261003.insert_row('customer_participants', to_jsonb(pr));
      INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
        VALUES ('customer_participants', pr.id, pr.id, 'insert', p_run, p_sale);
    ELSE
      INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
        SELECT 'participant_alias', mp.lab_participant_id, mp.canonical_lab_id, 'alias', p_run, p_sale
          FROM bc_transfer_20261003.map_participant mp WHERE mp.lab_participant_id = (x->>'id')::uuid AND mp.action = 'alias';
      IF NOT FOUND THEN RAISE EXCEPTION 'merged participant without valid alias in sale %', p_sale; END IF;
    END IF;
  END LOOP;

  -- Ticket (native number allocator, season set explicitly, payment unknown)
  v_num := public.generate_ticket_number();
  INSERT INTO public.tickets (id, ticket_number, customer_id, status, total_amount, paid_amount, payment_method, notes, internal_notes,
      created_by, ticket_type, skip_documents, notes_for_instructors, season_id, source, reservation_token, participant_count, total_participants)
  VALUES (v_tid, v_num, v_cust, 'confirmed', (b->'ticket'->>'total_amount')::numeric, NULL, NULL, b->'ticket'->>'notes',
      concat_ws(E'\n', nullif(b->'ticket'->>'internal_notes', ''), 'Booking-Corner-Übernahme 26/27, Verkauf ' || p_sale || ' – Zahlungsstatus unbekannt.'),
      NULL, coalesce(b->'ticket'->>'ticket_type', 'standard'), true, b->'ticket'->>'notes_for_instructors', v_season, 'office', NULL,
      (b->'ticket'->>'participant_count')::int, (b->'ticket'->>'total_participants')::int);
  INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
    VALUES ('tickets', v_tid, v_tid, 'insert', p_run, p_sale);
  INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
    SELECT 'ticket_history', h.id, h.id, 'insert', p_run, p_sale FROM public.ticket_history h WHERE h.ticket_id = v_tid;

  -- Private appointments (teacher mapped by verified source id; confirmation pending)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'appointments') LOOP
    pa := jsonb_populate_record(NULL::public.private_appointments, x);
    pa.instructor_id := (SELECT target_instructor_id FROM bc_transfer_20261003.map_teacher WHERE lab_instructor_id = (x->>'instructor_id')::uuid);
    IF x->>'instructor_id' IS NOT NULL AND pa.instructor_id IS NULL THEN RAISE EXCEPTION 'teacher unmapped in sale %', p_sale; END IF;
    pa.instructor_confirmation := CASE WHEN pa.instructor_id IS NULL THEN NULL ELSE 'pending' END;
    pa.confirmed_at := NULL; pa.confirmed_by := NULL; pa.created_at := now(); pa.updated_at := now();
    PERFORM bc_transfer_20261003.insert_row('private_appointments', to_jsonb(pa));
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('private_appointments', pa.id, pa.id, 'insert', p_run, p_sale);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(b->'appointment_participants') LOOP
    INSERT INTO public.private_appointment_participants (id, appointment_id, participant_id)
      VALUES ((x->>'id')::uuid, (x->>'appointment_id')::uuid, (x->>'participant_id')::uuid);
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('private_appointment_participants', (x->>'id')::uuid, (x->>'id')::uuid, 'insert', p_run, p_sale);
  END LOOP;

  -- Billing lines (recorded source prices kept)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'items') LOOP
    ti := jsonb_populate_record(NULL::public.ticket_items, x);
    ti.created_at := now(); ti.instructor_confirmed_at := NULL; ti.instructor_declined_at := NULL; ti.instructor_decline_reason := NULL;
    ti.confirmation_reset_at := NULL; ti.confirmation_reset_reason := NULL;
    IF x->>'item_type' = 'private' THEN
      SELECT p.id INTO ti.product_id FROM public.products p JOIN jsonb_array_elements(j->'products') lp ON lp->>'id' = x->>'product_id'
       WHERE p.season_id = v_season AND p.type = 'private' AND p.discipline = lp->>'discipline';
      SELECT a.instructor_id, a.instructor_confirmation INTO ti.instructor_id, ti.instructor_confirmation
        FROM public.private_appointments a WHERE a.id = ti.appointment_id;
    ELSE
      SELECT mc.target_product_id, g.name INTO ti.product_id, ti.group_name
        FROM jsonb_array_elements(b->'enrollments') e
        JOIN jsonb_array_elements(j->'instances') li ON li->>'id' = e->>'instance_id'
        JOIN bc_transfer_20261003.map_course mc ON mc.lab_course_id = (li->>'course_id')::uuid
        JOIN public.group_courses g ON g.id = mc.target_course_id
       WHERE e->>'ticket_item_id' = x->>'id';
      ti.instructor_id := NULL; ti.instructor_confirmation := NULL;
    END IF;
    IF ti.product_id IS NULL THEN RAISE EXCEPTION 'product unmapped for line % in sale %', ti.id, p_sale; END IF;
    PERFORM bc_transfer_20261003.insert_row('ticket_items', to_jsonb(ti));
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('ticket_items', ti.id, ti.id, 'insert', p_run, p_sale);
  END LOOP;

  -- Enrollments on existing course days (no new days)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'enrollments') LOOP
    INSERT INTO public.group_course_enrollments (id, instance_id, ticket_item_id, participant_id, attendance_status, notes)
    SELECT (x->>'id')::uuid, mi.target_instance_id, (x->>'ticket_item_id')::uuid, (x->>'participant_id')::uuid, 'registered', x->>'notes'
      FROM bc_transfer_20261003.map_instance mi WHERE mi.lab_instance_id = (x->>'instance_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'instance unmapped in sale %', p_sale; END IF;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('group_course_enrollments', (x->>'id')::uuid, (x->>'id')::uuid, 'insert', p_run, p_sale);
  END LOOP;

  -- Assertions
  IF (SELECT coalesce(sum(line_total), 0) FROM public.ticket_items WHERE ticket_id = v_tid) <> (b->'ticket'->>'total_amount')::numeric
     OR (SELECT coalesce(sum((p->>'amount_minor_units')::bigint), 0) FROM jsonb_array_elements(b->'positions') p) <> round((b->'ticket'->>'total_amount')::numeric * 100) THEN
    RAISE EXCEPTION 'amount mismatch in sale %', p_sale;
  END IF;
  IF EXISTS (SELECT 1 FROM public.instructor_notification_queue q JOIN public.ticket_items t ON t.id = q.ticket_item_id WHERE t.ticket_id = v_tid) THEN
    RAISE EXCEPTION 'notification would be queued for sale %', p_sale;
  END IF;

  -- After-images and evidence
  FOR cw IN SELECT * FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity <> 'participant_alias' LOOP
    UPDATE bc_transfer_20261003.crosswalk SET after_hash = bc_transfer_20261003.row_hash(cw.entity, cw.target_id)
     WHERE entity = cw.entity AND source_id = cw.source_id;
    IF cw.action = 'insert' THEN n_ins := n_ins + 1; END IF;
  END LOOP;
  IF mcu.action = 'reuse' THEN
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
      SELECT p_run, p_sale, 'customers', v_cust, 'afterimage', to_jsonb(cu), md5(to_jsonb(cu)::text) FROM public.customers cu WHERE cu.id = v_cust;
  END IF;
  INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
    VALUES (p_run, p_sale, 'tickets', v_tid, 'evidence', jsonb_build_object('sale', b->'sale', 'positions', b->'positions',
            'unresolved_tickets', b->'unresolved_tickets', 'lab_ticket_number', b->'ticket'->>'ticket_number', 'source_hash', v_hash,
            'payment', 'unknown – paid_amount NULL, no settlement implied'), v_hash);
  INSERT INTO bc_transfer_20261003.sale_status (sale_code, run_id, status, source_hash, lab_ticket_id, applied_at)
    VALUES (p_sale, p_run, 'applied', v_hash, v_tid, now())
    ON CONFLICT (sale_code) DO UPDATE SET status = 'applied', run_id = p_run, source_hash = v_hash, applied_at = now(), rolled_back_at = NULL;
  DELETE FROM bc_transfer_20261003.active_tx WHERE txid = txid_current();
  RETURN jsonb_build_object('sale', p_sale, 'status', 'applied', 'ticket_number', v_num, 'inserted_rows', n_ins, 'customer', mcu.action);
END $$;

REVOKE ALL ON FUNCTION bc_transfer_20261003.apply_sale(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bc_transfer_20261003.apply_sale(text,text) TO service_role;
