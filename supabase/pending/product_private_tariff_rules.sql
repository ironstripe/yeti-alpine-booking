-- B07-P (PENDING, NOT INSTALLED): product-configured private-lesson tariffs.
-- Prerequisite for B07a. Requires installed migrations 0001 + 0006 + 0007 (pa_create_booking lineage).
-- Additive: new tables/functions; replaces pa_create_booking so that NEW private bookings are priced
-- only by the product's configured rules. Existing appointments, ticket items, invoices, payments and
-- frozen delivery payloads are not read or changed. pa_price/private_lesson_rates stay in place for
-- existing move/edit paths (see docs/b07-pricing-verification.md, limitation L1).
-- No price value lives in this file: rates are data (product_private_tariff_rules).

CREATE TABLE public.product_private_tariff_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- exact_block: price for exactly window_start..window_end.
  -- hourly: price per whole hour inside window_start..window_end.
  rule_kind text NOT NULL,
  window_start time NOT NULL,
  window_end time NOT NULL,
  price_chf numeric(10,2) NOT NULL,           -- 1 person (per block or per hour)
  extra_person_chf numeric(10,2) NOT NULL,    -- per additional person (per block or per hour)
  max_persons integer NOT NULL,
  max_block_minutes integer,                  -- hourly only: longest booking this rule may price (NULL = any)
  office_only boolean NOT NULL DEFAULT false, -- exception usable only via the staff office path
  provenance text NOT NULL,                   -- who/what sourced this value
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pptr_kind_check CHECK (rule_kind IN ('exact_block','hourly')),
  CONSTRAINT pptr_window_check CHECK (window_end > window_start),
  CONSTRAINT pptr_price_check CHECK (price_chf > 0 AND extra_person_chf >= 0),
  CONSTRAINT pptr_persons_check CHECK (max_persons BETWEEN 1 AND 5),
  CONSTRAINT pptr_block_check CHECK (max_block_minutes IS NULL OR (rule_kind = 'hourly' AND max_block_minutes >= 60 AND max_block_minutes % 60 = 0)),
  CONSTRAINT pptr_hourly_whole_hours CHECK (rule_kind <> 'hourly' OR (extract(minute FROM window_start) = 0 AND extract(minute FROM window_end) = 0)),
  CONSTRAINT pptr_provenance_check CHECK (length(trim(provenance)) > 0),
  CONSTRAINT pptr_unique_window UNIQUE (product_id, rule_kind, window_start, window_end)
);
COMMENT ON TABLE public.product_private_tariff_rules IS
  'B07-P: authoritative product-configured private prices (exact blocks + hourly windows). Written only by save_product_private_tariff_rules.';

