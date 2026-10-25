-- Rollback for supabase/pending/pa_tariff_l1.sql (B07 L1), consumer-first. Executable (psql -1 -f).
-- 0. BEFORE running: redeploy the previous private-appointments function and publish the previous client
--    (they never send acknowledged_quote_digest / p_ack).
-- 1. Export evidence: \copy public.private_appointment_pricing TO 'pricing_l1.csv' CSV HEADER
--    (before/after values of requoted lessons are in PRIVATE_APPOINTMENT_CHANGED events, key "pricing").
-- 2. This file restores the pre-L1 bodies (same signatures), then drops the L1-only objects:
--    pa_move_appointment/pa_period_update = production baseline bodies; pa_apply_slot + guard + participant
--    trigger = product_private_tariff_rules.sql (B07-P); pa_edit_booking = pa_edit_booking.sql (B03a).
-- Lines already requoted by L1 keep their acknowledged prices (no automatic re-repricing on rollback).
-- Do NOT run while B07a (b07a_office_multi_create.sql) is installed: roll back B07a first.
DO $chk$ BEGIN
  IF to_regprocedure('public.b07a_office_multi(jsonb,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'B07a is installed; roll back b07a_office_multi_create first';
  END IF;
END $chk$;

CREATE OR REPLACE FUNCTION public.pa_move_appointment(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; j jsonb; v_conf jsonb := '[]'::jsonb; c record; r jsonb;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = a.ticket_id FOR UPDATE;
  IF a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointment_id'); END IF;
  j := public.pa_is_protected(p_id);
  IF (j->>'protected')::boolean THEN
    RETURN jsonb_build_object('error','protected','excluded', jsonb_build_array(jsonb_build_object('id',p_id,'reasons',j->'reasons')));
  END IF;
  IF p_date < public.pa_business_today() OR p_end <= p_start OR p_instr IS NULL THEN
    RETURN jsonb_build_object('error','invalid','field','slot');
  END IF;
  PERFORM public.pa_lock_slots(jsonb_build_array(jsonb_build_object('instructor_id', p_instr, 'date', p_date)));
  FOR c IN SELECT * FROM public.pa_slot_conflicts(p_instr, p_date, p_start, p_end, p_id) LOOP
    v_conf := v_conf || jsonb_build_object('date',p_date,'kind',c.kind,'ref_id',c.ref_id);
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  r := public.pa_apply_slot(p_id, p_date, p_start, p_end, p_instr);
  PERFORM public.pa_recalc_ticket_total(a.ticket_id);
  PERFORM public.pa_emit_change(a.ticket_id, ARRAY[p_id], 'moved', p_actor,
    jsonb_build_object('from', jsonb_build_object('date',a.date,'time_start',a.time_start,'time_end',a.time_end,'instructor_id',a.instructor_id),
                       'to', jsonb_build_object('date',p_date,'time_start',p_start,'time_end',p_end,'instructor_id',p_instr)));
  RETURN jsonb_build_object('ok', true, 'price', r->'price', 'confirmation_reset', r->'confirmation_reset',
    'appointment', (SELECT to_jsonb(x) - 'submission_key' FROM public.private_appointments x WHERE id = p_id));
END $$;

CREATE OR REPLACE FUNCTION public.pa_period_update(p_group uuid, p_changes jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; j jsonb; c record; v_ticket uuid;
  v_excluded jsonb := '[]'::jsonb; v_conf jsonb := '[]'::jsonb; v_todo uuid[] := ARRAY[]::uuid[];
  v_targets jsonb := '[]'::jsonb; s time; t time; ins uuid;
BEGIN
  IF p_group IS NULL OR p_changes IS NULL OR NOT (p_changes ?| ARRAY['time_start','time_end','instructor_id']) THEN
    RETURN jsonb_build_object('error','invalid','field','changes');
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY date, time_start, id FOR UPDATE LOOP
    v_ticket := a.ticket_id;
    j := public.pa_is_protected(a.id);
    IF (j->>'protected')::boolean THEN
      v_excluded := v_excluded || jsonb_build_object('id',a.id,'reasons',j->'reasons'); CONTINUE;
    END IF;
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    IF t <= s OR ins IS NULL THEN RETURN jsonb_build_object('error','invalid','field','changes'); END IF;
    v_targets := v_targets || jsonb_build_object('instructor_id', ins, 'date', a.date);
    v_todo := v_todo || a.id;
  END LOOP;
  IF v_ticket IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  PERFORM 1 FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  PERFORM public.pa_lock_slots(v_targets);
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) ORDER BY date, time_start, id LOOP
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, a.date, s, t, a.id) LOOP
      v_conf := v_conf || jsonb_build_object('appointment_id',a.id,'date',a.date,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) LOOP
    PERFORM public.pa_apply_slot(a.id, a.date,
      coalesce((p_changes->>'time_start')::time, a.time_start),
      coalesce((p_changes->>'time_end')::time, a.time_end),
      coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id));
  END LOOP;
  IF cardinality(v_todo) > 0 THEN
    PERFORM public.pa_recalc_ticket_total(v_ticket);
    PERFORM public.pa_emit_change(v_ticket, v_todo, 'period_updated', p_actor,
      jsonb_build_object('changes', p_changes, 'excluded', v_excluded));
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated_ids', to_jsonb(v_todo), 'excluded', v_excluded);
END $$;

