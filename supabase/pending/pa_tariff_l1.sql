-- B07 L1 (PENDING, NOT INSTALLED): move / period_update / B03a edit of product-tariff-priced private lessons.
-- Requires, in this order: production baseline, 0001 (pa_assign_later), pa_edit_booking.sql (B03a),
-- product_private_tariff_rules.sql (B07-P/P2/P3). Install in the SAME release as the B07 client.
--
-- Rules (decided, Ivo 2026-10-25; no new constants here - all prices are product data):
-- * A tariff-priced appointment (private_appointment_pricing row) is requoted ONLY when its date/time
--   or its participant set changes. Teacher-only, notes, meeting point, status, confirmation and an
--   unchanged save never reprice and never touch the ticket total.
-- * Requote = the same resolver as create (pa_price_request, office channel) with the appointment's
--   stored discount intent: stored manual override (incl. explicit 0) is re-applied unchanged and
--   REPLACES the automatic discount; otherwise automatic with the day context of the same stable
--   participant ids (other valid private bookings count, interval union, the changed lessons' old
--   state excluded). Other lessons/bookings are context only and never repriced.
-- * A requote that changes gross or discount needs the client to acknowledge the exact server quote
--   (quote_digest) - otherwise quote_changed and nothing is written. Same-price moves need no ack.
-- * Ticket total: only the net delta of the changed lines is applied (no whole-ticket repair).
-- * Concurrency: every path takes, before any row lock, the teacher slot locks (move/period) and the
--   SAME per (participant, date) advisory day locks as pa_create_booking, then ticket, then
--   appointment rows (global order: slot < day < ticket < appointment). Legacy (non-tariff)
--   appointments get the locks too; their pricing (pa_price) is unchanged.
-- * Protected appointments (past/completed/invoiced via pa_is_protected) stay refused.
-- * The YT001 transition guard stays installed; it now accepts a price/time/participant write on a
--   tariff-priced appointment only when it equals the server-written pricing row (service_role only),
--   so raw table writes still cannot reprice.

-- Day locks: key and order identical to pa_create_booking (hashtext('pa_day:'||participant||':'||date)).
CREATE OR REPLACE FUNCTION public.pa_lock_days(p_participants uuid[], p_dates date[]) RETURNS void
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT kp, kd FROM unnest(coalesce(p_participants, '{}'::uuid[])) kp, unnest(coalesce(p_dates, '{}'::date[])) kd
            WHERE kp IS NOT NULL AND kd IS NOT NULL ORDER BY 1, 2 LOOP
    PERFORM pg_advisory_xact_lock(hashtext('pa_day:' || r.kp || ':' || r.kd));
  END LOOP;
END $$;