CREATE TABLE public.product_private_tariff_revisions (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
COMMENT ON TABLE public.product_private_tariff_revisions IS
  'B07-P: monotonically increasing tariff revision per product; quotes are bound to it.';

GRANT SELECT ON public.product_private_tariff_rules TO authenticated;
GRANT ALL ON public.product_private_tariff_rules TO service_role;
GRANT SELECT ON public.product_private_tariff_revisions TO authenticated;
GRANT ALL ON public.product_private_tariff_revisions TO service_role;
ALTER TABLE public.product_private_tariff_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_private_tariff_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read private tariff rules" ON public.product_private_tariff_rules
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read private tariff revisions" ON public.product_private_tariff_revisions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- The single resolver. Returns {ok,price,revision,mode,rule_ids} or {error:'tariff_unavailable',reason}.
-- Exact block wins only on an exact start AND end match; otherwise every whole hour must be covered by
-- exactly one hourly rule. No configuration => unavailable (never zero, never a global fallback).
CREATE OR REPLACE FUNCTION public.pa_product_quote(p_product uuid, p_date date, p_start time, p_end time,
  p_persons integer, p_office boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_rev int; v_min int; r record; v_n int; h int; v_total numeric := 0; v_ids jsonb := '[]'::jsonb;
  v_hs time; v_he_min int;
  fail CONSTANT text := 'tariff_unavailable';
BEGIN
  IF p_product IS NULL OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start
     OR p_persons IS NULL OR p_persons < 1 THEN
    RETURN jsonb_build_object('error', fail, 'reason', 'invalid_input');
  END IF;
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = p_product;
  IF v_rev IS NULL OR NOT EXISTS (SELECT 1 FROM public.product_private_tariff_rules WHERE product_id = p_product) THEN
    RETURN jsonb_build_object('error', fail, 'reason', 'not_configured');
  END IF;
  v_min := (extract(epoch FROM (p_end - p_start)) / 60)::int;

  SELECT count(*) INTO v_n FROM public.product_private_tariff_rules
   WHERE product_id = p_product AND rule_kind = 'exact_block' AND window_start = p_start AND window_end = p_end;
  IF v_n > 1 THEN RETURN jsonb_build_object('error', fail, 'reason', 'ambiguous'); END IF;
  IF v_n = 1 THEN
    SELECT * INTO r FROM public.product_private_tariff_rules
     WHERE product_id = p_product AND rule_kind = 'exact_block' AND window_start = p_start AND window_end = p_end;
    IF r.office_only AND NOT coalesce(p_office, false) THEN RETURN jsonb_build_object('error', fail, 'reason', 'office_only'); END IF;
    IF p_persons > r.max_persons THEN RETURN jsonb_build_object('error', fail, 'reason', 'persons_exceeded'); END IF;
    RETURN jsonb_build_object('ok', true, 'mode', 'exact_block', 'revision', v_rev,
      'price', r.price_chf + (p_persons - 1) * r.extra_person_chf, 'rule_ids', jsonb_build_array(r.id));
  END IF;

  IF extract(minute FROM p_start) <> 0 OR extract(second FROM p_start) <> 0
     OR extract(minute FROM p_end) <> 0 OR extract(second FROM p_end) <> 0 THEN
    RETURN jsonb_build_object('error', fail, 'reason', 'no_rule');
  END IF;
  FOR h IN extract(hour FROM p_start)::int .. extract(hour FROM p_end)::int - 1 LOOP
    v_hs := make_time(h, 0, 0); v_he_min := (h + 1) * 60;
    SELECT count(*) INTO v_n FROM public.product_private_tariff_rules x
     WHERE x.product_id = p_product AND x.rule_kind = 'hourly' AND x.window_start <= v_hs
       AND (extract(hour FROM x.window_end) * 60 + extract(minute FROM x.window_end)) >= v_he_min;
    IF v_n = 0 THEN RETURN jsonb_build_object('error', fail, 'reason', 'no_rule'); END IF;
    IF v_n > 1 THEN RETURN jsonb_build_object('error', fail, 'reason', 'ambiguous'); END IF;
    SELECT * INTO r FROM public.product_private_tariff_rules x
     WHERE x.product_id = p_product AND x.rule_kind = 'hourly' AND x.window_start <= v_hs
       AND (extract(hour FROM x.window_end) * 60 + extract(minute FROM x.window_end)) >= v_he_min;
    IF r.max_block_minutes IS NOT NULL AND v_min > r.max_block_minutes THEN
      RETURN jsonb_build_object('error', fail, 'reason', 'block_not_allowed');
    END IF;
    IF r.office_only AND NOT coalesce(p_office, false) THEN RETURN jsonb_build_object('error', fail, 'reason', 'office_only'); END IF;
    IF p_persons > r.max_persons THEN RETURN jsonb_build_object('error', fail, 'reason', 'persons_exceeded'); END IF;
    v_total := v_total + r.price_chf + (p_persons - 1) * r.extra_person_chf;
    IF NOT v_ids @> jsonb_build_array(r.id) THEN v_ids := v_ids || jsonb_build_array(r.id); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'mode', 'hourly', 'revision', v_rev, 'price', v_total, 'rule_ids', v_ids);
END $$;

-- Preview quote for a new office private booking (same resolver as create).
-- p: {product_id, persons, appointments:[{date,time_start,time_end}]}
CREATE OR REPLACE FUNCTION public.pa_create_quote(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_product uuid; v_persons int; v_appts jsonb := p->'appointments'; e jsonb; i int; v_q jsonb;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_rev int;
BEGIN
  BEGIN v_product := (p->>'product_id')::uuid; v_persons := (p->>'persons')::int;
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','product_id'); END;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product AND type = 'private') THEN
    RETURN jsonb_build_object('error','invalid','field','product_id');
  END IF;
  IF v_persons IS NULL OR v_persons < 1 OR v_persons > 4 THEN RETURN jsonb_build_object('error','invalid','field','persons'); END IF;
  IF jsonb_typeof(v_appts) <> 'array' OR jsonb_array_length(v_appts) = 0 OR jsonb_array_length(v_appts) > 60 THEN
    RETURN jsonb_build_object('error','invalid','field','appointments');
  END IF;
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = v_product;
  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i;
    BEGIN
      v_q := public.pa_product_quote(v_product, (e->>'date')::date, (e->>'time_start')::time, (e->>'time_end')::time, v_persons, true);
    EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','appointments','index',i); END;
    IF v_q ? 'error' THEN RETURN jsonb_build_object('error','tariff_unavailable','reason',v_q->>'reason','index',i); END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object('index', i, 'price', v_q->'price', 'mode', v_q->'mode'));
    v_total := v_total + (v_q->>'price')::numeric;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'revision', v_rev, 'items', v_items, 'total', v_total);