CREATE OR REPLACE FUNCTION public.pa_tariff_transition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_appt uuid;
BEGIN
  IF TG_TABLE_NAME = 'private_appointments' THEN
    IF (NEW.date, NEW.time_start, NEW.time_end, NEW.price) IS DISTINCT FROM (OLD.date, OLD.time_start, OLD.time_end, OLD.price)
       AND EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'ticket_items' THEN
    IF OLD.appointment_id IS NOT NULL
       AND (NEW.unit_price, NEW.quantity, NEW.discount_percent, NEW.discount_reason) IS DISTINCT FROM
           (OLD.unit_price, OLD.quantity, OLD.discount_percent, OLD.discount_reason)
       AND EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = OLD.appointment_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    RETURN NEW;
  ELSE -- private_appointment_participants: participant changes alter persons/eligibility
    v_appt := CASE WHEN TG_OP = 'DELETE' THEN OLD.appointment_id ELSE NEW.appointment_id END;
    IF EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = v_appt)
       AND EXISTS (SELECT 1 FROM public.private_appointments WHERE id = v_appt) THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pa_tariff_transition_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pa_tariff_transition_parts ON public.private_appointment_participants;
CREATE TRIGGER trg_pa_tariff_transition_parts BEFORE INSERT OR DELETE ON public.private_appointment_participants
  FOR EACH ROW EXECUTE FUNCTION public.pa_tariff_transition_guard();

