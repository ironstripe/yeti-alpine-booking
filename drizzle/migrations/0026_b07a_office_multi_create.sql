-- Promoted 2026-10-25 from supabase/pending/b07a_office_multi_create.sql (B01-B11 + B07 coordinated release step 11). Do not re-run the pending copy: it was removed.
-- B07a (PENDING, NOT INSTALLED): atomic multi-item office booking (mixed private + group cart).
-- Requires, installed in this order: production baseline + 0001..0007, b04_delivery_compatibility,
-- b05_office_confirmation_intent, b11_created_total_event, participant_birth_date_guard,
-- group_lunch_full_day -> group_lunch_season (B09), pa_edit_booking (B03a), product_private_tariff_rules
-- (B07-P/P2/P3), pa_tariff_l1 (L1). Install in the SAME coordinated release as the B07 server/client.
--
-- public.b07a_office_multi(p, actor, mode) - service_role only, called by the staff `office-booking` function.
-- * ONE ticket, all items or none: every write (guests, ticket, appointments, participants, pricing rows,
--   group lines/enrollments/lunch, payment, comments, B05 intent, B11 event, submission row) is one
--   subtransaction; any error at any position rolls everything back. No provider calls, no e-mail.
-- * Shared draft participant identity: p.participants[] = {ref, participant_id} | {ref, guest:{...}}; each
--   person is resolved ONCE for the whole cart (guest: same customer + name + birth date match, else one
--   new row) and items refer to refs only. The same participant_id under two refs is rejected.
-- * Private items: product-configured resolver (pa_price_request, office channel) per item; the same-day
--   discount of each item sees ALL proposed private intervals of the cart (other items as price-0 context)
--   plus the participant/day context of already booked lessons => order-independent. Guests contribute
--   only cart minutes (no history), exactly as in the single-item quote. Manual override per item replaces.
-- * Group items: all lines go through ONE bc_2627_staff_group_book call (same tiers, lunch season, locks),
--   writing onto this ticket (transaction-local b07a.ticket marker, see patch below).
-- * Quote = the identical code path executed and rolled back; create requires acknowledged_quote_digest
--   equal to the digest recomputed under the locks (revisions, day context, every line) - else
--   quote_changed with the fresh quote and nothing written.
-- * Lock order: submission key < tariff/discount revisions (SHARE) < teacher slots < participant days <
--   context appointments (SHARE) < courses/instances (inside group booking) < new ticket.
-- * Replay: b07a_office_submissions(submission_key, payload_digest); same key + same payload => stored
--   result (replayed); same key + different payload => submission_mismatch. The B05 intent is written once.
-- Rollback: supabase/rollback/b07a_office_multi_create_rollback.sql.