-- Requote of tariff-priced appointments in their TARGET state.
-- p_targets: [{appointment_id, date, time_start, time_end, participant_ids:[uuid]}]
-- Returns {ok, items[], day_context_digest, price_changed, quote_digest} or an error object.
CREATE OR REPLACE FUNCTION public.pa_l1_requote(p_targets jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE i int; k int; e jsonb; pr record; v_ids uuid[]; v_pids uuid[]; v_dates date[]; v_ctx jsonb; v_other jsonb;
  v_intent jsonb; v_res jsonb; v_it jsonb; v_items jsonb := '[]'::jsonb; v_old_net numeric; v_changed boolean := false;
  v_parts jsonb; v_item jsonb;
BEGIN
  IF jsonb_typeof(p_targets) <> 'array' OR jsonb_array_length(p_targets) = 0 THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END IF;
  v_ids := ARRAY(SELECT (x->>'appointment_id')::uuid FROM jsonb_array_elements(p_targets) x);
  v_pids := ARRAY(SELECT DISTINCT y::uuid FROM jsonb_array_elements(p_targets) x, jsonb_array_elements_text(x->'participant_ids') y ORDER BY 1);
  v_dates := ARRAY(SELECT DISTINCT (x->>'date')::date FROM jsonb_array_elements(p_targets) x ORDER BY 1);
  v_ctx := public.pa_private_day_context(v_pids, v_dates, v_ids);
  FOR i IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
    e := p_targets->i;
    SELECT * INTO pr FROM public.private_appointment_pricing WHERE appointment_id = (e->>'appointment_id')::uuid;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid','field','appointments','index',i); END IF;
    v_parts := (SELECT coalesce(jsonb_agg(y ORDER BY y), '[]'::jsonb) FROM (SELECT DISTINCT lower(y) y FROM jsonb_array_elements_text(e->'participant_ids') y) z);
    IF jsonb_array_length(v_parts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','participants','index',i); END IF;
    -- The other changed lessons of this request contribute their NEW minutes, never a price.
    v_other := '[]'::jsonb;
    FOR k IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
      CONTINUE WHEN k = i;
      v_other := v_other || jsonb_build_array(jsonb_build_object('date', p_targets->k->'date', 'time_start', p_targets->k->'time_start',
        'time_end', p_targets->k->'time_end', 'price', 0,
        'participants', (SELECT coalesce(jsonb_agg(DISTINCT lower(y)), '[]'::jsonb) FROM jsonb_array_elements_text(p_targets->k->'participant_ids') y)));
    END LOOP;
    v_intent := CASE WHEN pr.discount_source = 'manual'
      THEN jsonb_build_object('mode','manual','percent',pr.discount_percent,'reason',pr.discount_reason)
      ELSE jsonb_build_object('mode','automatic') END;
    v_res := public.pa_price_request(pr.product_id,
      jsonb_build_array(jsonb_build_object('date', e->'date', 'time_start', e->'time_start', 'time_end', e->'time_end', 'participants', v_parts)),
      v_intent, true, coalesce(v_ctx->'slots', '[]'::jsonb) || v_other);
    IF v_res ? 'error' THEN RETURN v_res || jsonb_build_object('appointment_id', e->'appointment_id'); END IF;
    v_it := v_res->'items'->0;
    SELECT coalesce(line_total, unit_price * coalesce(quantity,1) * (1 - coalesce(discount_percent,0)/100)) INTO v_old_net
      FROM public.ticket_items WHERE appointment_id = pr.appointment_id;
    v_item := jsonb_build_object('appointment_id', pr.appointment_id, 'product_id', pr.product_id,
      'date', e->>'date', 'time_start', (e->>'time_start')::time::text, 'time_end', (e->>'time_end')::time::text, 'participant_ids', v_parts,
      'gross', (v_it->>'price')::numeric, 'discount_source', v_it->>'discount_source', 'discount_percent', (v_it->>'discount_percent')::numeric,
      'discount_reason', v_it->>'discount_reason', 'discount_amount', (v_it->>'discount_amount')::numeric, 'net', round((v_it->>'net')::numeric, 2),
      'persons', (v_it->>'persons')::int, 'eligible', (v_it->>'eligible')::int,
      'tariff_revision', (v_res->>'revision')::int, 'discount_rule_revision', (v_res->>'discount_rule_revision')::int,
      'old_gross', pr.gross_price, 'old_discount_percent', pr.discount_percent, 'old_discount_source', pr.discount_source,
      'old_net', round(v_old_net, 2), 'old_tariff_revision', pr.tariff_revision, 'old_discount_rule_revision', pr.discount_rule_revision);
    IF (v_item->>'gross')::numeric IS DISTINCT FROM pr.gross_price OR (v_item->>'discount_percent')::numeric IS DISTINCT FROM pr.discount_percent THEN
      v_changed := true; v_item := v_item || jsonb_build_object('price_changed', true);
    ELSE v_item := v_item || jsonb_build_object('price_changed', false); END IF;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'items', v_items, 'day_context_digest', v_ctx->>'digest', 'price_changed', v_changed,
    'quote_digest', md5(v_items::text || '|' || (v_ctx->>'digest')));
END $$;

-- Replace the pricing provenance of one requoted appointment (before the guarded row writes).
CREATE OR REPLACE FUNCTION public.pa_l1_write_pricing(p_item jsonb) RETURNS void
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.private_appointment_pricing SET
    tariff_revision = (p_item->>'tariff_revision')::int, discount_rule_revision = (p_item->>'discount_rule_revision')::int,
    gross_price = (p_item->>'gross')::numeric, discount_source = p_item->>'discount_source',
    discount_percent = (p_item->>'discount_percent')::numeric, discount_amount = (p_item->>'discount_amount')::numeric,
    discount_reason = p_item->>'discount_reason', persons = (p_item->>'persons')::int, eligible_persons = (p_item->>'eligible')::int,
    priced_date = (p_item->>'date')::date, priced_time_start = (p_item->>'time_start')::time, priced_time_end = (p_item->>'time_end')::time,
    participant_ids = ARRAY(SELECT y::uuid FROM jsonb_array_elements_text(p_item->'participant_ids') y ORDER BY 1),
    updated_at = now()
  WHERE appointment_id = (p_item->>'appointment_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required'; END IF;
END $$;

-- Guard: a tariff-priced appointment's price/time/participants may only take the server-priced state.
CREATE OR REPLACE FUNCTION public.pa_tariff_transition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_appt uuid; pr record;
BEGIN
  IF TG_TABLE_NAME = 'private_appointments' THEN
    IF (NEW.date, NEW.time_start, NEW.time_end, NEW.price) IS DISTINCT FROM (OLD.date, OLD.time_start, OLD.time_end, OLD.price) THEN
      SELECT * INTO pr FROM public.private_appointment_pricing WHERE appointment_id = OLD.id;
      IF FOUND AND (NEW.date, NEW.time_start, NEW.time_end, NEW.price)
                   IS DISTINCT FROM (pr.priced_date, pr.priced_time_start, pr.priced_time_end, pr.gross_price) THEN
        RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'ticket_items' THEN
    IF OLD.appointment_id IS NOT NULL
       AND (NEW.unit_price, NEW.quantity, NEW.discount_percent, NEW.discount_reason) IS DISTINCT FROM
           (OLD.unit_price, OLD.quantity, OLD.discount_percent, OLD.discount_reason) THEN
      SELECT * INTO pr FROM public.private_appointment_pricing WHERE appointment_id = OLD.appointment_id;
      IF FOUND AND (NEW.unit_price, NEW.quantity, coalesce(NEW.discount_percent,0), NEW.discount_reason)
                   IS DISTINCT FROM (pr.gross_price, 1, pr.discount_percent, pr.discount_reason) THEN
        RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
      END IF;
    END IF;
    RETURN NEW;
  ELSE
    v_appt := CASE WHEN TG_OP = 'DELETE' THEN OLD.appointment_id ELSE NEW.appointment_id END;
    SELECT * INTO pr FROM public.private_appointment_pricing WHERE appointment_id = v_appt;
    IF FOUND AND EXISTS (SELECT 1 FROM public.private_appointments WHERE id = v_appt)
       AND ((TG_OP = 'INSERT' AND NOT NEW.participant_id = ANY(pr.participant_ids))
         OR (TG_OP = 'DELETE' AND OLD.participant_id = ANY(pr.participant_ids))) THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pa_tariff_transition_guard() FROM PUBLIC, anon, authenticated;

-- pa_apply_slot: tariff-priced appointments take price + discount from the (already written) pricing row;
-- a time change without a prior requote is refused by the guard. Legacy appointments: unchanged (pa_price).
CREATE OR REPLACE FUNCTION public.pa_apply_slot(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; v_changed boolean; v_persons int; v_price numeric; v_conf text; pr record; v_tariffed boolean;
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_id;
  v_changed := a.date IS DISTINCT FROM p_date OR a.time_start IS DISTINCT FROM p_start
            OR a.time_end IS DISTINCT FROM p_end OR a.instructor_id IS DISTINCT FROM p_instr;
  SELECT * INTO pr FROM public.private_appointment_pricing WHERE appointment_id = p_id;
  v_tariffed := FOUND;
  IF v_tariffed THEN
    IF (p_date, p_start, p_end) IS DISTINCT FROM (pr.priced_date, pr.priced_time_start, pr.priced_time_end) THEN
      RAISE EXCEPTION USING ERRCODE = 'YT001', MESSAGE = 'tariff_transition_required';
    END IF;
    v_price := pr.gross_price;
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
         discount_percent = CASE WHEN v_tariffed THEN pr.discount_percent ELSE discount_percent END,
         discount_reason = CASE WHEN v_tariffed THEN pr.discount_reason ELSE discount_reason END,
         instructor_confirmed_at = CASE WHEN v_changed THEN NULL ELSE instructor_confirmed_at END,
         confirmation_reset_at = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN now() ELSE confirmation_reset_at END,
         confirmation_reset_reason = CASE WHEN v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending' THEN 'private_appointment_changed' ELSE confirmation_reset_reason END
   WHERE appointment_id = p_id;
  RETURN jsonb_build_object('changed', v_changed, 'price', v_price,
    'confirmation_reset', v_changed AND a.instructor_confirmation IS NOT NULL AND a.instructor_confirmation <> 'pending');
END $$;

-- Net line value of an appointment (generated line_total mirror).
CREATE OR REPLACE FUNCTION public.pa_l1_line_net(p_appt uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(sum(coalesce(line_total, unit_price * coalesce(quantity,1) * (1 - coalesce(discount_percent,0)/100))), 0)
    FROM public.ticket_items WHERE appointment_id = p_appt AND coalesce(status,'') <> 'cancelled'
$$;

-- Move one appointment. p_ack: {quote_digest} of the quote_changed answer the user confirmed.
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
  IF p_date < public.pa_business_today() OR p_end <= p_start OR p_instr IS NULL THEN
    RETURN jsonb_build_object('error','invalid','field','slot');
  END IF;
  FOR c IN SELECT * FROM public.pa_slot_conflicts(p_instr, p_date, p_start, p_end, p_id) LOOP
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

CREATE OR REPLACE FUNCTION public.pa_move_appointment(p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid) RETURNS jsonb
LANGUAGE sql SET search_path TO 'public' AS $$ SELECT public.pa_move_appointment(p_id, p_date, p_start, p_end, p_instr, p_actor, NULL::jsonb) $$;

-- Period update (time/teacher of every editable appointment of a period group), same rules.
CREATE OR REPLACE FUNCTION public.pa_period_update(p_group uuid, p_changes jsonb, p_actor uuid, p_ack jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE a record; j jsonb; c record; v_ticket uuid;
  v_excluded jsonb := '[]'::jsonb; v_conf jsonb := '[]'::jsonb; v_todo uuid[] := ARRAY[]::uuid[];
  v_targets jsonb := '[]'::jsonb; s time; t time; ins uuid;
  v_ids0 uuid[]; v_pids0 uuid[]; v_dates0 date[]; v_ids uuid[]; v_pids uuid[];
  v_req jsonb := '[]'::jsonb; v_q jsonb; v_legacy boolean := false; v_old numeric := 0; v_new numeric; v_total numeric; x jsonb;
BEGIN
  IF p_group IS NULL OR p_changes IS NULL OR NOT (p_changes ?| ARRAY['time_start','time_end','instructor_id']) THEN
    RETURN jsonb_build_object('error','invalid','field','changes');
  END IF;
  -- Unlocked read only to know which locks to take; re-validated under lock.
  SELECT array_agg(id ORDER BY id), array_agg(DISTINCT date), min(ticket_id::text)::uuid INTO v_ids0, v_dates0, v_ticket
    FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled';
  IF v_ticket IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  v_pids0 := ARRAY(SELECT DISTINCT participant_id FROM public.private_appointment_participants WHERE appointment_id = ANY(v_ids0) ORDER BY 1);
  BEGIN
    PERFORM public.pa_lock_slots((SELECT coalesce(jsonb_agg(jsonb_build_object('instructor_id', coalesce((p_changes->>'instructor_id')::uuid, pa.instructor_id), 'date', pa.date)), '[]'::jsonb)
      FROM public.private_appointments pa WHERE pa.id = ANY(v_ids0)));
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('error','invalid','field','changes'); END;
  PERFORM public.pa_lock_days(v_pids0, v_dates0);
  PERFORM 1 FROM public.tickets WHERE id = v_ticket FOR UPDATE;
  FOR a IN SELECT * FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY date, time_start, id FOR UPDATE LOOP
    IF a.ticket_id <> v_ticket THEN RETURN jsonb_build_object('error','invalid','field','period_group_id'); END IF;
    j := public.pa_is_protected(a.id);
    IF (j->>'protected')::boolean THEN
      v_excluded := v_excluded || jsonb_build_object('id',a.id,'reasons',j->'reasons'); CONTINUE;
    END IF;
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    IF t <= s OR ins IS NULL THEN RETURN jsonb_build_object('error','invalid','field','changes'); END IF;
    v_todo := v_todo || a.id;
  END LOOP;
  v_ids := ARRAY(SELECT id FROM public.private_appointments WHERE period_group_id = p_group AND status <> 'cancelled' ORDER BY id);
  v_pids := ARRAY(SELECT DISTINCT participant_id FROM public.private_appointment_participants WHERE appointment_id = ANY(v_ids) ORDER BY 1);
  IF v_ids IS DISTINCT FROM v_ids0 OR v_pids IS DISTINCT FROM v_pids0 THEN
    RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('kind','stale','ref_id',p_group)));
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) ORDER BY date, time_start, id LOOP
    s := coalesce((p_changes->>'time_start')::time, a.time_start);
    t := coalesce((p_changes->>'time_end')::time, a.time_end);
    ins := coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id);
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, a.date, s, t, a.id) LOOP
      v_conf := v_conf || jsonb_build_object('appointment_id',a.id,'date',a.date,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = a.id) THEN
      IF (s, t) IS DISTINCT FROM (a.time_start, a.time_end) THEN
        v_req := v_req || jsonb_build_array(jsonb_build_object('appointment_id', a.id, 'date', a.date, 'time_start', s, 'time_end', t,
          'participant_ids', (SELECT jsonb_agg(participant_id ORDER BY participant_id) FROM public.private_appointment_participants WHERE appointment_id = a.id)));
      END IF;
    ELSE v_legacy := true; END IF;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;
  IF jsonb_array_length(v_req) > 0 THEN
    v_q := public.pa_l1_requote(v_req);
    IF v_q ? 'error' THEN RETURN v_q; END IF;
    SELECT total_amount INTO v_total FROM public.tickets WHERE id = v_ticket;
    v_q := v_q || jsonb_build_object('old_total', v_total, 'new_total', v_total +
      (SELECT coalesce(sum((i->>'net')::numeric - (i->>'old_net')::numeric), 0) FROM jsonb_array_elements(v_q->'items') i));
    IF (v_q->>'price_changed')::boolean AND (p_ack->>'quote_digest') IS DISTINCT FROM (v_q->>'quote_digest') THEN
      RETURN jsonb_build_object('error','quote_changed','quote', v_q);
    END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(v_q->'items') LOOP
      v_old := v_old + public.pa_l1_line_net((x->>'appointment_id')::uuid);
      PERFORM public.pa_l1_write_pricing(x);
    END LOOP;
  END IF;
  FOR a IN SELECT * FROM public.private_appointments WHERE id = ANY(v_todo) LOOP
    PERFORM public.pa_apply_slot(a.id, a.date,
      coalesce((p_changes->>'time_start')::time, a.time_start),
      coalesce((p_changes->>'time_end')::time, a.time_end),
      coalesce((p_changes->>'instructor_id')::uuid, a.instructor_id));
  END LOOP;
  IF cardinality(v_todo) > 0 THEN
    IF v_legacy THEN
      PERFORM public.pa_recalc_ticket_total(v_ticket); -- legacy behaviour (no tariff-priced lesson repriced by it: their lines already hold the server price)
    ELSIF jsonb_array_length(v_req) > 0 THEN
      SELECT coalesce(sum(public.pa_l1_line_net((i->>'appointment_id')::uuid)), 0) INTO v_new FROM jsonb_array_elements(v_q->'items') i;
      UPDATE public.tickets SET total_amount = total_amount + (v_new - v_old) WHERE id = v_ticket;
    END IF;
    PERFORM public.pa_emit_change(v_ticket, v_todo, 'period_updated', p_actor,
      jsonb_build_object('changes', p_changes, 'excluded', v_excluded)
      || CASE WHEN v_q IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pricing', jsonb_build_object('items', v_q->'items',
           'acknowledged', (v_q->>'price_changed')::boolean), 'old_total', v_q->'old_total',
           'new_total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket)) END);
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated_ids', to_jsonb(v_todo), 'excluded', v_excluded);
END $$;