END $$;

-- Atomic, revision-checked replace of one product's rule set (staff via Edge Function only).
-- p_expected_revision: revision the editor loaded (0 when none existed). Mismatch => stale.
CREATE OR REPLACE FUNCTION public.save_product_private_tariff_rules(p_product uuid, p_expected_revision integer,
  p_rules jsonb, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cur int; e jsonb; a record; b record;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) > 48 THEN
    RETURN jsonb_build_object('error','invalid','field','rules');
  END IF;
  PERFORM 1 FROM public.products WHERE id = p_product AND type = 'private' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid','field','product_id'); END IF;
  SELECT revision INTO v_cur FROM public.product_private_tariff_revisions WHERE product_id = p_product FOR UPDATE;
  IF coalesce(v_cur, 0) <> coalesce(p_expected_revision, -1) THEN
    RETURN jsonb_build_object('error','stale','revision',coalesce(v_cur, 0));
  END IF;

  BEGIN
    DELETE FROM public.product_private_tariff_rules WHERE product_id = p_product;
    FOR e IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e->'price_chf') <> 'number'
         OR jsonb_typeof(e->'extra_person_chf') <> 'number' OR jsonb_typeof(e->'max_persons') <> 'number'
         OR (e ? 'max_block_minutes' AND jsonb_typeof(e->'max_block_minutes') NOT IN ('number','null'))
         OR (e ? 'office_only' AND jsonb_typeof(e->'office_only') <> 'boolean') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rule_shape';
      END IF;
      INSERT INTO public.product_private_tariff_rules (product_id, rule_kind, window_start, window_end, price_chf,
        extra_person_chf, max_persons, max_block_minutes, office_only, provenance, updated_by)
      VALUES (p_product, e->>'rule_kind', (e->>'window_start')::time, (e->>'window_end')::time,
        (e->>'price_chf')::numeric, (e->>'extra_person_chf')::numeric, (e->>'max_persons')::int,
        (e->>'max_block_minutes')::int, coalesce((e->>'office_only')::boolean, false), e->>'provenance', p_actor);
    END LOOP;
    -- Overlapping hourly windows would make the resolver ambiguous: refuse them at save time.
    SELECT x.window_start s1, y.window_start s2 INTO a FROM public.product_private_tariff_rules x
      JOIN public.product_private_tariff_rules y ON y.product_id = x.product_id AND y.id <> x.id
     WHERE x.product_id = p_product AND x.rule_kind = 'hourly' AND y.rule_kind = 'hourly'
       AND x.window_start < y.window_end AND y.window_start < x.window_end LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'overlapping_hourly'; END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '22007' OR SQLSTATE '22P02' OR SQLSTATE '22008'
              OR SQLSTATE '23514' OR SQLSTATE '23505' OR SQLSTATE '23502' THEN
    RETURN jsonb_build_object('error','invalid','field','rules','message',SQLERRM);
  END;

  INSERT INTO public.product_private_tariff_revisions (product_id, revision, updated_by)
  VALUES (p_product, coalesce(v_cur, 0) + 1, p_actor)
  ON CONFLICT (product_id) DO UPDATE SET revision = EXCLUDED.revision, updated_at = now(), updated_by = EXCLUDED.updated_by;
  RETURN jsonb_build_object('ok', true, 'revision', coalesce(v_cur, 0) + 1,
    'rules', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'updated_by' ORDER BY r.rule_kind, r.window_start)
                       FROM public.product_private_tariff_rules r WHERE r.product_id = p_product), '[]'::jsonb));