DO $patch$
DECLARE
  body text;
  old_ticket text := '  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, notes)
  VALUES (v_number, v_customer, ''confirmed'', 0, 0, ''office'', p_actor, nullif(p->>''notes'', ''''))
  RETURNING id INTO v_ticket;
  INSERT INTO public.bc_2627_staff_group_submissions (submission_key, ticket_id, created_by) VALUES (v_key, v_ticket, p_actor);';
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, 'lunch_season') = 0 OR strpos(body, 'b07a.ticket') > 0 OR strpos(body, old_ticket) = 0 THEN
    RAISE EXCEPTION 'Unexpected staff group booking body (B09 required, B07a not yet applied); B07a patch not applied';
  END IF;
  body := replace(body, old_ticket, '  -- B07a: lines of an atomic multi-item booking go onto the caller''s ticket (transaction-local marker
  -- set only by b07a_office_multi); otherwise unchanged single-item behaviour.
  v_ticket := nullif(current_setting(''b07a.ticket'', true), '''')::uuid;
  IF v_ticket IS NOT NULL THEN
    SELECT ticket_number INTO v_number FROM public.tickets WHERE id = v_ticket AND customer_id = v_customer;
    IF v_number IS NULL THEN RETURN jsonb_build_object(''error'', ''invalid'', ''field'', ''ticket''); END IF;
  ELSE
' || old_ticket || '
  END IF;');
  EXECUTE body;
END $patch$;

CREATE TABLE public.b07a_office_submissions (
  submission_key text PRIMARY KEY CONSTRAINT b07a_key_len CHECK (length(submission_key) BETWEEN 8 AND 100),
  payload_digest text NOT NULL,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id),
  result jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.b07a_office_submissions TO service_role;
REVOKE ALL ON public.b07a_office_submissions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.b07a_office_submissions ENABLE ROW LEVEL SECURITY;
-- No browser policies: service-only after staff authorization.

CREATE OR REPLACE FUNCTION public.b07a_office_multi(p jsonb, p_actor uuid, p_mode text) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_key text := p->>'submission_key'; v_digest text; v_sub record;
  v_customer uuid; v_parts jsonb := p->'participants'; v_items jsonb := p->'items';
  v_ref jsonb := '{}'::jsonb;      -- ref -> participant entry
  v_dkey jsonb := '{}'::jsonb;     -- ref -> discount key (uuid text | 'guest:'||ref)
  v_pid jsonb := '{}'::jsonb;      -- ref -> resolved uuid
  v_refof jsonb := '{}'::jsonb;    -- uuid -> ref
  v_known uuid[] := ARRAY[]::uuid[]; v_priv_known uuid[] := ARRAY[]::uuid[];
  v_slots jsonb := '[]'::jsonb;    -- flattened private slots
  v_glines jsonb := '[]'::jsonb; v_gmap jsonb := '[]'::jsonb;
  v_products uuid[] := ARRAY[]::uuid[]; v_revs jsonb := '{}'::jsonb; v_drev int; v_rev int;
  v_dates date[]; v_ctx jsonb; v_conf jsonb := '[]'::jsonb; v_priced jsonb := '{}'::jsonb; v_pq jsonb; v_other jsonb;
  v_err jsonb; v_res jsonb; v_lines jsonb; v_quote jsonb; v_qd text; v_total numeric;
  v_ticket uuid; v_number text; v_group uuid; v_aid uuid; v_ids uuid[] := ARRAY[]::uuid[]; v_unassigned date[] := ARRAY[]::date[];
  v_appt_item jsonb := '{}'::jsonb; v_private_out jsonb := '[]'::jsonb; v_requested boolean;
  e jsonb; x jsonb; it jsonb; i int; k int; j int; n int; d date; s time; t time; ins uuid; v_later boolean; v_refs text[]; c record;
  v_intent jsonb; v_uid uuid; g jsonb; v_disc_total numeric := 0; v_sources text[] := ARRAY[]::text[];
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('quote','create') THEN RETURN jsonb_build_object('error','invalid','field','mode'); END IF;
  IF p_actor IS NULL OR NOT (public.has_role(p_actor,'office') OR public.has_role(p_actor,'admin') OR public.has_role(p_actor,'super_admin')) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 100 THEN
    RETURN jsonb_build_object('error','invalid','field','submission_key');
  END IF;
  IF p_mode = 'create' THEN
    PERFORM pg_advisory_xact_lock(hashtext('b07a_office:' || v_key));
    v_digest := md5((p - 'acknowledged_quote_digest')::text);
    SELECT * INTO v_sub FROM public.b07a_office_submissions WHERE submission_key = v_key;
    IF FOUND THEN
      IF v_sub.payload_digest <> v_digest THEN RETURN jsonb_build_object('error','submission_mismatch'); END IF;
      RETURN v_sub.result || jsonb_build_object('replayed', true, 'confirmation_requested',
        (SELECT requested FROM public.office_booking_confirmation_intents WHERE ticket_id = v_sub.ticket_id));
    END IF;
    IF jsonb_typeof(p->'confirmation_requested') IS DISTINCT FROM 'boolean' THEN
      RETURN jsonb_build_object('error','invalid','field','confirmation_requested');
    END IF;
    IF jsonb_typeof(p->'acknowledged_quote_digest') IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('error','invalid','field','acknowledged_quote_digest');
    END IF;
  END IF;
  -- Required B04/B05 contract before any write (same check as b05_office_create).
  PERFORM claimed_at, first_claimed_at, provider_idempotency_key, frozen_payload, payload_digest, delivery_protocol
    FROM public.booking_email_deliveries LIMIT 0;
  PERFORM ticket_id, requested FROM public.office_booking_confirmation_intents LIMIT 0;

  BEGIN v_customer := (p->>'customer_id')::uuid;
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','customer_id'); END;
  IF v_customer IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer AND NOT is_archived AND merged_into_id IS NULL) THEN
    RETURN jsonb_build_object('error','not_found','field','customer_id');
  END IF;

  -- 1. Participants: each ref once, each saved person once.
  IF jsonb_typeof(v_parts) IS DISTINCT FROM 'array' OR jsonb_array_length(v_parts) NOT BETWEEN 1 AND 30 THEN
    RETURN jsonb_build_object('error','invalid','field','participants');
  END IF;
  FOR i IN 0 .. jsonb_array_length(v_parts) - 1 LOOP
    e := v_parts->i;
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR coalesce(e->>'ref','') = '' OR length(e->>'ref') > 64 OR v_ref ? (e->>'ref')
       OR ((e ? 'participant_id') = (e ? 'guest')) THEN
      RETURN jsonb_build_object('error','invalid','field','participants','index',i);
    END IF;
    IF e ? 'participant_id' THEN
      BEGIN v_uid := (e->>'participant_id')::uuid;
      EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','participants','index',i); END;
      IF v_uid = ANY(v_known) OR NOT EXISTS (SELECT 1 FROM public.customer_participants WHERE id = v_uid AND customer_id = v_customer
           AND NOT is_archived AND merged_into_id IS NULL) THEN
        RETURN jsonb_build_object('error','invalid','field','participants','index',i);
      END IF;
      v_known := v_known || v_uid;
      v_dkey := v_dkey || jsonb_build_object(e->>'ref', v_uid::text);
    ELSE
      g := e->'guest';
      IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR coalesce(trim(g->>'first_name'),'') = '' OR (g->>'birth_date') IS NULL THEN
        RETURN jsonb_build_object('error','invalid','field','participants','index',i);
      END IF;
      BEGIN PERFORM (g->>'birth_date')::date;
      EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','birth_date','index',i); END;
      v_dkey := v_dkey || jsonb_build_object(e->>'ref', 'guest:' || (e->>'ref'));
    END IF;
    v_ref := v_ref || jsonb_build_object(e->>'ref', e);
  END LOOP;

  -- 2. Items (read-only validation).
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object('error','invalid','field','items');
  END IF;
  FOR i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    it := v_items->i;
    IF it->>'kind' = 'private' THEN
      BEGIN v_uid := (it->>'product_id')::uuid;
      EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','product_id','item',i); END;
      IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_uid AND type = 'private' AND is_active IS TRUE) THEN
        RETURN jsonb_build_object('error','invalid','field','product_id','item',i);
      END IF;
      IF NOT v_uid = ANY(v_products) THEN v_products := v_products || v_uid; END IF;
      v_intent := public.pa_discount_intent(it, true);
      IF v_intent ? 'error' THEN RETURN v_intent || jsonb_build_object('item', i); END IF;
      IF jsonb_typeof(it->'participants') IS DISTINCT FROM 'array' OR jsonb_array_length(it->'participants') = 0
         OR jsonb_typeof(it->'appointments') IS DISTINCT FROM 'array' OR jsonb_array_length(it->'appointments') NOT BETWEEN 1 AND 60 THEN
        RETURN jsonb_build_object('error','invalid','field','appointments','item',i);
      END IF;
      FOR k IN 0 .. jsonb_array_length(it->'appointments') - 1 LOOP
        e := it->'appointments'->k;
        BEGIN
          d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
          v_refs := ARRAY(SELECT DISTINCT y FROM jsonb_array_elements_text(coalesce(e->'participants', it->'participants')) y ORDER BY 1);
        EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','appointments','item',i,'index',k); END;
        v_later := coalesce(e->'assign_later' = 'true'::jsonb, false);
        IF e ? 'assign_later' AND jsonb_typeof(e->'assign_later') <> 'boolean' THEN v_later := NULL; END IF;
        IF d IS NULL OR s IS NULL OR t IS NULL OR d < public.pa_business_today() OR t <= s OR v_later IS NULL
           OR (ins IS NULL AND NOT v_later) OR (ins IS NOT NULL AND v_later) THEN
          RETURN jsonb_build_object('error','invalid','field','appointments','item',i,'index',k);
        END IF;
        -- Per-slot people: stable refs of this item (default: all item participants).
        IF cardinality(v_refs) NOT BETWEEN 1 AND 4
           OR EXISTS (SELECT 1 FROM unnest(v_refs) r WHERE NOT v_ref ? r
                       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(it->'participants') q WHERE q = r)) THEN
          RETURN jsonb_build_object('error','invalid','field','participants','item',i,'index',k);
        END IF;
        v_slots := v_slots || jsonb_build_array(jsonb_build_object('item', i, 'index', k, 'product_id', v_uid,
          'date', d, 'time_start', s, 'time_end', t, 'instructor_id', ins, 'meeting_point', e->>'meeting_point', 'refs', to_jsonb(v_refs),
          'participants', (SELECT jsonb_agg(v_dkey->>r ORDER BY v_dkey->>r) FROM unnest(v_refs) r)));
      END LOOP;
      -- Guests attending private lessons need a valid level (same rule as the single private create).
      FOR e IN SELECT v_ref->q FROM (SELECT DISTINCT q FROM jsonb_array_elements_text(it->'participants') q) z LOOP
        IF e IS NULL THEN RETURN jsonb_build_object('error','invalid','field','participants','item',i); END IF;
        IF e ? 'guest' AND NOT public.staff_guest_level_ok(e->'guest'->>'level', coalesce(e->'guest'->>'sport','ski')) THEN
          RETURN jsonb_build_object('error','invalid','field','level','item',i,'ref',e->>'ref');
        END IF;
        IF e ? 'participant_id' AND NOT (e->>'participant_id')::uuid = ANY(v_priv_known) THEN
          v_priv_known := v_priv_known || (e->>'participant_id')::uuid;
        END IF;
      END LOOP;
    ELSIF it->>'kind' = 'group' THEN
      IF jsonb_typeof(it->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(it->'lines') = 0 THEN
        RETURN jsonb_build_object('error','invalid','field','lines','item',i);
      END IF;
      FOR k IN 0 .. jsonb_array_length(it->'lines') - 1 LOOP
        e := it->'lines'->k;
        IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR NOT v_ref ? coalesce(e->>'participant','') OR e ? 'participant_id' OR e ? 'guest' THEN
          RETURN jsonb_build_object('error','invalid','field','participant','item',i,'index',k);
        END IF;
        v_glines := v_glines || jsonb_build_array(e);
        v_gmap := v_gmap || jsonb_build_array(jsonb_build_object('item', i, 'index', k));
      END LOOP;
    ELSE
      RETURN jsonb_build_object('error','invalid','field','kind','item',i);
    END IF;
  END LOOP;
  IF jsonb_array_length(v_glines) > 30 THEN RETURN jsonb_build_object('error','invalid','field','lines'); END IF;
  -- Teacher overlap inside the cart.
  FOR i IN 0 .. jsonb_array_length(v_slots) - 1 LOOP
    FOR k IN 0 .. i - 1 LOOP
      IF v_slots->i->>'instructor_id' IS NOT NULL AND v_slots->i->>'instructor_id' = v_slots->k->>'instructor_id'
         AND v_slots->i->>'date' = v_slots->k->>'date'
         AND (v_slots->k->>'time_start')::time < (v_slots->i->>'time_end')::time AND (v_slots->k->>'time_end')::time > (v_slots->i->>'time_start')::time THEN
        v_conf := v_conf || jsonb_build_object('item', v_slots->i->'item', 'index', v_slots->i->'index', 'date', v_slots->i->'date', 'kind', 'request', 'ref_id', NULL);
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;

  -- 3. Locks (fixed global order), then the authoritative state.
  IF jsonb_array_length(v_slots) > 0 THEN
    FOR c IN SELECT product_id, revision FROM public.product_private_tariff_revisions WHERE product_id = ANY(v_products) ORDER BY product_id FOR SHARE LOOP
      v_revs := v_revs || jsonb_build_object(c.product_id::text, c.revision);
    END LOOP;
    FOR i IN 0 .. cardinality(v_products) - 1 LOOP
      IF NOT v_revs ? v_products[i + 1]::text THEN
        RETURN jsonb_build_object('error','tariff_unavailable','reason','not_configured','product_id',v_products[i + 1]);
      END IF;
    END LOOP;
    SELECT revision INTO v_drev FROM public.private_lesson_discount_rule WHERE id FOR SHARE;
    IF v_drev IS NULL THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','discount_rule_not_configured'); END IF;
    PERFORM public.pa_lock_slots((SELECT coalesce(jsonb_agg(jsonb_build_object('instructor_id', jx->>'instructor_id', 'date', jx->>'date')), '[]'::jsonb)
                                    FROM jsonb_array_elements(v_slots) jx));
    v_dates := ARRAY(SELECT DISTINCT (jx->>'date')::date FROM jsonb_array_elements(v_slots) jx ORDER BY 1);
    PERFORM public.pa_lock_days(v_priv_known, v_dates);
    PERFORM 1 FROM public.private_appointments pa
      WHERE pa.date = ANY(v_dates) AND pa.id IN (SELECT appointment_id FROM public.private_appointment_participants WHERE participant_id = ANY(v_priv_known))
      ORDER BY pa.id FOR SHARE;
    v_ctx := public.pa_private_day_context(v_priv_known, v_dates);
    FOR i IN 0 .. jsonb_array_length(v_slots) - 1 LOOP
      x := v_slots->i;
      IF x->>'instructor_id' IS NULL THEN CONTINUE; END IF;
      FOR c IN SELECT * FROM public.pa_slot_conflicts((x->>'instructor_id')::uuid, (x->>'date')::date, (x->>'time_start')::time, (x->>'time_end')::time, NULL) LOOP
        v_conf := v_conf || jsonb_build_object('item', x->'item', 'index', x->'index', 'date', x->'date', 'kind', c.kind, 'ref_id', c.ref_id);
      END LOOP;
    END LOOP;
    IF jsonb_array_length(v_conf) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conf); END IF;

    -- 4. Pricing: one resolver call per private item; all OTHER cart slots + booked context count as minutes.
    FOR i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
      it := v_items->i;
      CONTINUE WHEN it->>'kind' <> 'private';
      v_other := coalesce(v_ctx->'slots', '[]'::jsonb) || coalesce((SELECT jsonb_agg(jsonb_build_object('date', jx->'date', 'time_start', jx->'time_start',
          'time_end', jx->'time_end', 'price', 0, 'participants', jx->'participants')) FROM jsonb_array_elements(v_slots) jx WHERE (jx->>'item')::int <> i), '[]'::jsonb);
      v_pq := public.pa_price_request((it->>'product_id')::uuid,
        (SELECT jsonb_agg(jsonb_build_object('date', jx->'date', 'time_start', jx->'time_start', 'time_end', jx->'time_end', 'participants', jx->'participants')
            ORDER BY (jx->>'index')::int) FROM jsonb_array_elements(v_slots) jx WHERE (jx->>'item')::int = i),
        public.pa_discount_intent(it, true), true, v_other);
      IF v_pq ? 'error' THEN RETURN v_pq || jsonb_build_object('item', i); END IF;
      IF (v_pq->>'revision')::int IS DISTINCT FROM (v_revs->>(it->>'product_id'))::int OR (v_pq->>'discount_rule_revision')::int IS DISTINCT FROM v_drev THEN
        RETURN jsonb_build_object('error','quote_changed','item',i);
      END IF;
      v_priced := v_priced || jsonb_build_object(i::text, v_pq);
    END LOOP;
  END IF;

  -- 5. Writes: one subtransaction.
  BEGIN
    FOR e IN SELECT value FROM jsonb_array_elements(v_parts) LOOP
      IF e ? 'participant_id' THEN
        v_uid := (e->>'participant_id')::uuid;
      ELSE
        g := e->'guest';
        SELECT id INTO v_uid FROM public.customer_participants
         WHERE customer_id = v_customer AND NOT is_archived AND merged_into_id IS NULL
           AND lower(trim(first_name)) = lower(trim(g->>'first_name'))
           AND lower(trim(coalesce(last_name,''))) = lower(trim(coalesce(g->>'last_name','')))
           AND birth_date = (g->>'birth_date')::date
         ORDER BY created_at, id LIMIT 1;
        IF v_uid IS NULL THEN
          INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport, level_current_season)
          VALUES (v_customer, trim(g->>'first_name'), nullif(trim(coalesce(g->>'last_name','')),''), (g->>'birth_date')::date,
                  coalesce(nullif(g->>'sport',''),'ski'), nullif(trim(coalesce(g->>'level','')),''))
          RETURNING id INTO v_uid;
        END IF;
      END IF;
      IF v_refof ? v_uid::text OR (e ? 'guest' AND v_uid = ANY(v_known)) THEN -- one person, one ref
        v_err := jsonb_build_object('error','invalid','field','participants','ref',e->>'ref');
        RAISE EXCEPTION USING ERRCODE = 'B7A01', MESSAGE = 'b07a';
      END IF;
      v_pid := v_pid || jsonb_build_object(e->>'ref', v_uid);
      v_refof := v_refof || jsonb_build_object(v_uid::text, e->>'ref');
    END LOOP;

    v_number := public.generate_ticket_number();
    INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, participant_count, notes)
    VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, 0, nullif(p->>'notes',''))
    RETURNING id INTO v_ticket;

    FOR i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
      it := v_items->i;
      CONTINUE WHEN it->>'kind' <> 'private';
      v_pq := v_priced->(i::text);
      v_group := CASE WHEN jsonb_array_length(it->'appointments') > 1 THEN gen_random_uuid() END;
      j := 0;
      FOR x IN SELECT value FROM jsonb_array_elements(v_slots) WHERE (value->>'item')::int = i ORDER BY (value->>'index')::int LOOP
        e := v_pq->'items'->j; j := j + 1;
        d := (x->>'date')::date; s := (x->>'time_start')::time; t := (x->>'time_end')::time; ins := (x->>'instructor_id')::uuid;
        n := jsonb_array_length(x->'refs');
        INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
        VALUES (v_ticket, d, s, t, ins, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, x->>'meeting_point', v_group, (e->>'price')::numeric, v_key)
        RETURNING id INTO v_aid;
        INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
          SELECT v_aid, (v_pid->>r)::uuid FROM jsonb_array_elements_text(x->'refs') r;
        INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
          unit_price, quantity, discount_percent, discount_reason, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
        VALUES (v_ticket, (it->>'product_id')::uuid, NULL, ins, d, s, t, x->>'meeting_point', (e->>'price')::numeric, 1,
          (e->>'discount_percent')::numeric, e->>'discount_reason', 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, 'private', n, v_group, v_aid);
        INSERT INTO public.private_appointment_pricing (appointment_id, product_id, tariff_revision, discount_rule_revision, gross_price,
          discount_source, discount_percent, discount_amount, persons, eligible_persons, priced_date, priced_time_start, priced_time_end, participant_ids, discount_reason)
        VALUES (v_aid, (it->>'product_id')::uuid, (v_pq->>'revision')::int, v_drev, (e->>'price')::numeric, e->>'discount_source',
          (e->>'discount_percent')::numeric, (e->>'discount_amount')::numeric, (e->>'persons')::int, (e->>'eligible')::int, d, s, t,
          ARRAY(SELECT (v_pid->>r)::uuid FROM jsonb_array_elements_text(x->'refs') r ORDER BY 1), e->>'discount_reason');
        v_ids := v_ids || v_aid;
        v_appt_item := v_appt_item || jsonb_build_object(v_aid::text, jsonb_build_object('item', i, 'index', x->'index'));
        v_private_out := v_private_out || jsonb_build_array(jsonb_build_object('item', i, 'index', x->'index', 'date', d,
          'time_start', s::text, 'time_end', t::text, 'participants', x->'refs', 'gross', (e->>'price')::numeric,
          'discount_source', e->>'discount_source', 'discount_percent', (e->>'discount_percent')::numeric, 'discount_reason', e->>'discount_reason',
          'persons', (e->>'persons')::int, 'eligible', (e->>'eligible')::int, 'net', round((e->>'net')::numeric, 2)));
        IF ins IS NULL THEN v_unassigned := v_unassigned || d; END IF;
        v_disc_total := v_disc_total + (e->>'discount_amount')::numeric;
        IF NOT (e->>'discount_source') = ANY(v_sources) THEN v_sources := v_sources || (e->>'discount_source'); END IF;
      END LOOP;
    END LOOP;

    IF jsonb_array_length(v_glines) > 0 THEN
      PERFORM set_config('b07a.ticket', v_ticket::text, true);
      v_res := public.bc_2627_staff_group_book(jsonb_build_object('submission_key', 'b07a-' || md5(v_key), 'customer_id', v_customer,
          'discount_percent', coalesce(p->'group_discount'->'percent', '0'::jsonb), 'discount_reason', p->'group_discount'->>'reason',
          'lines', (SELECT jsonb_agg((l - 'participant') || jsonb_build_object('participant_id', v_pid->>(l->>'participant')) ORDER BY o)
                      FROM jsonb_array_elements(v_glines) WITH ORDINALITY q(l, o))), p_actor);
      PERFORM set_config('b07a.ticket', '', true);
      IF v_res ? 'error' THEN
        v_err := v_res || CASE WHEN v_res ? 'line' AND (v_res->>'line') ~ '^\d+$' THEN
          jsonb_build_object('item', v_gmap->((v_res->>'line')::int)->'item', 'index', v_gmap->((v_res->>'line')::int)->'index') ELSE '{}'::jsonb END;
        RAISE EXCEPTION USING ERRCODE = 'B7A01', MESSAGE = 'b07a';
      END IF;
      IF (v_res->>'ticket_id')::uuid IS DISTINCT FROM v_ticket THEN RAISE EXCEPTION 'b07a group ticket mismatch'; END IF;
    END IF;

    -- Same person can never be in two places at once inside one booking (adjacent is fine).
    SELECT a.pid, a.d INTO v_uid, d FROM (
        SELECT pap.participant_id pid, pa.date d, pa.time_start s, pa.time_end t, 'a' || pa.id k
          FROM public.private_appointments pa JOIN public.private_appointment_participants pap ON pap.appointment_id = pa.id WHERE pa.ticket_id = v_ticket
        UNION ALL
        SELECT en.participant_id, gi.date, gi.start_time, gi.end_time, 'g' || en.id
          FROM public.group_course_enrollments en JOIN public.ticket_items ti ON ti.id = en.ticket_item_id
          JOIN public.group_course_instances gi ON gi.id = en.instance_id WHERE ti.ticket_id = v_ticket) a
      JOIN (
        SELECT pap.participant_id pid, pa.date d, pa.time_start s, pa.time_end t, 'a' || pa.id k
          FROM public.private_appointments pa JOIN public.private_appointment_participants pap ON pap.appointment_id = pa.id WHERE pa.ticket_id = v_ticket
        UNION ALL
        SELECT en.participant_id, gi.date, gi.start_time, gi.end_time, 'g' || en.id
          FROM public.group_course_enrollments en JOIN public.ticket_items ti ON ti.id = en.ticket_item_id
          JOIN public.group_course_instances gi ON gi.id = en.instance_id WHERE ti.ticket_id = v_ticket) b
        ON a.pid = b.pid AND a.d = b.d AND a.k < b.k AND a.s < b.t AND b.s < a.t
     LIMIT 1;
    IF v_uid IS NOT NULL THEN
      v_err := jsonb_build_object('error','invalid','field','participant_overlap','ref', v_refof->>(v_uid::text), 'date', d);
      RAISE EXCEPTION USING ERRCODE = 'B7A01', MESSAGE = 'b07a';
    END IF;

    -- B10: actual distinct people of the whole booking.
    UPDATE public.tickets SET participant_count = (SELECT count(DISTINCT pid) FROM (
        SELECT pap.participant_id pid FROM public.private_appointment_participants pap JOIN public.private_appointments pa ON pa.id = pap.appointment_id WHERE pa.ticket_id = v_ticket
        UNION SELECT participant_id FROM public.ticket_items WHERE ticket_id = v_ticket AND participant_id IS NOT NULL) z)
     WHERE id = v_ticket;
    PERFORM public.pa_recalc_ticket_total(v_ticket);
    IF cardinality(v_unassigned) > 0 THEN
      INSERT INTO public.action_tasks (task_type, title, description, related_ticket_id, due_date, priority, status, created_by)
      VALUES ('assign_instructor', 'Skilehrer zuweisen', v_number || ' – ' || cardinality(v_unassigned) || ' Privatlektion(en) ohne Lehrperson',
              v_ticket, (SELECT min(y) FROM unnest(v_unassigned) y), 'high', 'pending', p_actor);
    END IF;
    -- B11: one created event for all private lessons; ticket_total_after_create = whole booking total.
    IF cardinality(v_ids) > 0 THEN
      PERFORM public.pa_emit_change(v_ticket, v_ids, 'created', p_actor, jsonb_build_object('multi_item', true,
        'items', jsonb_array_length(v_items), 'persons', (SELECT participant_count FROM public.tickets WHERE id = v_ticket),
        'discount_source', CASE WHEN 'manual' = ANY(v_sources) THEN 'manual' WHEN 'automatic' = ANY(v_sources) THEN 'automatic' ELSE 'none' END,
        'discount_total', round(v_disc_total, 2), 'unassigned', cardinality(v_unassigned),
        'existing_same_day_appointments', (v_ctx->>'appointments')::int));
    END IF;
    IF p ? 'finalization' THEN PERFORM public.staff_booking_finalize(v_ticket, p->'finalization', p_actor); END IF;

    -- Quote projection (independent of ids/ticket number) + digest.
    SELECT total_amount INTO v_total FROM public.tickets WHERE id = v_ticket;
    SELECT coalesce(jsonb_agg(l ORDER BY l->>'item_type', l->>'date', l->>'time_start', l->>'product_id', l->>'participants', l->>'unit_price', l->>'end_date'), '[]'::jsonb)
      INTO v_lines FROM (
        SELECT jsonb_build_object('item_type', ti.item_type, 'product_id', ti.product_id, 'date', ti.date, 'end_date', ti.end_date,
          'time_start', ti.time_start, 'time_end', ti.time_end, 'instructor_id', ti.instructor_id, 'unit_price', ti.unit_price,
          'discount_percent', ti.discount_percent, 'discount_reason', ti.discount_reason, 'line_total', ti.line_total,
          'is_vegetarian', ti.is_vegetarian, 'group_name', ti.group_name,
          'item', v_appt_item->(ti.appointment_id::text)->'item',
          'participants', CASE WHEN ti.appointment_id IS NOT NULL
            THEN (SELECT jsonb_agg(v_refof->>(pap.participant_id::text) ORDER BY v_refof->>(pap.participant_id::text))
                    FROM public.private_appointment_participants pap WHERE pap.appointment_id = ti.appointment_id)
            ELSE jsonb_build_array(v_refof->>(ti.participant_id::text)) END) l
          FROM public.ticket_items ti WHERE ti.ticket_id = v_ticket) z;
    v_quote := jsonb_build_object('lines', v_lines, 'private', v_private_out, 'total', v_total,
      'tariff_revisions', v_revs, 'discount_rule_revision', v_drev, 'day_context_digest', v_ctx->>'digest',
      'existing_same_day_appointments', coalesce((v_ctx->>'appointments')::int, 0));
    v_qd := md5(v_quote::text);
    v_quote := v_quote || jsonb_build_object('quote_digest', v_qd);
    IF p_mode = 'quote' THEN
      v_err := jsonb_build_object('ok', true, 'quote', v_quote);
      RAISE EXCEPTION USING ERRCODE = 'B7A01', MESSAGE = 'b07a_quote'; -- dry run: everything rolled back
    END IF;
    IF p->>'acknowledged_quote_digest' IS DISTINCT FROM v_qd THEN
      v_err := jsonb_build_object('error', 'quote_changed', 'quote', v_quote);
      RAISE EXCEPTION USING ERRCODE = 'B7A01', MESSAGE = 'b07a';
    END IF;

    v_requested := (p->>'confirmation_requested')::boolean;
    INSERT INTO public.office_booking_confirmation_intents (ticket_id, requested, created_by) VALUES (v_ticket, v_requested, p_actor);
    v_res := jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number, 'total', v_total,
      'appointment_ids', to_jsonb(v_ids), 'participant_ids', v_pid, 'quote_digest', v_qd);
    INSERT INTO public.b07a_office_submissions (submission_key, payload_digest, ticket_id, result, created_by)
    VALUES (v_key, v_digest, v_ticket, v_res, p_actor);
    RETURN v_res || jsonb_build_object('confirmation_requested', v_requested);
  EXCEPTION
    WHEN SQLSTATE 'B7A01' THEN RETURN v_err;
    WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('error', 'invalid', 'field', SQLERRM);
    WHEN SQLSTATE '22008' THEN RETURN jsonb_build_object('error', 'invalid', 'field', 'birth_date');
    WHEN SQLSTATE 'YT001' THEN RETURN jsonb_build_object('error', 'tariff_transition_required');
  END;
END $$;
REVOKE ALL ON FUNCTION public.b07a_office_multi(jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.b07a_office_multi(jsonb, uuid, text) TO service_role;
