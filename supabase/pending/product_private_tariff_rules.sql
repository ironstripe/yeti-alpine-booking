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

-- B07-P2: same-day discount rule (singleton configuration row; values are data, never code).
-- Rule (Ivo): automatic discount when the SAME participant has >= threshold_minutes of booked private
-- teaching time (clock blocks) on the SAME date. Shared lessons: the lesson price is divided equally
-- among its actual participants for the discount calculation only; the discount applies to the
-- eligible people's shares. One canonical billing line per lesson stays.
CREATE TABLE public.private_lesson_discount_rule (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT pldr_singleton CHECK (id),
  percent numeric(5,2) NOT NULL CONSTRAINT pldr_percent CHECK (percent > 0 AND percent <= 100),
  threshold_minutes integer NOT NULL CONSTRAINT pldr_threshold CHECK (threshold_minutes > 0),
  scope text NOT NULL DEFAULT 'same_participant_same_day' CONSTRAINT pldr_scope CHECK (scope = 'same_participant_same_day'),
  shared_allocation text NOT NULL DEFAULT 'equal_share' CONSTRAINT pldr_alloc CHECK (shared_allocation = 'equal_share'),
  revision integer NOT NULL DEFAULT 1,
  provenance text NOT NULL CONSTRAINT pldr_provenance CHECK (length(trim(provenance)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
COMMENT ON TABLE public.private_lesson_discount_rule IS
  'B07-P2: automatic same-participant same-day private-lesson discount; revision bound into quotes.';
GRANT SELECT ON public.private_lesson_discount_rule TO authenticated;
GRANT ALL ON public.private_lesson_discount_rule TO service_role;
ALTER TABLE public.private_lesson_discount_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read private discount rule" ON public.private_lesson_discount_rule
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE OR REPLACE FUNCTION public.pldr_bump_revision() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.revision := OLD.revision + 1; NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_pldr_bump_revision BEFORE UPDATE ON public.private_lesson_discount_rule
  FOR EACH ROW EXECUTE FUNCTION public.pldr_bump_revision();

-- B07-P2: pricing provenance of appointments priced by product tariffs (marks them for edit/move guards).
CREATE TABLE public.private_appointment_pricing (
  appointment_id uuid PRIMARY KEY REFERENCES public.private_appointments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  tariff_revision integer NOT NULL,
  discount_rule_revision integer NOT NULL,
  gross_price numeric(10,2) NOT NULL,
  discount_source text NOT NULL CONSTRAINT pap_source CHECK (discount_source IN ('none','automatic','manual')),
  discount_percent numeric NOT NULL,
  discount_amount numeric(10,2) NOT NULL,
  persons integer NOT NULL,
  eligible_persons integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.private_appointment_pricing IS
  'B07-P2: immutable price/discount provenance per product-tariff-priced appointment (written by pa_create_booking only).';
GRANT SELECT ON public.private_appointment_pricing TO authenticated;
GRANT ALL ON public.private_appointment_pricing TO service_role;
ALTER TABLE public.private_appointment_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read private appointment pricing" ON public.private_appointment_pricing
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Pure calculator. p_slots: [{date,time_start,time_end,price,participants:[key,...]}] (index = position).
-- Order-invariant: depends only on per-person/day minute sums and per-slot counts.
-- discount_amount = round(price * eligible / persons * percent / 100, 2); discount_percent = amount/price*100.
CREATE OR REPLACE FUNCTION public.pa_same_day_discount(p_slots jsonb, p_percent numeric, p_threshold integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  WITH s AS (
    SELECT (o - 1)::int idx, (x->>'date')::date d,
           (extract(epoch FROM ((x->>'time_end')::time - (x->>'time_start')::time)) / 60)::int mins,
           (x->>'price')::numeric price, coalesce(x->'participants', '[]'::jsonb) parts
      FROM jsonb_array_elements(p_slots) WITH ORDINALITY t(x, o)),
  sp AS (SELECT DISTINCT s.idx, s.d, s.mins, v pid FROM s, jsonb_array_elements_text(s.parts) v),
  pd AS (SELECT pid, d, sum(mins) m FROM sp GROUP BY pid, d),
  per AS (
    SELECT s.idx, s.price, count(sp.pid)::int n, (count(sp.pid) FILTER (WHERE pd.m >= p_threshold))::int e
      FROM s LEFT JOIN sp ON sp.idx = s.idx LEFT JOIN pd ON pd.pid = sp.pid AND pd.d = sp.d
     GROUP BY s.idx, s.price),
  z AS (SELECT *, CASE WHEN n = 0 OR price <= 0 THEN 0::numeric ELSE round(price * e * p_percent / (n * 100.0), 2) END amt FROM per)
  SELECT coalesce(jsonb_agg(jsonb_build_object('index', idx, 'persons', n, 'eligible', e, 'discount_amount', amt,
           'discount_percent', CASE WHEN price > 0 THEN amt * 100 / price ELSE 0 END) ORDER BY idx), '[]'::jsonb) FROM z
$$;

-- Discount intent of a create/quote request. Explicit manual override (discount_override, or the legacy
-- non-zero discount_percent) REPLACES the automatic discount for every line of the request; it is never
-- added or compounded. Absent / default 0 => automatic. Explicit 0 is only {discount_override:{percent:0}}.
CREATE OR REPLACE FUNCTION public.pa_discount_intent(p jsonb, p_require_reason boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE o jsonb := p->'discount_override'; v_pct numeric; v_reason text;
BEGIN
  IF p ? 'discount_percent' AND jsonb_typeof(p->'discount_percent') <> 'number' THEN
    RETURN jsonb_build_object('error','invalid','field','discount_percent');
  END IF;
  IF o IS NOT NULL AND jsonb_typeof(o) <> 'null' THEN
    IF jsonb_typeof(o) <> 'object' OR jsonb_typeof(o->'percent') IS DISTINCT FROM 'number'
       OR coalesce((p->>'discount_percent')::numeric, 0) <> 0 THEN
      RETURN jsonb_build_object('error','invalid','field','discount_override');
    END IF;
    v_pct := (o->>'percent')::numeric; v_reason := nullif(trim(coalesce(o->>'reason','')),'');
  ELSIF coalesce((p->>'discount_percent')::numeric, 0) <> 0 THEN
    v_pct := (p->>'discount_percent')::numeric; v_reason := nullif(trim(coalesce(p->>'discount_reason','')),'');
  ELSE
    RETURN jsonb_build_object('mode','automatic');
  END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RETURN jsonb_build_object('error','invalid','field','discount_percent'); END IF;
  IF p_require_reason AND v_reason IS NULL THEN RETURN jsonb_build_object('error','invalid','field','discount_reason'); END IF;
  RETURN jsonb_build_object('mode','manual','percent',v_pct,'reason',v_reason);
END $$;

-- Shared pricing of a request: tariff per slot (pa_product_quote) + discount (rule or manual override).
-- p_slots: [{date,time_start,time_end,participants:[key]}]. Returns {ok, items[], gross_total, discount_total,
-- automatic_discount_total, total, discount_source, revision, discount_rule_revision} or an error object.
CREATE OR REPLACE FUNCTION public.pa_price_request(p_product uuid, p_slots jsonb, p_intent jsonb, p_office boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE i int; e jsonb; v_q jsonb; v_priced jsonb := '[]'::jsonb; v_rev int; dr record; v_auto jsonb;
  v_items jsonb := '[]'::jsonb; v_gross numeric := 0; v_disc numeric := 0; v_auto_total numeric := 0; v_net numeric := 0;
  v_price numeric; v_pct numeric; v_amt numeric; v_src text; v_n int; v_reason text;
BEGIN
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = p_product;
  FOR i IN 0 .. jsonb_array_length(p_slots) - 1 LOOP
    e := p_slots->i;
    BEGIN
      v_n := jsonb_array_length(e->'participants');
      v_q := public.pa_product_quote(p_product, (e->>'date')::date, (e->>'time_start')::time, (e->>'time_end')::time, v_n, p_office);
    EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','invalid','field','appointments','index',i); END;
    IF v_q ? 'error' THEN RETURN jsonb_build_object('error','tariff_unavailable','reason',v_q->>'reason','index',i); END IF;
    v_priced := v_priced || jsonb_build_array(e || jsonb_build_object('price', v_q->'price', 'mode', v_q->'mode'));
  END LOOP;
  SELECT * INTO dr FROM public.private_lesson_discount_rule WHERE id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','discount_rule_not_configured'); END IF;
  v_auto := public.pa_same_day_discount(v_priced, dr.percent, dr.threshold_minutes);
  FOR i IN 0 .. jsonb_array_length(v_priced) - 1 LOOP
    v_price := (v_priced->i->>'price')::numeric;
    v_auto_total := v_auto_total + (v_auto->i->>'discount_amount')::numeric;
    IF p_intent->>'mode' = 'manual' THEN
      v_pct := (p_intent->>'percent')::numeric; v_src := 'manual'; v_reason := p_intent->>'reason';
    ELSE
      v_pct := (v_auto->i->>'discount_percent')::numeric;
      v_src := CASE WHEN v_pct > 0 THEN 'automatic' ELSE 'none' END;
      v_reason := CASE WHEN v_pct > 0 THEN format('Automatischer Tagesrabatt %s%% (ab %s Min. pro Person und Tag): %s von %s Person(en)',
        trim_scale(dr.percent), dr.threshold_minutes, v_auto->i->>'eligible', v_auto->i->>'persons') END;
    END IF;
    -- Net mirrors the generated ticket_items.line_total exactly (quantity 1).
    v_amt := v_price - v_price * (1 - v_pct / 100);
    v_items := v_items || jsonb_build_array(jsonb_build_object('index', i, 'price', v_price, 'mode', v_priced->i->'mode',
      'persons', (v_auto->i->>'persons')::int, 'eligible', (v_auto->i->>'eligible')::int,
      'automatic_discount_amount', (v_auto->i->>'discount_amount')::numeric,
      'discount_source', v_src, 'discount_percent', v_pct, 'discount_reason', v_reason,
      'discount_amount', round(v_amt, 2), 'net', v_price * (1 - v_pct / 100)));
    v_gross := v_gross + v_price; v_disc := v_disc + v_amt; v_net := v_net + v_price * (1 - v_pct / 100);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'revision', v_rev, 'discount_rule_revision', dr.revision,
    'discount_rule', jsonb_build_object('percent', dr.percent, 'threshold_minutes', dr.threshold_minutes),
    'discount_source', CASE WHEN p_intent->>'mode' = 'manual' THEN 'manual' WHEN v_auto_total > 0 THEN 'automatic' ELSE 'none' END,
    'items', v_items, 'gross_total', v_gross, 'discount_total', round(v_disc, 2),
    'automatic_discount_total', v_auto_total, 'total', v_net);
END $$;

-- Preview quote for a new office private booking (same resolver + discount as create).
-- p: {product_id, persons, appointments:[{date,time_start,time_end}], discount_override?|discount_percent?}
-- Every person attends every appointment (same shape pa_create_booking writes).
CREATE OR REPLACE FUNCTION public.pa_create_quote(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_product uuid; v_persons int; v_appts jsonb := p->'appointments'; v_intent jsonb; v_parts jsonb; v_slots jsonb := '[]'::jsonb; i int;
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
  v_intent := public.pa_discount_intent(p, false);
  IF v_intent ? 'error' THEN RETURN v_intent; END IF;
  SELECT jsonb_agg('p' || g) INTO v_parts FROM generate_series(1, v_persons) g;
  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    IF jsonb_typeof(v_appts->i) <> 'object' THEN RETURN jsonb_build_object('error','invalid','field','appointments','index',i); END IF;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object('date', v_appts->i->'date', 'time_start', v_appts->i->'time_start',
      'time_end', v_appts->i->'time_end', 'participants', v_parts));
  END LOOP;
  RETURN public.pa_price_request(v_product, v_slots, v_intent, true);
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
  -- B07-P/P2: product-configured tariff resolver + discount state.
  v_rev int; v_drev int; v_intent jsonb; v_quote jsonb; v_slots jsonb := '[]'::jsonb; v_it jsonb; v_err jsonb;
BEGIN
  IF v_key IS NULL OR length(v_key) < 8 THEN RETURN jsonb_build_object('error','invalid','field','submission_key'); END IF;
  v_intent := public.pa_discount_intent(p, true);
  IF v_intent ? 'error' THEN RETURN v_intent; END IF;

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
  IF jsonb_typeof(p->'discount_rule_revision') IS DISTINCT FROM 'number' THEN RETURN jsonb_build_object('error','invalid','field','discount_rule_revision'); END IF;
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = v_product FOR SHARE;
  IF v_rev IS NULL THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','not_configured'); END IF;
  SELECT revision INTO v_drev FROM public.private_lesson_discount_rule WHERE id FOR SHARE;
  IF v_drev IS NULL THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','discount_rule_not_configured'); END IF;
  IF v_rev <> (p->>'quote_revision')::numeric OR v_drev <> (p->>'discount_rule_revision')::numeric THEN
    RETURN jsonb_build_object('error','quote_changed','quote',jsonb_build_object('revision',v_rev,'discount_rule_revision',v_drev));
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

  -- B07-P/P2: one authoritative product price + discount per appointment, before any booking write.
  -- All persons attend every appointment of this request (canonical single-item create); eligibility is
  -- aggregated per real participant and date over all slots of THIS request only.
  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object('date', e->'date', 'time_start', e->'time_start',
      'time_end', e->'time_end', 'participants', to_jsonb(v_part_ids::text[])));
  END LOOP;
  v_quote := public.pa_price_request(v_product, v_slots, v_intent, true);
  IF v_quote ? 'error' THEN
    v_err := v_quote;
    RAISE EXCEPTION USING ERRCODE = 'PT001', MESSAGE = 'tariff_unavailable';
  END IF;

  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, participant_count, notes)
  VALUES (v_number, v_customer, 'confirmed', 0, 0, 'office', p_actor, v_persons, p->>'notes')
  RETURNING id INTO v_ticket;
  INSERT INTO public.private_appointment_submissions (submission_key, ticket_id) VALUES (v_key, v_ticket);
  IF jsonb_array_length(v_appts) > 1 THEN v_group := gen_random_uuid(); END IF;

  FOR i IN 0 .. jsonb_array_length(v_appts) - 1 LOOP
    e := v_appts->i; d := (e->>'date')::date; s := (e->>'time_start')::time; t := (e->>'time_end')::time; ins := (e->>'instructor_id')::uuid;
    v_it := v_quote->'items'->i;
    v_price := (v_it->>'price')::numeric;
    INSERT INTO public.private_appointments (ticket_id, date, time_start, time_end, instructor_id, status, instructor_confirmation, meeting_point, period_group_id, price, submission_key)
    VALUES (v_ticket, d, s, t, ins, 'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, e->>'meeting_point', v_group, v_price, v_key)
    RETURNING id INTO v_aid;
    INSERT INTO public.private_appointment_participants (appointment_id, participant_id)
      SELECT v_aid, unnest(v_part_ids);
    INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, meeting_point,
      unit_price, quantity, discount_percent, discount_reason, status, instructor_confirmation, item_type, group_participant_count, period_group_id, appointment_id)
    VALUES (v_ticket, v_product, NULL, ins, d, s, t, e->>'meeting_point', v_price, 1, (v_it->>'discount_percent')::numeric, v_it->>'discount_reason',
      'booked', CASE WHEN ins IS NULL THEN NULL ELSE 'pending' END, 'private', v_persons, v_group, v_aid);
    INSERT INTO public.private_appointment_pricing (appointment_id, product_id, tariff_revision, discount_rule_revision, gross_price,
      discount_source, discount_percent, discount_amount, persons, eligible_persons)
    VALUES (v_aid, v_product, v_rev, v_drev, v_price, v_it->>'discount_source', (v_it->>'discount_percent')::numeric,
      (v_it->>'discount_amount')::numeric, (v_it->>'persons')::int, (v_it->>'eligible')::int);
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
    jsonb_build_object('persons', v_persons,
                       'discount_percent', CASE WHEN v_intent->>'mode' = 'manual' THEN (v_intent->>'percent')::numeric ELSE 0 END,
                       'discount_reason', CASE WHEN v_intent->>'mode' = 'manual' THEN v_intent->>'reason' END,
                       'discount_source', v_quote->>'discount_source', 'discount_total', v_quote->'discount_total',
                       'unassigned', cardinality(v_unassigned)));
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket, 'ticket_number', v_number,
    'appointment_ids', to_jsonb(v_ids), 'total', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
    'tariff_revision', v_rev, 'discount_rule_revision', v_drev, 'discount_source', v_quote->>'discount_source');
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
REVOKE ALL ON FUNCTION public.pa_same_day_discount(jsonb, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_same_day_discount(jsonb, numeric, integer) TO service_role;
REVOKE ALL ON FUNCTION public.pa_discount_intent(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_discount_intent(jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pa_price_request(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_price_request(uuid, jsonb, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pldr_bump_revision() FROM PUBLIC, anon, authenticated;

-- B07-P2 controlled transition (L1): move/period_update/edit still price with legacy pa_price.
-- For appointments priced by product tariffs (private_appointment_pricing row) every change that would
-- reprice or change discount eligibility is REFUSED (SQLSTATE YT001, whole transaction rolled back)
-- until the edit/move paths use pa_price_request. Teacher-only reassignment, notes, meeting point,
-- confirmation and status changes stay allowed. Legacy appointments (no pricing row) are unaffected.
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
CREATE TRIGGER trg_pa_tariff_transition_appt BEFORE UPDATE ON public.private_appointments
  FOR EACH ROW EXECUTE FUNCTION public.pa_tariff_transition_guard();
CREATE TRIGGER trg_pa_tariff_transition_item BEFORE UPDATE ON public.ticket_items
  FOR EACH ROW EXECUTE FUNCTION public.pa_tariff_transition_guard();
CREATE TRIGGER trg_pa_tariff_transition_parts BEFORE INSERT OR DELETE ON public.private_appointment_participants
  FOR EACH ROW EXECUTE FUNCTION public.pa_tariff_transition_guard();

-- pa_apply_slot: body of migration 0001 + one change: a product-tariff-priced appointment keeps its stored
-- price on a teacher-only change (legacy pa_price must never reprice it); a date/time change is refused.
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
REVOKE ALL ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_apply_slot(uuid, date, time, time, uuid) TO service_role;
