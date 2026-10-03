CREATE OR REPLACE FUNCTION bc_transfer_20261003.recount_instances(p_run text, p_sale text, p_ids uuid[], p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r record; n int := 0; v_new int;
BEGIN
  FOR r IN SELECT i.id, i.current_participants FROM public.group_course_instances i WHERE i.id = ANY(p_ids) ORDER BY i.id FOR UPDATE LOOP
    SELECT count(*)::int INTO v_new FROM public.group_course_enrollments e WHERE e.instance_id = r.id;
    IF r.current_participants IS DISTINCT FROM v_new THEN
      UPDATE public.group_course_instances SET current_participants = v_new WHERE id = r.id;
      INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data)
      VALUES (p_run, p_sale, 'group_course_instances', r.id, 'instance_count',
              jsonb_build_object('reason', p_reason, 'before', r.current_participants, 'after', v_new));
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION bc_transfer_20261003.recount_instances(text,text,uuid[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bc_transfer_20261003.recount_instances(text,text,uuid[],text) TO service_role;

CREATE OR REPLACE FUNCTION bc_transfer_20261003.rollback_sale(p_run text, p_sale text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cw record; fk record; conflicts jsonb := '[]'; n bigint; pre jsonb; aft text; fields jsonb; ent text; v_cust uuid; v_inst uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bc_transfer_20261003:' || p_sale));
  IF NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.sale_status WHERE sale_code = p_sale AND status = 'applied' AND run_id = p_run) THEN
    RETURN jsonb_build_object('sale', p_sale, 'status', 'not_applied');
  END IF;
  FOR cw IN SELECT * FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity <> 'participant_alias' LOOP
    IF bc_transfer_20261003.row_hash(cw.entity, cw.target_id) IS DISTINCT FROM cw.after_hash THEN
      conflicts := conflicts || jsonb_build_object('entity', cw.entity, 'id', cw.target_id, 'reason', 'changed_after_import');
    END IF;
  END LOOP;
  FOR fk IN SELECT c.conrelid::regclass::text src, a.attname col, c.confrelid::regclass::text dst
              FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
               AND c.confrelid::regclass::text IN ('tickets','customers','customer_participants','ticket_items','private_appointments') LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = ('public.' || quote_ident(fk.src))::regclass AND attname = 'id' AND NOT attisdropped) THEN
      EXECUTE format($q$SELECT count(*) FROM public.%I r WHERE r.%I IN (SELECT target_id FROM bc_transfer_20261003.crosswalk
                         WHERE sale_code = %L AND entity = %L AND action = 'insert')
                       AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.crosswalk x WHERE x.sale_code = %L AND x.entity = %L AND x.target_id = r.id)$q$,
                     fk.src, fk.col, p_sale, fk.dst, p_sale, fk.src) INTO n;
    ELSE
      EXECUTE format($q$SELECT count(*) FROM public.%I r WHERE r.%I IN (SELECT target_id FROM bc_transfer_20261003.crosswalk
                         WHERE sale_code = %L AND entity = %L AND action = 'insert')$q$, fk.src, fk.col, p_sale, fk.dst) INTO n;
    END IF;
    IF n > 0 THEN conflicts := conflicts || jsonb_build_object('entity', fk.src, 'references', fk.dst, 'rows', n, 'reason', 'foreign_reference'); END IF;
  END LOOP;
  SELECT target_id INTO v_cust FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity = 'customers' AND action = 'reuse';
  IF jsonb_array_length(conflicts) > 0 THEN
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, kind, data) VALUES (p_run, p_sale, 'rollback_refused', conflicts);
    RETURN jsonb_build_object('sale', p_sale, 'status', 'refused', 'conflicts', conflicts);
  END IF;
  SELECT array_agg(DISTINCT e.instance_id) INTO v_inst FROM public.group_course_enrollments e
    JOIN bc_transfer_20261003.crosswalk c ON c.target_id = e.id
   WHERE c.sale_code = p_sale AND c.entity = 'group_course_enrollments' AND c.action = 'insert';
  FOREACH ent IN ARRAY ARRAY['group_course_enrollments','private_appointment_participants','ticket_items','private_appointments',
                             'ticket_history','tickets','customer_participants','customers'] LOOP
    EXECUTE format($q$DELETE FROM public.%I t USING bc_transfer_20261003.crosswalk c
                     WHERE c.sale_code = %L AND c.entity = %L AND c.action = 'insert' AND c.target_id = t.id$q$, ent, p_sale, ent);
  END LOOP;
  IF v_inst IS NOT NULL THEN
    PERFORM bc_transfer_20261003.recount_instances(p_run, p_sale, v_inst, 'rollback_sale');
  END IF;
  IF v_cust IS NOT NULL THEN
    SELECT data->'row', data->'filled_fields' INTO pre, fields FROM bc_transfer_20261003.ledger
     WHERE sale_code = p_sale AND entity = 'customers' AND kind = 'preimage' ORDER BY id DESC LIMIT 1;
    UPDATE public.customers SET
      phone = CASE WHEN fields ? 'phone' THEN pre->>'phone' ELSE phone END,
      first_name = CASE WHEN fields ? 'first_name' THEN pre->>'first_name' ELSE first_name END,
      street = CASE WHEN fields ? 'street' THEN pre->>'street' ELSE street END,
      house_number = CASE WHEN fields ? 'house_number' THEN pre->>'house_number' ELSE house_number END,
      zip = CASE WHEN fields ? 'zip' THEN pre->>'zip' ELSE zip END,
      city = CASE WHEN fields ? 'city' THEN pre->>'city' ELSE city END
    WHERE id = v_cust;
    IF md5(to_jsonb((SELECT cu FROM public.customers cu WHERE cu.id = v_cust))::text) IS DISTINCT FROM md5(pre::text) THEN
      RAISE EXCEPTION 'reused customer % could not be restored exactly', v_cust;
    END IF;
  END IF;
  DELETE FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale;
  UPDATE bc_transfer_20261003.sale_status SET status = 'rolled_back', rolled_back_at = now() WHERE sale_code = p_sale;
  INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, kind, data) VALUES (p_run, p_sale, 'rolled_back', NULL);
  RETURN jsonb_build_object('sale', p_sale, 'status', 'rolled_back');
END $function$;