END $$;

-- pa_create_booking: body of migration 0007 (staff_guest_level.sql) + B07-P resolver; nothing else changed.
CREATE OR REPLACE FUNCTION public.pa_create_booking(p jsonb, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key text := p->>'submission_key';
  v_customer uuid := (p->>'customer_id')::uuid;
  v_product uuid := (p->>'product_id')::uuid;
  v_existing uuid; v_ticket uuid; v_number text; v_group uuid; v_persons int;
  v_appts jsonb := p->'appointments'; v_parts jsonb := p->'participants';
  v_conflicts jsonb := '[]'::jsonb; v_part_ids uuid[] := ARRAY[]::uuid[];
  v_guest_map jsonb := '{}'::jsonb; v_ids uuid[] := ARRAY[]::uuid[];
  e jsonb; e2 jsonb; i int; k int; v_pid uuid; v_aid uuid; v_price numeric; c record;
  d date; s time; t time; ins uuid; v_later boolean; v_unassigned date[] := ARRAY[]::date[];
  v_disc numeric; v_reason text := nullif(trim(coalesce(p->>'discount_reason','')),'');
  -- B07-P: product-configured tariff resolver state.
  v_rev int; v_q jsonb; v_quotes jsonb := '[]'::jsonb; v_err jsonb;
BEGIN
  IF v_key IS NULL OR length(v_key) < 8 THEN RETURN jsonb_build_object('error','invalid','field','submission_key'); END IF;
  IF p ? 'discount_percent' AND jsonb_typeof(p->'discount_percent') <> 'number' THEN
    RETURN jsonb_build_object('error','invalid','field','discount_percent');
  END IF;
  v_disc := coalesce((p->>'discount_percent')::numeric, 0);
  IF v_disc < 0 OR v_disc > 100 THEN RETURN jsonb_build_object('error','invalid','field','discount_percent'); END IF;
  IF v_disc > 0 AND v_reason IS NULL THEN RETURN jsonb_build_object('error','invalid','field','discount_reason'); END IF;
  IF v_disc = 0 THEN v_reason := NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pa_create:' || v_key));
  SELECT ticket_id INTO v_existing FROM public.private_appointment_submissions WHERE submission_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'ticket_id', v_existing,
      'ticket_number', (SELECT ticket_number FROM public.tickets WHERE id = v_existing),
      'appointment_ids', (SELECT to_jsonb(array_agg(id ORDER BY date, time_start)) FROM public.private_appointments WHERE ticket_id = v_existing AND submission_key = v_key),
      'total', (SELECT total_amount FROM public.tickets WHERE id = v_existing));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer) THEN RETURN jsonb_build_object('error','not_found','field','customer_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product AND type = 'private') THEN RETURN jsonb_build_object('error','invalid','field','product_id'); END IF;
  IF jsonb_typeof(v_appts) <> 'array' OR jsonb_array_length(v_appts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','appointments'); END IF;
  IF jsonb_typeof(v_parts) <> 'array' OR jsonb_array_length(v_parts) = 0 THEN RETURN jsonb_build_object('error','invalid','field','participants'); END IF;
  -- B07-P: the client must name the tariff revision it was shown; the row lock (FOR SHARE)
  -- makes a concurrent tariff save wait until this booking commits or rolls back.
  IF jsonb_typeof(p->'quote_revision') IS DISTINCT FROM 'number' THEN RETURN jsonb_build_object('error','invalid','field','quote_revision'); END IF;
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = v_product FOR SHARE;
  IF v_rev IS NULL THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','not_configured'); END IF;
  IF v_rev <> (p->>'quote_revision')::numeric THEN
    RETURN jsonb_build_object('error','quote_changed','quote',jsonb_build_object('revision',v_rev));
  END IF;

  PERFORM public.pa_lock_slots((SELECT coalesce(jsonb_agg(jsonb_build_object('instructor_id', x->>'instructor_id', 'date', x->>'date')), '[]'::jsonb)
                                  FROM jsonb_array_elements(v_appts) x));

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    -- "Später zuweisen": a NULL teacher is valid ONLY with explicit per-appointment intent,
    -- and never together with a teacher. A merely missing teacher stays invalid.
    v_later := coalesce(e->'assign_later' = 'true'::jsonb, false);
    IF e ? 'assign_later' AND jsonb_typeof(e->'assign_later') <> 'boolean' THEN v_later := NULL; END IF;
    IF d < public.pa_business_today() OR t <= s OR v_later IS NULL
       OR (ins IS NULL AND NOT v_later) OR (ins IS NOT NULL AND v_later) THEN
      RETURN jsonb_build_object('error','invalid','field','appointments','index',i);
    END IF;
    IF ins IS NULL THEN CONTINUE; END IF; -- unassigned: no teacher slot to check or lock
    FOR c IN SELECT * FROM public.pa_slot_conflicts(ins, d, s, t, NULL) LOOP
      v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind',c.kind,'ref_id',c.ref_id);
    END LOOP;
    FOR k IN 0 .. i - 1 LOOP
      e2 := v_appts->k;
      IF (e2->>'instructor_id')::uuid = ins AND (e2->>'date')::date = d
         AND (e2->>'time_start')::time < t AND (e2->>'time_end')::time > s THEN
        v_conflicts := v_conflicts || jsonb_build_object('index',i,'date',d,'kind','request','ref_id',NULL);
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_conflicts) > 0 THEN RETURN jsonb_build_object('error','conflict','conflicts',v_conflicts); END IF;

  BEGIN
  FOR i IN 0 .. jsonb_array_length(v_parts) - 1 LOOP
    e := v_parts->i;
    IF e ? 'participant_id' THEN
      SELECT id INTO v_pid FROM public.customer_participants WHERE id = (e->>'participant_id')::uuid AND customer_id = v_customer;
      IF v_pid IS NULL THEN RETURN jsonb_build_object('error','invalid','field','participants','index',i); END IF;
    ELSE
      IF coalesce(e->>'guest_key','') = '' OR coalesce(e->>'first_name','') = '' OR (e->>'birth_date') IS NULL THEN
        RETURN jsonb_build_object('error','invalid','field','participants','index',i);
      END IF;
      IF NOT public.staff_guest_level_ok(e->>'level', coalesce(e->>'sport','ski')) THEN
        RETURN jsonb_build_object('error','invalid','field','level','index',i);
      END IF;
      IF v_guest_map ? (e->>'guest_key') THEN
        v_pid := (v_guest_map->>(e->>'guest_key'))::uuid;
      ELSE
        SELECT id INTO v_pid FROM public.customer_participants
         WHERE customer_id = v_customer AND NOT is_archived AND merged_into_id IS NULL
           AND lower(trim(first_name)) = lower(trim(e->>'first_name'))
           AND lower(trim(coalesce(last_name,''))) = lower(trim(coalesce(e->>'last_name','')))
           AND birth_date = (e->>'birth_date')::date
         ORDER BY created_at LIMIT 1;
        IF v_pid IS NULL THEN
          INSERT INTO public.customer_participants (customer_id, first_name, last_name, birth_date, sport, level_current_season)
          VALUES (v_customer, trim(e->>'first_name'), nullif(trim(coalesce(e->>'last_name','')),''), (e->>'birth_date')::date, coalesce(e->>'sport','ski'), nullif(trim(coalesce(e->>'level','')),''))
          RETURNING id INTO v_pid;
        END IF;
        v_guest_map := v_guest_map || jsonb_build_object(e->>'guest_key', v_pid);
      END IF;
    END IF;
    IF NOT v_pid = ANY(v_part_ids) THEN v_part_ids := v_part_ids || v_pid; END IF;
  END LOOP;
  v_persons := cardinality(v_part_ids);

  -- B07-P: one authoritative product-configured price per appointment, before any booking write.
  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i;
    v_q := public.pa_product_quote(v_product, (e->>'date')::date, (e->>'time_start')::time, (e->>'time_end')::time, v_persons, true);
    IF v_q ? 'error' THEN
      v_err := jsonb_build_object('error','tariff_unavailable','reason',v_q->>'reason','index',i);
      RAISE EXCEPTION USING ERRCODE = 'PT001', MESSAGE = 'tariff_unavailable';
    END IF;
    v_quotes := v_quotes || jsonb_build_array(v_q);
  END LOOP;

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, participant_count, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, v_persons, p->>'notes')
  RETURNING id INTO v_ticket;
  INSERT INTO public.private_appointment_submissions (submission_key, ticket_id) VALUES (v_key, v_ticket);
  IF jsonb_array_length(v_appts) > 1 THEN v_group := gen_random_uuid(); END IF;

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    v_price := (v_quotes->i->>'price')::numeric;
    INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
    VALUES (v_ticket, d, s, t, ins, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, discount_percent, discount_reason, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, v_disc, v_reason, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, 'private', v_persons, v_group, v_aid);
    v_ids := v_ids || v_aid;
    IF ins IS NULL THEN v_unassigned := v_unassigned || d; END IF;
  END LOOP;

  PERFORM public.pa_recalc_ticket_total(v_ticket);
  -- Same disposition the legacy wizard created for "Später zuweisen", now in the same transaction.
  IF cardinality(v_unassigned) > 0 THEN
    INSERT INTO public.action_tasks (task_type, title, description, related_ticket_id, due_date, priority, status, created_by)
    VALUES ('assign_instructor', 'Skilehrer zuweisen',
            v_number || ' – ' || cardinality(v_unassigned) || ' Privatlektion(en) ohne Lehrperson',
            v_ticket, (SELECT min(x) FROM unnest(v_unassigned) x), 'high', 'pending', p_actor);
  END IF;
  PERFORM public.pa_emit_change(v_ticket, v_ids, 'created', p_actor,
    jsonb_build_object('persons', v_persons, 'discount_percent', v_disc, 'discount_reason', v_reason,
                       'unassigned', cardinality(v_unassigned)));
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'appointment_ids', to_jsonb(v_ids), 'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
    'tariff_revision', v_rev);
  EXCEPTION WHEN SQLSTATE 'PT001' THEN
    RETURN v_err; -- participants created by this attempt are rolled back with the subtransaction
  END;
END $$;

REVOKE ALL ON FUNCTION public.pa_product_quote(uuid, date, time, time, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_product_quote(uuid, date, time, time, integer, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pa_create_quote(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_create_quote(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.save_product_private_tariff_rules(uuid, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_private_tariff_rules(uuid, integer, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pa_create_booking(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_create_booking(jsonb, uuid) TO service_role;