CREATE OR REPLACE FUNCTION public.pa_apply_slot(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; v_changed boolean; v_persons int; v_price numeric; v_conf text; v_tariffed boolean;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id;
  v_changed := a.date IS DISTINCT FROM p_date OR a.time_start IS DISTINCT FROM p_start
            OR a.time_end IS DISTINCT FROM p_end OR a.instructor_id IS DISTINCT FROM p_instr;
  v_tariffed := EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = p_id);
  IF v_tariffed THEN
    IF a.date IS DISTINCT FROM p_date OR a.time_start IS DISTINCT FROM p_start OR a.time_end IS DISTINCT FROM p_end THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    v_price := a.price;
  ELSE
    SELECT greatest(count(*),1) INTO v_persons FROM public.private_appointment_participants WHERE appointment_id = p_id;
    v_price := public.pa_price(p_date, p_start, p_end, v_persons);
  END IF;
  v_conf := CASE WHEN v_changed THEN 'pending' ELSE a.instructor_confirmation END;
  UPDATE public.private_appointments
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr, price = v_price,
         instructor_confirmation = v_conf,
         confirmed_at = CASE WHEN v_changed THEN NULL ELSE confirmed_at END,
         confirmed_by = CASE WHEN v_changed THEN NULL ELSE confirmed_by END
   WHERE id = p_id;
  UPDATE public.ticket_items
     SET date = p_date, time_start = p_start, time_end = p_end, instructor_id = p_instr,
         instructor_confirmation = v_conf, unit_price = v_price, quantity = 1,
         instructor_confirmed_at = CASE WHEN v_changed THEN NULL ELSE instructor_confirmed_at END,
         confirmation_reset_at = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN now() ELSE confirmation_reset_at END,
         confirmation_reset_reason = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN 'private_appointment_changed' ELSE confirmation_reset_reason END
   WHERE appointment_id = p_id;
  RETURN jsonb_build_object('changed', v_changed, 'price', v_price,
    'confirmation_reset', v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.pa_edit_booking(p jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mode text := coalesce(p->>'mode', 'quote');
  v_ticket uuid; tk record; a record; ti_original record; e jsonb; j jsonb; v_original jsonb;
  v_cur uuid[]; v_new uuid[]; v_exp uuid[];
  v_plan jsonb := '[]'::jsonb; v_seen uuid[] := ARRAY[]::uuid[];
  v_part_changed boolean; v_mp_changed boolean; v_price numeric;
  v_notes_changed boolean := false; v_cust_notes_changed boolean := false;
  v_new_total numeric; v_any boolean := false; v_reprice boolean := false; v_ack_ok boolean := true;
  v_ids uuid[] := ARRAY[]::uuid[]; x jsonb; v_quote jsonb;
BEGIN
  IF v_mode NOT IN ('quote', 'apply') THEN RETURN jsonb_build_object('error','invalid','field','mode'); END IF;
  IF p_actor IS NULL OR NOT (public.has_role(p_actor,'office') OR public.has_role(p_actor,'admin') OR public.has_role(p_actor,'super_admin')) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  BEGIN v_ticket := (p->>'ticket_id')::uuid; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','ticket_id'); END;
  SELECT * INTO tk FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.private_appointments WHERE ticket_id = v_ticket) THEN
    RETURN jsonb_build_object('error','invalid','field','ticket_id');
  END IF;
  PERFORM 1 FROM public.private_appointments WHERE ticket_id = v_ticket ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.ticket_items WHERE ticket_id = v_ticket ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.private_appointment_participants WHERE appointment_id IN (SELECT id FROM public.private_appointments WHERE ticket_id=v_ticket) ORDER BY id FOR UPDATE;
  IF NOT (p ? 'expected_total') THEN RETURN jsonb_build_object('error','invalid','field','expected_total'); END IF;
  IF p ? 'internal_notes' OR p ? 'instructor_notes' THEN RETURN jsonb_build_object('error','invalid','field','notes'); END IF;
  IF p ? 'customer_notes' AND NOT (p ? 'expected_customer_notes') THEN RETURN jsonb_build_object('error','invalid','field','expected_customer_notes'); END IF;
  IF p ? 'customer_notes' AND (p->>'expected_customer_notes') IS DISTINCT FROM tk.notes THEN RETURN jsonb_build_object('error','conflict'); END IF;
  IF p ? 'expected_total' AND (p->>'expected_total')::numeric IS DISTINCT FROM tk.total_amount THEN
    RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('kind','stale','ref_id',v_ticket)));
  END IF;

  -- Phase 1: validate + plan (no writes)
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p->'appointments','[]'::jsonb)) LOOP
    BEGIN
      SELECT * INTO a FROM public.private_appointments WHERE id = (e->>'appointment_id')::uuid AND ticket_id = v_ticket;
    EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
    IF a.id = ANY(v_seen) OR a.status = 'cancelled' THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END IF;
    v_seen := v_seen || a.id;
    IF NOT (e ? 'expected_participant_ids' AND e ? 'expected_price' AND e ? 'expected') THEN
      RETURN jsonb_build_object('error','invalid','field','expected');
    END IF;
    -- One canonical billing line; fail closed on corrupt/ambiguous mirrors rather than flattening.
    IF (SELECT count(*) FROM public.ticket_items WHERE appointment_id=a.id AND ticket_id=v_ticket) <> 1 THEN
      RETURN jsonb_build_object('error','invalid','field','appointment_line');
    END IF;
    SELECT * INTO ti_original FROM public.ticket_items WHERE appointment_id=a.id AND ticket_id=v_ticket;
    v_original := jsonb_build_object('date',a.date,'time_start',a.time_start::text,'time_end',a.time_end::text,
      'instructor_id',a.instructor_id,'meeting_point',a.meeting_point,'status',a.status,
      'line',jsonb_build_object('id',ti_original.id,'quantity',ti_original.quantity,'unit_price',ti_original.unit_price,
        'line_total',ti_original.line_total,'discount_percent',ti_original.discount_percent,'discount_reason',ti_original.discount_reason,
        'internal_notes',ti_original.internal_notes,'instructor_notes',ti_original.instructor_notes));
    IF e->'expected' IS DISTINCT FROM v_original THEN
      RETURN jsonb_build_object('error','conflict','conflicts',jsonb_build_array(jsonb_build_object('kind','stale','ref_id',a.id)));
    END IF;
    v_cur := ARRAY(SELECT participant_id FROM public.private_appointment_participants WHERE appointment_id = a.id ORDER BY 1);
    IF e ? 'expected_participant_ids' THEN
      v_exp := ARRAY(SELECT DISTINCT x2::uuid FROM jsonb_array_elements_text(e->'expected_participant_ids') x2 ORDER BY 1);
      IF v_exp IS DISTINCT FROM v_cur THEN
        RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('date',a.date,'kind','stale','ref_id',a.id)));
      END IF;
    END IF;
    IF e ? 'expected_price' AND (e->>'expected_price')::numeric IS DISTINCT FROM a.price THEN
      RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('date',a.date,'kind','stale','ref_id',a.id)));
    END IF;
    v_new := v_cur;
    IF e ? 'participant_ids' THEN
      v_new := ARRAY(SELECT DISTINCT x2::uuid FROM jsonb_array_elements_text(e->'participant_ids') x2 ORDER BY 1);
      IF cardinality(v_new) < 1 OR cardinality(v_new) > 4
         OR EXISTS (SELECT 1 FROM unnest(v_new) n WHERE NOT EXISTS (
              SELECT 1 FROM public.customer_participants cp WHERE cp.id = n AND cp.customer_id = tk.customer_id)) THEN
        RETURN jsonb_build_object('error','invalid','field','participants');
      END IF;
    END IF;
    v_part_changed := v_new IS DISTINCT FROM v_cur;
    v_mp_changed := e ? 'meeting_point' AND (e->>'meeting_point') IS DISTINCT FROM a.meeting_point;
    IF v_part_changed OR v_mp_changed THEN
      j := public.pa_is_protected(a.id);
      IF (j->>'protected')::boolean THEN
        RETURN jsonb_build_object('error','protected','excluded', jsonb_build_array(jsonb_build_object('id',a.id,'reasons',j->'reasons')));
      END IF;
    END IF;
    v_price := CASE WHEN v_part_changed THEN public.pa_price(a.date, a.time_start, a.time_end, cardinality(v_new)) ELSE a.price END;
    IF v_part_changed THEN
      v_reprice := true;
      IF NOT (e ? 'acknowledged_price') OR (e->>'acknowledged_price')::numeric IS DISTINCT FROM v_price THEN v_ack_ok := false; END IF;
    END IF;
    IF v_part_changed OR v_mp_changed THEN v_any := true; END IF;
    j := jsonb_build_object('internal_notes_changed', e ? 'internal_notes' AND ti_original.internal_notes IS DISTINCT FROM nullif(e->>'internal_notes',''),
      'instructor_notes_changed', e ? 'instructor_notes' AND ti_original.instructor_notes IS DISTINCT FROM nullif(e->>'instructor_notes',''),
      'internal_notes', CASE WHEN e ? 'internal_notes' THEN nullif(e->>'internal_notes','') ELSE ti_original.internal_notes END,
      'instructor_notes', CASE WHEN e ? 'instructor_notes' THEN nullif(e->>'instructor_notes','') ELSE ti_original.instructor_notes END);
    IF (j->>'internal_notes_changed')::boolean OR (j->>'instructor_notes_changed')::boolean THEN v_notes_changed := true; END IF;
    v_plan := v_plan || (j || jsonb_build_object('appointment_id', a.id, 'date', a.date,
      'from_participant_ids', to_jsonb(v_cur), 'participant_ids', to_jsonb(v_new),
      'old_price', a.price, 'new_price', v_price, 'participants_changed', v_part_changed,
      'meeting_point_changed', v_mp_changed, 'meeting_point', CASE WHEN v_mp_changed THEN e->>'meeting_point' ELSE a.meeting_point END));
  END LOOP;

  IF p ? 'customer_notes' AND tk.notes IS DISTINCT FROM nullif(p->>'customer_notes','') THEN v_cust_notes_changed := true; END IF;

  -- Apply only the net delta of explicitly changed lessons to the authoritative stored total.
  -- This preserves any unrelated historical discrepancy instead of repairing the whole ticket.
  SELECT tk.total_amount + coalesce(sum(
      (pl.v->>'new_price')::numeric * ti.quantity * (1 - coalesce(ti.discount_percent,0)/100)
      - coalesce(ti.line_total, ti.unit_price * coalesce(ti.quantity,1) * (1 - coalesce(ti.discount_percent,0)/100))),0)
    INTO v_new_total FROM public.ticket_items ti
    JOIN LATERAL (SELECT v FROM jsonb_array_elements(v_plan) v
      WHERE (v->>'appointment_id')::uuid=ti.appointment_id AND (v->>'participants_changed')::boolean) pl ON true
    WHERE ti.ticket_id=v_ticket AND coalesce(ti.status,'') <> 'cancelled';

  v_quote := jsonb_build_object('appointments', v_plan, 'old_total', tk.total_amount,
    'new_total', CASE WHEN v_reprice THEN v_new_total ELSE tk.total_amount END,
    'changed', v_any OR v_notes_changed OR v_cust_notes_changed);
  IF v_mode = 'quote' THEN RETURN jsonb_build_object('ok', true, 'quote', v_quote); END IF;
  IF NOT (v_any OR v_notes_changed OR v_cust_notes_changed) THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'quote', v_quote);
  END IF;
  IF v_reprice AND (NOT v_ack_ok OR (p->>'acknowledged_total')::numeric IS DISTINCT FROM v_new_total) THEN
    RETURN jsonb_build_object('error','quote_changed','quote', v_quote);
  END IF;

  -- Phase 2: writes (all validated)
  FOR x IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (x->>'participants_changed')::boolean THEN
      v_new := ARRAY(SELECT y::uuid FROM jsonb_array_elements_text(x->'participant_ids') y);
      DELETE FROM public.private_appointment_participants
       WHERE appointment_id = (x->>'appointment_id')::uuid AND participant_id <> ALL(v_new);
      INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
        SELECT (x->>'appointment_id')::uuid, n FROM unnest(v_new) n
         WHERE NOT EXISTS (SELECT 1 FROM public.private_appointment_participants pp
                            WHERE pp.appointment_id = (x->>'appointment_id')::uuid AND pp.participant_id = n);
      UPDATE public.private_appointments SET price = (x->>'new_price')::numeric WHERE id = (x->>'appointment_id')::uuid;
      UPDATE public.ticket_items SET unit_price = (x->>'new_price')::numeric, group_participant_count = cardinality(v_new)
       WHERE appointment_id = (x->>'appointment_id')::uuid;
    END IF;
    IF (x->>'meeting_point_changed')::boolean THEN
      UPDATE public.private_appointments SET meeting_point = x->>'meeting_point' WHERE id = (x->>'appointment_id')::uuid;
      UPDATE public.ticket_items SET meeting_point = x->>'meeting_point' WHERE appointment_id = (x->>'appointment_id')::uuid;
    END IF;
    IF (x->>'internal_notes_changed')::boolean OR (x->>'instructor_notes_changed')::boolean THEN
      UPDATE public.ticket_items SET internal_notes=x->>'internal_notes', instructor_notes=x->>'instructor_notes'
        WHERE appointment_id=(x->>'appointment_id')::uuid AND ticket_id=v_ticket;
    END IF;
    IF (x->>'participants_changed')::boolean OR (x->>'meeting_point_changed')::boolean
       OR (x->>'internal_notes_changed')::boolean OR (x->>'instructor_notes_changed')::boolean THEN
      v_ids := v_ids || (x->>'appointment_id')::uuid;
    END IF;
  END LOOP;
  IF v_cust_notes_changed THEN UPDATE public.tickets SET notes = nullif(p->>'customer_notes','') WHERE id = v_ticket; END IF;
  IF v_reprice OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_plan) v WHERE (v->>'participants_changed')::boolean) THEN
    UPDATE public.tickets SET total_amount=v_new_total WHERE id=v_ticket;
    UPDATE public.tickets SET participant_count = (
      SELECT count(DISTINCT pp.participant_id) FROM public.private_appointment_participants pp
        JOIN public.private_appointments pa ON pa.id = pp.appointment_id
       WHERE pa.ticket_id = v_ticket AND pa.status <> 'cancelled') WHERE id = v_ticket;
  END IF;
  PERFORM public.pa_emit_change(v_ticket, v_ids, 'edited', p_actor,
    jsonb_build_object('appointments', v_plan, 'notes_changed', v_notes_changed OR v_cust_notes_changed,
                       'old_total', tk.total_amount, 'new_total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket)));
  RETURN jsonb_build_object('ok', true, 'changed', true, 'quote', v_quote,
    'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket));
END $$;

DROP FUNCTION IF EXISTS public.pa_move_appointment(uuid, date, time, time, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.pa_period_update(uuid, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_requote(jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_write_pricing(jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_line_net(uuid);
DROP FUNCTION IF EXISTS public.pa_lock_days(uuid[], date[]);
REVOKE ALL ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_edit_booking(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_edit_booking(jsonb, uuid) TO service_role;
