-- R1 (S2 unassigned edit): pa_move_appointment accepts p_instr NULL only with explicit
-- p_ack.assign_later = true on a lesson that is already unassigned (NULL -> NULL time/date move).
-- Everything else (protected/invoiced refusal, stale check, L1 requote + digest ack, lock order) unchanged.
-- Rollback: re-run the pa_move_appointment definition from 0025_pa_tariff_l1.sql.
CREATE OR REPLACE FUNCTION public.pa_move_appointment(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid, p_ack jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a0 record; a record; j jsonb; v_conf jsonb := '[]'::jsonb; c record; r jsonb; v_pids uuid[]; v_pids2 uuid[];
  v_tariffed boolean; v_q jsonb; v_old numeric; v_new numeric; v_total numeric; v_pricing jsonb;
BEGIN
  SELECT * INTO a0 FROM public.private_appointments WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  v_pids := ARRAY(SELECT participant_id FROM public.private_appointment_participants WHERE appointment_id = p_id ORDER BY 1);
  -- Lock order: slot < day < ticket < appointment (same as create/edit).
  IF p_instr IS NOT NULL AND p_date IS NOT NULL THEN
    PERFORM public.pa_lock_slots(jsonb_build_array(jsonb_build_object('instructor_id', p_instr, 'date', p_date)));
  END IF;
  PERFORM public.pa_lock_days(v_pids, ARRAY[a0.date, p_date]);
  PERFORM 1 FROM public.tickets WHERE id = a0.ticket_id FOR UPDATE;
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id FOR UPDATE;
  v_pids2 := ARRAY(SELECT participant_id FROM public.private_appointment_participants WHERE appointment_id = p_id ORDER BY 1);
  IF a.ticket_id IS DISTINCT FROM a0.ticket_id OR a.date IS DISTINCT FROM a0.date OR v_pids2 IS DISTINCT FROM v_pids THEN
    RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('kind','stale','ref_id',p_id)));
  END IF;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  j := public.pa_is_protected(p_id);
  IF (j->>'protected')::boolean THEN
    RETURN jsonb_build_object('error','protected','excluded', jsonb_build_array(jsonb_build_object('id',p_id,'reasons',j->'reasons')));
  END IF;
  -- R1: NULL teacher only as explicit "Später zuweisen" intent on a lesson that is ALREADY unassigned.
  -- A merely missing teacher (no intent) or removing an assigned teacher stays invalid.
  IF p_date < public.pa_business_today() OR p_end <= p_start
     OR (p_instr IS NULL AND NOT (coalesce((p_ack->>'assign_later')::boolean, false) AND a.instructor_id IS NULL)) THEN
    RETURN jsonb_build_object('error','invalid','field','slot');
  END IF;
  FOR c IN SELECT * FROM public.pa_slot_conflicts(p_instr, p_date, p_start, p_end, p_id) WHERE p_instr IS NOT NULL LOOP
    v_conf := v_conf || jsonb_build_object('date',p_date,'kind',c.kind,'ref_id',c.ref_id);
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;

  v_tariffed := EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = p_id);
  IF v_tariffed AND (p_date, p_start, p_end) IS DISTINCT FROM (a.date, a.time_start, a.time_end) THEN
    v_q := public.pa_l1_requote(jsonb_build_array(jsonb_build_object('appointment_id', p_id, 'date', p_date,
      'time_start', p_start, 'time_end', p_end, 'participant_ids', to_jsonb(v_pids))));
    IF v_q ? 'error' THEN RETURN v_q; END IF;
    SELECT total_amount INTO v_total FROM public.tickets WHERE id = a.ticket_id;
    v_q := v_q || jsonb_build_object('old_total', v_total,
      'new_total', v_total + (v_q->'items'->0->>'net')::numeric - (v_q->'items'->0->>'old_net')::numeric);
    IF (v_q->>'price_changed')::boolean AND (p_ack->>'quote_digest') IS DISTINCT FROM (v_q->>'quote_digest') THEN
      RETURN jsonb_build_object('error','quote_changed','quote', v_q);
    END IF;
    v_old := public.pa_l1_line_net(p_id);
    PERFORM public.pa_l1_write_pricing(v_q->'items'->0);
    v_pricing := jsonb_build_object('from', jsonb_build_object('gross', v_q->'items'->0->'old_gross', 'discount_percent', v_q->'items'->0->'old_discount_percent',
        'net', v_q->'items'->0->'old_net', 'tariff_revision', v_q->'items'->0->'old_tariff_revision', 'discount_rule_revision', v_q->'items'->0->'old_discount_rule_revision'),
      'to', jsonb_build_object('gross', v_q->'items'->0->'gross', 'discount_percent', v_q->'items'->0->'discount_percent', 'discount_source', v_q->'items'->0->'discount_source',
        'net', v_q->'items'->0->'net', 'tariff_revision', v_q->'items'->0->'tariff_revision', 'discount_rule_revision', v_q->'items'->0->'discount_rule_revision'),
      'acknowledged', (v_q->>'price_changed')::boolean);
  END IF;
  r := public.pa_apply_slot(p_id, p_date, p_start, p_end, p_instr);
  IF v_tariffed THEN
    -- Price-preserving for teacher-only moves; otherwise only this line's net delta.
    IF v_old IS NOT NULL THEN
      v_new := public.pa_l1_line_net(p_id);
      UPDATE public.tickets SET total_amount = total_amount + (v_new - v_old) WHERE id = a.ticket_id;
    END IF;
  ELSE
    PERFORM public.pa_recalc_ticket_total(a.ticket_id);
  END IF;
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_id], 'moved', p_actor,
    jsonb_build_object('from', jsonb_build_object('date',a.date,'time_start',a.time_start,'time_end',a.time_end,'instructor_id',a.instructor_id),
                       'to', jsonb_build_object('date',p_date,'time_start',p_start,'time_end',p_end,'instructor_id',p_instr))
    || CASE WHEN v_pricing IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pricing', v_pricing,
         'old_total', v_q->'old_total', 'new_total', (SELECT total_amount FROM public.tickets WHERE id = a.ticket_id)) END);
  RETURN jsonb_build_object('ok', true, 'price', r->'price', 'confirmation_reset', r->'confirmation_reset',
    'appointment', (SELECT to_jsonb(x) - 'submission_key' FROM public.private_appointments x WHERE id = p_id));
END $$;