CREATE OR REPLACE FUNCTION public.pa_period_update(p_group uuid, p_changes jsonb, p_actor uuid) RETURNS jsonb
LANGUAGE sql SET search_path TO 'public' AS $$ SELECT public.pa_period_update(p_group, p_changes, p_actor, NULL::jsonb) $$;

-- B03a edit (pa_edit_booking.sql) + L1: participant changes of tariff-priced lessons are requoted by
-- pa_l1_requote (one batch, the other edited lessons' NEW state counted), need acknowledged_price
-- (= new gross), acknowledged_total and acknowledged_quote_digest; apply takes the day locks first.
-- Legacy lessons: unchanged pa_price behaviour. Notes / meeting point / no-op: unchanged.
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
  v_tariffed boolean; v_req jsonb := '[]'::jsonb; v_l1 jsonb; v_it jsonb; v_lock_p uuid[]; v_lock_d date[]; i int;
BEGIN
  IF v_mode NOT IN ('quote', 'apply') THEN RETURN jsonb_build_object('error','invalid','field','mode'); END IF;
  IF p_actor IS NULL OR NOT (public.has_role(p_actor,'office') OR public.has_role(p_actor,'admin') OR public.has_role(p_actor,'super_admin')) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  BEGIN v_ticket := (p->>'ticket_id')::uuid; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','ticket_id'); END;
  -- L1: day locks (current + requested participants of the listed lessons x their dates) BEFORE row locks.
  IF v_mode = 'apply' THEN
    BEGIN
      SELECT ARRAY(SELECT DISTINCT u FROM (
               SELECT pp.participant_id u FROM public.private_appointment_participants pp
                WHERE pp.appointment_id IN (SELECT (y->>'appointment_id')::uuid FROM jsonb_array_elements(coalesce(p->'appointments','[]'::jsonb)) y)
               UNION SELECT z::uuid FROM jsonb_array_elements(coalesce(p->'appointments','[]'::jsonb)) y, jsonb_array_elements_text(coalesce(y->'participant_ids','[]'::jsonb)) z) q ORDER BY 1),
             ARRAY(SELECT DISTINCT pa.date FROM public.private_appointments pa
                WHERE pa.ticket_id = v_ticket AND pa.id IN (SELECT (y->>'appointment_id')::uuid FROM jsonb_array_elements(coalesce(p->'appointments','[]'::jsonb)) y) ORDER BY 1)
        INTO v_lock_p, v_lock_d;
    EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END;
    PERFORM public.pa_lock_days(v_lock_p, v_lock_d);
  END IF;
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
    v_exp := ARRAY(SELECT DISTINCT x2::uuid FROM jsonb_array_elements_text(e->'expected_participant_ids') x2 ORDER BY 1);
    IF v_exp IS DISTINCT FROM v_cur THEN
      RETURN jsonb_build_object('error','conflict','conflicts', jsonb_build_array(jsonb_build_object('date',a.date,'kind','stale','ref_id',a.id)));
    END IF;
    IF (e->>'expected_price')::numeric IS DISTINCT FROM a.price THEN
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
    v_tariffed := EXISTS (SELECT 1 FROM public.private_appointment_pricing WHERE appointment_id = a.id);
    IF v_part_changed AND v_tariffed THEN
      v_price := NULL; -- filled by the batch requote below
      v_req := v_req || jsonb_build_array(jsonb_build_object('appointment_id', a.id, 'date', a.date,
        'time_start', a.time_start, 'time_end', a.time_end, 'participant_ids', to_jsonb(v_new)));
    ELSE
      v_price := CASE WHEN v_part_changed THEN public.pa_price(a.date, a.time_start, a.time_end, cardinality(v_new)) ELSE a.price END;
    END IF;
    IF v_part_changed THEN v_reprice := true; END IF;
    IF v_part_changed OR v_mp_changed THEN v_any := true; END IF;
    j := jsonb_build_object('internal_notes_changed', e ? 'internal_notes' AND ti_original.internal_notes IS DISTINCT FROM nullif(e->>'internal_notes',''),
      'instructor_notes_changed', e ? 'instructor_notes' AND ti_original.instructor_notes IS DISTINCT FROM nullif(e->>'instructor_notes',''),
      'internal_notes', CASE WHEN e ? 'internal_notes' THEN nullif(e->>'internal_notes','') ELSE ti_original.internal_notes END,
      'instructor_notes', CASE WHEN e ? 'instructor_notes' THEN nullif(e->>'instructor_notes','') ELSE ti_original.instructor_notes END);
    IF (j->>'internal_notes_changed')::boolean OR (j->>'instructor_notes_changed')::boolean THEN v_notes_changed := true; END IF;
    v_plan := v_plan || (j || jsonb_build_object('appointment_id', a.id, 'date', a.date,
      'from_participant_ids', to_jsonb(v_cur), 'participant_ids', to_jsonb(v_new),
      'old_price', a.price, 'new_price', v_price, 'participants_changed', v_part_changed, 'tariffed', v_tariffed,
      'acknowledged_price', e->'acknowledged_price',
      'meeting_point_changed', v_mp_changed, 'meeting_point', CASE WHEN v_mp_changed THEN e->>'meeting_point' ELSE a.meeting_point END));
  END LOOP;

  -- L1: one batch requote of the tariff-priced lessons whose people change; merge into the plan.
  IF jsonb_array_length(v_req) > 0 THEN
    v_l1 := public.pa_l1_requote(v_req);
    IF v_l1 ? 'error' THEN RETURN v_l1; END IF;
    FOR i IN 0 .. jsonb_array_length(v_plan) - 1 LOOP
      SELECT it INTO v_it FROM jsonb_array_elements(v_l1->'items') it WHERE it->>'appointment_id' = v_plan->i->>'appointment_id';
      IF v_it IS NOT NULL THEN
        v_plan := jsonb_set(v_plan, ARRAY[i::text], (v_plan->i) || jsonb_build_object('new_price', v_it->'gross',
          'new_discount_percent', v_it->'discount_percent', 'new_discount_source', v_it->'discount_source',
          'new_discount_reason', v_it->'discount_reason', 'new_net', v_it->'net', 'pricing', v_it));
      END IF;
      v_it := NULL;
    END LOOP;
  END IF;
  -- Per-lesson acknowledgement = new gross price shown for that lesson.
  FOR x IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (x->>'participants_changed')::boolean AND (NOT (x ? 'acknowledged_price') OR jsonb_typeof(x->'acknowledged_price') <> 'number'
        OR (x->>'acknowledged_price')::numeric IS DISTINCT FROM (x->>'new_price')::numeric) THEN v_ack_ok := false; END IF;
  END LOOP;
  v_plan := (SELECT coalesce(jsonb_agg(v - 'acknowledged_price' ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(v_plan) WITH ORDINALITY q(v, o));

  IF p ? 'customer_notes' AND tk.notes IS DISTINCT FROM nullif(p->>'customer_notes','') THEN v_cust_notes_changed := true; END IF;

  -- Apply only the net delta of explicitly changed lessons to the authoritative stored total.
  SELECT tk.total_amount + coalesce(sum(
      (pl.v->>'new_price')::numeric * ti.quantity * (1 - coalesce((pl.v->>'new_discount_percent')::numeric, ti.discount_percent, 0)/100)
      - coalesce(ti.line_total, ti.unit_price * coalesce(ti.quantity,1) * (1 - coalesce(ti.discount_percent,0)/100))),0)
    INTO v_new_total FROM public.ticket_items ti
    JOIN LATERAL (SELECT v FROM jsonb_array_elements(v_plan) v
      WHERE (v->>'appointment_id')::uuid=ti.appointment_id AND (v->>'participants_changed')::boolean) pl ON true
    WHERE ti.ticket_id=v_ticket AND coalesce(ti.status,'') <> 'cancelled';

  v_quote := jsonb_build_object('appointments', v_plan, 'old_total', tk.total_amount,
    'new_total', CASE WHEN v_reprice THEN v_new_total ELSE tk.total_amount END,
    'changed', v_any OR v_notes_changed OR v_cust_notes_changed)
    || CASE WHEN v_l1 IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quote_digest', v_l1->>'quote_digest',
         'day_context_digest', v_l1->>'day_context_digest') END;
  IF v_mode = 'quote' THEN RETURN jsonb_build_object('ok', true, 'quote', v_quote); END IF;
  IF NOT (v_any OR v_notes_changed OR v_cust_notes_changed) THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'quote', v_quote);
  END IF;
  IF v_reprice AND (NOT v_ack_ok OR (p->>'acknowledged_total')::numeric IS DISTINCT FROM v_new_total
      OR (v_l1 IS NOT NULL AND (p->>'acknowledged_quote_digest') IS DISTINCT FROM (v_l1->>'quote_digest'))) THEN
    RETURN jsonb_build_object('error','quote_changed','quote', v_quote);
  END IF;

  -- Phase 2: writes (all validated)
  FOR x IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (x->>'participants_changed')::boolean THEN
      v_new := ARRAY(SELECT y::uuid FROM jsonb_array_elements_text(x->'participant_ids') y);
      IF x ? 'pricing' THEN PERFORM public.pa_l1_write_pricing(x->'pricing'); END IF;
      DELETE FROM public.private_appointment_participants
       WHERE appointment_id = (x->>'appointment_id')::uuid AND participant_id <> ALL(v_new);
      INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
        SELECT (x->>'appointment_id')::uuid, n FROM unnest(v_new) n
         WHERE NOT EXISTS (SELECT 1 FROM public.private_appointment_participants pp
                            WHERE pp.appointment_id = (x->>'appointment_id')::uuid AND pp.participant_id = n);
      UPDATE public.private_appointments SET price = (x->>'new_price')::numeric WHERE id = (x->>'appointment_id')::uuid;
      IF x ? 'pricing' THEN
        UPDATE public.ticket_items SET unit_price = (x->>'new_price')::numeric, group_participant_count = cardinality(v_new),
               discount_percent = (x->>'new_discount_percent')::numeric, discount_reason = x->>'new_discount_reason'
         WHERE appointment_id = (x->>'appointment_id')::uuid;
      ELSE
        UPDATE public.ticket_items SET unit_price = (x->>'new_price')::numeric, group_participant_count = cardinality(v_new)
         WHERE appointment_id = (x->>'appointment_id')::uuid;
      END IF;
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
  IF v_reprice THEN
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

REVOKE ALL ON FUNCTION public.pa_lock_days(uuid[], date[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_lock_days(uuid[], date[]) TO service_role;
REVOKE ALL ON FUNCTION public.pa_l1_requote(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_l1_requote(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pa_l1_write_pricing(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_l1_write_pricing(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pa_l1_line_net(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_l1_line_net(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_move_appointment(uuid, date, time, time, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_period_update(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_period_update(uuid, jsonb, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_period_update(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_edit_booking(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_edit_booking(jsonb, uuid) TO service_role;
