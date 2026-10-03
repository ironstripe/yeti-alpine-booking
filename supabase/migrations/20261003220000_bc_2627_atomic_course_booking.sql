-- #36 / #15: atomic, source-bound 26/27 website booking (REPOSITORY ONLY until owner applies).
-- Owner decision 2026-10-03: "Wir buchen ohne Limite" for GROUP courses -> no group
-- sales-capacity rejection anywhere; max_participants / group_capacity are planning
-- thresholds. Private lessons keep one consistently available instructor + overlap locks.
-- Does NOT activate products, change prices, touch imported bookings or send anything.
-- Rollback: supabase/rollback/bc_2627_atomic_course_booking_rollback.sql
CREATE OR REPLACE FUNCTION public.quote_bc_2627_product(
  p_product_id uuid,
  p_items jsonb,
  p_participants integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $quote$
DECLARE
  v_product record;
  v_item jsonb;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_day_count integer;
  v_item_count integer;
  v_expected_duration integer;
  v_rate numeric(10,2);
  v_tier numeric(10,2);
  v_source_count integer;
  v_capacity integer;
  v_series integer;
  v_first_week date;
  v_dates date[] := ARRAY[]::date[];
  v_morning integer;
  v_afternoon integer;
  v_day date;
  v_total numeric(10,2) := 0;
  v_source_ids text[] := ARRAY[]::text[];
  v_source_id text;
BEGIN
  IF p_participants IS NULL OR p_participants < 1 OR p_participants > 20
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid 26/27 quote input' USING ERRCODE='22023';
  END IF;

  SELECT p.id, p.type, p.discipline, p.duration_minutes,
         p.pricing_type, p.season_id, s.start_date, s.end_date
    INTO v_product
    FROM public.products p JOIN public.seasons s ON s.id=p.season_id
   WHERE p.id=p_product_id AND s.name='Winter 26/27'
     AND s.start_date=DATE '2026-12-01' AND s.end_date=DATE '2027-04-15';
  IF NOT FOUND OR v_product.type NOT IN ('private','group','group_toddler')
     OR NOT EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                    WHERE src.product_id=p_product_id AND src.import_status='draft') THEN
    RAISE EXCEPTION 'Product has no validated 26/27 price source' USING ERRCODE='22023';
  END IF;
  -- #36 / owner decision 2026-10-03 "Wir buchen ohne Limite": group courses have
  -- NO sales-capacity rejection. group_capacity stays a planning threshold only.
  IF v_product.type='private' AND p_participants>5 THEN
    RAISE EXCEPTION 'Private lessons allow at most 5 persons' USING ERRCODE='22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR COALESCE(v_item->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
       OR COALESCE(v_item->>'time_start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR COALESCE(v_item->>'time_end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid date or time in quote' USING ERRCODE='22023';
    END IF;
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'time_start')::time;
    v_end := (v_item->>'time_end')::time;
    IF v_date NOT BETWEEN v_product.start_date AND v_product.end_date OR v_end <= v_start THEN
      RAISE EXCEPTION 'Quote date outside season or invalid time' USING ERRCODE='22023';
    END IF;
    v_duration := EXTRACT(EPOCH FROM (v_end-v_start))::integer / 60;
    v_dates := array_append(v_dates, v_date);
    IF v_product.type='private' THEN
      IF v_start < TIME '09:00' OR v_end > TIME '16:00'
         OR v_duration NOT IN (60,120,180,240,300,360,420) THEN
        RAISE EXCEPTION 'Unsupported private duration or time' USING ERRCODE='22023';
      END IF;
      SELECT count(*), max(price_chf), max(source_id)
        INTO v_source_count, v_rate, v_source_id
        FROM public.bc_product_tariff_sources
       WHERE product_id=p_product_id AND import_status='draft'
         AND day_count=1 AND duration_minutes=v_duration
         AND persons_per_lesson=p_participants;
      IF v_source_count<>1 OR v_rate IS NULL OR v_rate<=0 THEN
        RAISE EXCEPTION 'No unique source private rate for duration/persons' USING ERRCODE='22023';
      END IF;
      v_total := v_total + v_rate;
      v_source_ids := array_append(v_source_ids,v_source_id);
    ELSE
      IF (v_start,v_end) NOT IN ((TIME '10:00',TIME '12:00'),(TIME '14:00',TIME '16:00')) THEN
        RAISE EXCEPTION 'Group slot must be 10-12 or 14-16' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;

  SELECT count(DISTINCT x) INTO v_day_count FROM unnest(v_dates) AS x;
  v_item_count := jsonb_array_length(p_items);
  IF v_product.type='private' THEN
    IF v_item_count<>v_day_count THEN
      RAISE EXCEPTION 'Duplicate private day' USING ERRCODE='22023';
    END IF;
  ELSE
    v_expected_duration := v_product.duration_minutes;
    IF v_expected_duration NOT IN (120,240) OR v_day_count NOT BETWEEN 1 AND 5
       OR v_item_count<>v_day_count * (v_expected_duration/120) THEN
      RAISE EXCEPTION 'Wrong group day count or duration' USING ERRCODE='22023';
    END IF;
    v_first_week := date_trunc('week',v_dates[1])::date;
    FOR v_day IN SELECT DISTINCT x FROM unnest(v_dates) x LOOP
      SELECT count(*) FILTER (WHERE (i->>'time_start')='10:00' AND (i->>'time_end')='12:00'),
             count(*) FILTER (WHERE (i->>'time_start')='14:00' AND (i->>'time_end')='16:00')
        INTO v_morning,v_afternoon
        FROM jsonb_array_elements(p_items) AS i WHERE (i->>'date')::date=v_day;
      IF (v_expected_duration=240 AND (v_morning<>1 OR v_afternoon<>1))
         OR (v_expected_duration=120 AND v_morning+v_afternoon<>1) THEN
        RAISE EXCEPTION 'Missing or duplicate group time block' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.bc_product_tariff_sources s
                WHERE s.product_id=p_product_id AND s.source_family='Samstagkurs') THEN
      -- Both series contain five concrete Saturdays; never mix them.
      v_series := CASE WHEN v_dates[1] BETWEEN DATE '2027-01-09' AND DATE '2027-02-06' THEN 1
                       WHEN v_dates[1] BETWEEN DATE '2027-02-20' AND DATE '2027-03-20' THEN 2
                       ELSE 0 END;
      IF v_series=0 OR EXISTS (
          SELECT 1 FROM unnest(v_dates) d
          WHERE EXTRACT(ISODOW FROM d)<>6 OR (v_series=1 AND d NOT BETWEEN DATE '2027-01-09' AND DATE '2027-02-06')
            OR (v_series=2 AND d NOT BETWEEN DATE '2027-02-20' AND DATE '2027-03-20')
      ) THEN
        RAISE EXCEPTION 'Saturday dates must belong to one of the two series' USING ERRCODE='22023';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM unnest(v_dates) d WHERE EXTRACT(ISODOW FROM d)>5 OR date_trunc('week',d)::date<>v_first_week) THEN
      RAISE EXCEPTION 'Weekday group dates must be in one Mon-Fri week' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(cumulative_price) INTO v_source_count,v_tier
      FROM public.product_price_tiers
     WHERE product_id=p_product_id AND day_count=v_day_count;
    IF v_source_count<>1 OR v_tier IS NULL OR v_tier<=0 THEN
      RAISE EXCEPTION 'Missing exact day tier; no fallback/extrapolation' USING ERRCODE='22023';
    END IF;
    SELECT count(*), max(source_id) INTO v_source_count,v_source_id
      FROM public.bc_product_tariff_sources
     WHERE product_id=p_product_id AND import_status='draft'
       AND day_count=v_day_count AND duration_minutes=v_expected_duration
       AND persons_per_lesson=1 AND price_chf=v_tier;
    IF v_source_count<>1 THEN
      RAISE EXCEPTION 'Price tier does not match unique Booking source tariff' USING ERRCODE='22023';
    END IF;
    v_source_ids := ARRAY[v_source_id];
    v_total := v_tier * p_participants;
  END IF;
  IF v_total<=0 THEN RAISE EXCEPTION 'Zero price is not a booking quote' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('total_amount',v_total,'currency','CHF','participant_count',p_participants,
    'product_id',p_product_id,'day_count',v_day_count,'source_tariff_ids',v_source_ids,
    'quote_version','bc-2627-exact-v2-unlimited-group');
END;
$quote$;
REVOKE ALL ON FUNCTION public.quote_bc_2627_product(uuid,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_bc_2627_product(uuid,jsonb,integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Immutable server quote/source snapshot per website reservation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bc_2627_reservations (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  quote_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bc_2627_reservations TO service_role;
GRANT SELECT ON public.bc_2627_reservations TO authenticated;
ALTER TABLE public.bc_2627_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read bc 26/27 reservation snapshots" ON public.bc_2627_reservations;
CREATE POLICY "Staff read bc 26/27 reservation snapshots" ON public.bc_2627_reservations
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.bc_2627_reservation_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'bc_2627_reservations snapshot is immutable' USING ERRCODE='55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_bc_2627_reservation_immutable ON public.bc_2627_reservations;
CREATE TRIGGER trg_bc_2627_reservation_immutable
  BEFORE UPDATE ON public.bc_2627_reservations
  FOR EACH ROW EXECUTE FUNCTION public.bc_2627_reservation_immutable();

-- Invoice delivery rows share the durable delivery table (one row per ticket+kind).
ALTER TABLE public.booking_email_deliveries DROP CONSTRAINT IF EXISTS booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries ADD CONSTRAINT booking_email_deliveries_kind_check
  CHECK (kind IN ('booking_confirmation','invoice'));

CREATE OR REPLACE FUNCTION public.bc_2627_err(p_code text, p_message text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('status','error','code',p_code,'message',p_message)
$$;

CREATE OR REPLACE FUNCTION public.bc_2627_age_at(p_birth date, p_on date)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT EXTRACT(YEAR FROM age(p_on, p_birth))::int
$$;

-- ---------------------------------------------------------------------------
-- Read-only course options. Only source-bound periods whose product is active,
-- website-visible, linked as an eligible variant and has validated tiers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_course_options(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  r record;
  v record;
  v_tiers jsonb;
  v_instances jsonb;
  v_cancelled date[];
  v_dates date[];
BEGIN
  FOR r IN
    SELECT ps.source_key, ps.course_id, ps.training_group_id, ps.teaching_dates, ps.eligible_variants,
           c.name, c.discipline, c.skill_level_id, c.min_age, c.max_age, c.max_participants, c.course_type
      FROM public.bc_2627_course_period_sources ps
      JOIN public.group_courses c ON c.id=ps.course_id
     WHERE (p_to IS NULL OR ps.teaching_dates[1] <= p_to)
       AND (p_from IS NULL OR ps.teaching_dates[array_length(ps.teaching_dates,1)] >= p_from)
     ORDER BY ps.teaching_dates[1], c.name
  LOOP
    SELECT COALESCE(array_agg(d.date), ARRAY[]::date[]) INTO v_cancelled
      FROM public.training_course_dates d
     WHERE d.training_id=r.course_id AND d.is_cancelled IS TRUE AND d.date = ANY(r.teaching_dates);
    v_dates := ARRAY(SELECT x FROM unnest(r.teaching_dates) x WHERE NOT x = ANY(v_cancelled) ORDER BY x);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('instance_id',gi.id,'date',gi.date,
             'time_start',to_char(gi.start_time,'HH24:MI'),'time_end',to_char(gi.end_time,'HH24:MI'))
             ORDER BY gi.date, gi.start_time),'[]'::jsonb)
      INTO v_instances
      FROM public.group_course_instances gi
     WHERE gi.course_id=r.course_id AND gi.date = ANY(v_dates)
       AND COALESCE(gi.status,'scheduled') NOT IN ('cancelled','storno')
       AND gi.id IN (SELECT md5('malbun-2627:instance:'||r.source_key||':'||d::text||':'||b)::uuid
                       FROM unnest(v_dates) d, unnest(ARRAY['10:00-12:00','14:00-16:00']) b);
    FOR v IN
      SELECT p.id, p.name, p.type, p.duration_minutes, p.min_age, p.max_age,
             ARRAY(SELECT x::int FROM jsonb_array_elements_text(r.eligible_variants->p.id::text) x) AS period_days,
             cpv.eligible_day_counts
        FROM public.products p
        JOIN public.bc_2627_course_product_variants cpv ON cpv.product_id=p.id AND cpv.course_id=r.course_id
       WHERE r.eligible_variants ? p.id::text
         AND p.is_active IS TRUE AND p.show_on_website IS TRUE
         AND p.type IN ('group','group_toddler')
         AND p.name NOT ILIKE '%carving%'
         AND p.duration_minutes IN (120,240)
    LOOP
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day_count',t.day_count,'price',t.cumulative_price,
               'source_tariff_id',src.source_id) ORDER BY t.day_count),'[]'::jsonb)
        INTO v_tiers
        FROM public.product_price_tiers t
        JOIN public.bc_product_tariff_sources src
          ON src.product_id=t.product_id AND src.import_status='draft' AND src.day_count=t.day_count
         AND src.duration_minutes=v.duration_minutes AND src.persons_per_lesson=1
         AND src.price_chf=t.cumulative_price
       WHERE t.product_id=v.id AND t.cumulative_price>0
         AND t.day_count = ANY(v.period_days) AND t.day_count = ANY(v.eligible_day_counts)
         AND t.day_count <= COALESCE(array_length(v_dates,1),0);
      IF jsonb_array_length(v_tiers)=0 OR jsonb_array_length(v_instances)=0 THEN CONTINUE; END IF;
      v_out := v_out || jsonb_build_object(
        'period_key',r.source_key,'course_id',r.course_id,'course_name',r.name,
        'course_type',r.course_type,'discipline',r.discipline,'skill_level_id',r.skill_level_id,
        'age_min',r.min_age,'age_max',r.max_age,'teaching_dates',to_jsonb(v_dates),
        'cancelled_dates',to_jsonb(v_cancelled),'instances',v_instances,
        'product_id',v.id,'product_name',v.name,'duration_minutes',v.duration_minutes,
        'blocks',CASE WHEN v.duration_minutes=240 THEN '["10:00-12:00+14:00-16:00"]'::jsonb
                      ELSE (SELECT COALESCE(jsonb_agg(DISTINCT x->>'time_start'||'-'||(x->>'time_end')),'[]'::jsonb)
                              FROM jsonb_array_elements(v_instances) x) END,
        'lunch_included',false,
        'tiers',v_tiers,
        -- planning threshold only; never used to refuse a group booking
        'planning_threshold',r.max_participants,
        'bookable',true);
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('status','success','quote_version','bc-2627-exact-v2-unlimited-group',
    'informational',jsonb_build_array(jsonb_build_object('product','Carving','bookable',false,
      'reason','Betriebsdaten noch nicht freigegeben')),
    'options',v_out);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_course_options(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_course_options(date,date) TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic reservation (hold). Validates every selection before any write.
-- Payload:
--  { idempotency_key, source?, hold_minutes?, notes?,
--    participants: [{ref, birth_date, discipline, skill_level}],
--    selections: [ {kind:'group', participant_ref, period_key, product_id, dates:[..], block?}
--                | {kind:'private', participant_refs:[..], product_id,
--                   items:[{date,time_start,time_end}]} ] }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_reserve(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_key text := p_payload->>'idempotency_key';
  v_hash text := md5(p_payload::text);
  v_existing record;
  v_hold int := COALESCE((p_payload->>'hold_minutes')::int, 20);
  v_source text := COALESCE(p_payload->>'source','website');
  v_people jsonb := p_payload->'participants';
  v_sels jsonb := p_payload->'selections';
  v_p jsonb; v_s jsonb; v_it jsonb;
  v_refs text[] := ARRAY[]::text[];
  v_ref text;
  v_period record; v_course record; v_product record;
  v_dates date[]; v_d date; v_b text; v_blocks text[];
  v_days int; v_allowed int[];
  v_inst uuid; v_instance_ids uuid[];
  v_items jsonb; v_quote jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_total numeric(10,2) := 0;
  v_birth date; v_age int;
  v_season uuid;
  v_ticket_id uuid; v_ticket_number text; v_token text; v_expires timestamptz;
  v_item_id uuid;
  v_instructor uuid;
  v_prefs text[];
  v_line_prices numeric[];
  v_i int;
  v_snapshot jsonb;
  v_lines_out jsonb := '[]'::jsonb;
BEGIN
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 128 THEN
    RETURN public.bc_2627_err('invalid_input','idempotency_key (8-128 Zeichen) fehlt');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bc2627-reserve:'||v_key,0));
  SELECT r.*, t.ticket_number, t.reservation_token, t.reservation_expires_at, t.total_amount, t.status
    INTO v_existing
    FROM public.bc_2627_reservations r JOIN public.tickets t ON t.id=r.ticket_id
   WHERE r.idempotency_key=v_key;
  IF FOUND THEN
    IF v_existing.request_hash<>v_hash THEN
      RETURN public.bc_2627_err('idempotency_conflict','Gleicher Schlüssel mit anderem Inhalt');
    END IF;
    RETURN jsonb_build_object('status','success','replayed',true,'ticket_id',v_existing.ticket_id,
      'ticket_number',v_existing.ticket_number,'reservation_token',v_existing.reservation_token,
      'reservation_expires_at',v_existing.reservation_expires_at,'total_amount',v_existing.total_amount,
      'ticket_status',v_existing.status,'quote',v_existing.quote_snapshot);
  END IF;

  IF v_hold NOT BETWEEN 5 AND 60 OR v_source NOT IN ('website','vapi') THEN
    RETURN public.bc_2627_err('invalid_input','hold_minutes/source ungültig');
  END IF;
  IF jsonb_typeof(v_people)<>'array' OR jsonb_array_length(v_people) NOT BETWEEN 1 AND 20
     OR jsonb_typeof(v_sels)<>'array' OR jsonb_array_length(v_sels) NOT BETWEEN 1 AND 40 THEN
    RETURN public.bc_2627_err('invalid_input','participants (1-20) und selections (1-40) erforderlich');
  END IF;
  FOR v_p IN SELECT value FROM jsonb_array_elements(v_people) LOOP
    IF COALESCE(v_p->>'ref','')='' OR v_p->>'ref' = ANY(v_refs)
       OR COALESCE(v_p->>'birth_date','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR COALESCE(v_p->>'discipline','') NOT IN ('ski','snowboard')
       OR COALESCE(v_p->>'skill_level','')='' THEN
      RETURN public.bc_2627_err('invalid_participant','Teilnehmende brauchen ref, Geburtsdatum, Disziplin und Niveau');
    END IF;
    BEGIN v_birth := (v_p->>'birth_date')::date;
    EXCEPTION WHEN others THEN RETURN public.bc_2627_err('invalid_participant','Ungültiges Geburtsdatum'); END;
    IF v_birth > CURRENT_DATE THEN RETURN public.bc_2627_err('invalid_participant','Geburtsdatum in der Zukunft'); END IF;
    v_refs := v_refs || (v_p->>'ref');
  END LOOP;

  SELECT id INTO v_season FROM public.seasons
   WHERE name='Winter 26/27' AND start_date=DATE '2026-12-01' AND end_date=DATE '2027-04-15';
  IF v_season IS NULL THEN RETURN public.bc_2627_err('season_unavailable','Saison 26/27 fehlt'); END IF;

  -- ---------- Phase 1: validate + quote everything, no writes ----------
  BEGIN
    FOR v_s IN SELECT value FROM jsonb_array_elements(v_sels) LOOP
      SELECT * INTO v_product FROM public.products WHERE id=(v_s->>'product_id')::uuid;
      IF NOT FOUND OR v_product.is_active IS NOT TRUE OR v_product.show_on_website IS NOT TRUE
         OR v_product.season_id<>v_season OR v_product.name ILIKE '%carving%' THEN
        RAISE EXCEPTION 'product_unavailable: Produkt nicht buchbar';
      END IF;

      IF COALESCE(v_s->>'kind','group')='group' THEN
        IF v_product.type NOT IN ('group','group_toddler') THEN
          RAISE EXCEPTION 'invalid_selection: Kein Gruppenkursprodukt';
        END IF;
        v_ref := v_s->>'participant_ref';
        IF NOT v_ref = ANY(v_refs) THEN RAISE EXCEPTION 'invalid_selection: Unbekannte participant_ref'; END IF;
        SELECT * INTO v_period FROM public.bc_2627_course_period_sources WHERE source_key=v_s->>'period_key';
        IF NOT FOUND THEN RAISE EXCEPTION 'course_unavailable: Kursperiode unbekannt'; END IF;
        SELECT * INTO v_course FROM public.group_courses WHERE id=v_period.course_id;
        IF NOT (v_period.eligible_variants ? v_product.id::text) THEN
          RAISE EXCEPTION 'course_unavailable: Produkt nicht mit Kurs verknüpft';
        END IF;
        SELECT cpv.eligible_day_counts INTO v_allowed FROM public.bc_2627_course_product_variants cpv
         WHERE cpv.course_id=v_course.id AND cpv.product_id=v_product.id;
        IF v_allowed IS NULL THEN RAISE EXCEPTION 'course_unavailable: Produktvariante fehlt'; END IF;
        IF jsonb_typeof(v_s->'dates')<>'array' THEN RAISE EXCEPTION 'invalid_dates: dates fehlt'; END IF;
        BEGIN
          v_dates := ARRAY(SELECT x::date FROM jsonb_array_elements_text(v_s->'dates') x ORDER BY 1);
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_dates: Ungültiges Datum'; END;
        v_days := COALESCE(array_length(v_dates,1),0);
        IF v_days=0 OR v_days<>(SELECT count(DISTINCT x) FROM unnest(v_dates) x) THEN
          RAISE EXCEPTION 'invalid_dates: Leere oder doppelte Kursdaten';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_dates) x WHERE NOT x = ANY(v_period.teaching_dates)) THEN
          RAISE EXCEPTION 'invalid_dates: Datum gehört nicht zur Kursperiode';
        END IF;
        IF EXISTS (SELECT 1 FROM public.training_course_dates d WHERE d.training_id=v_course.id
                    AND d.date = ANY(v_dates) AND d.is_cancelled IS TRUE) THEN
          RAISE EXCEPTION 'invalid_dates: Kurstag abgesagt';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_dates) x WHERE x < CURRENT_DATE) THEN
          RAISE EXCEPTION 'invalid_dates: Datum in der Vergangenheit';
        END IF;
        IF NOT (v_days = ANY(v_allowed))
           OR NOT (v_days = ANY(ARRAY(SELECT x::int FROM jsonb_array_elements_text(v_period.eligible_variants->v_product.id::text) x))) THEN
          RAISE EXCEPTION 'tier_unavailable: Kein Tarif für % Tage', v_days;
        END IF;
        IF v_product.duration_minutes=240 THEN
          v_blocks := ARRAY['10:00-12:00','14:00-16:00'];
        ELSIF v_product.duration_minutes=120 THEN
          IF v_s->>'block' IS NOT NULL THEN
            v_blocks := ARRAY[v_s->>'block'];
          ELSE
            v_blocks := ARRAY(SELECT DISTINCT to_char(gi.start_time,'HH24:MI')||'-'||to_char(gi.end_time,'HH24:MI')
                                FROM public.group_course_instances gi
                               WHERE gi.id IN (SELECT md5('malbun-2627:instance:'||v_period.source_key||':'||d::text||':'||b)::uuid
                                                 FROM unnest(v_dates) d, unnest(ARRAY['10:00-12:00','14:00-16:00']) b));
            IF array_length(v_blocks,1)<>1 THEN RAISE EXCEPTION 'invalid_selection: block (10:00-12:00 oder 14:00-16:00) wählen'; END IF;
          END IF;
          IF NOT v_blocks[1] IN ('10:00-12:00','14:00-16:00') THEN RAISE EXCEPTION 'invalid_selection: Ungültiger Block'; END IF;
        ELSE
          RAISE EXCEPTION 'product_unavailable: Unbekannte Produktdauer';
        END IF;
        v_instance_ids := ARRAY[]::uuid[]; v_items := '[]'::jsonb;
        FOREACH v_d IN ARRAY v_dates LOOP
          FOREACH v_b IN ARRAY v_blocks LOOP
            SELECT gi.id INTO v_inst FROM public.group_course_instances gi
             WHERE gi.id=md5('malbun-2627:instance:'||v_period.source_key||':'||v_d::text||':'||v_b)::uuid
               AND gi.course_id=v_course.id AND gi.date=v_d
               AND COALESCE(gi.status,'scheduled') NOT IN ('cancelled','storno');
            IF v_inst IS NULL THEN RAISE EXCEPTION 'invalid_dates: Kein Kursblock % %', v_d, v_b; END IF;
            v_instance_ids := v_instance_ids || v_inst;
            v_items := v_items || jsonb_build_object('date',v_d,'time_start',split_part(v_b,'-',1),'time_end',split_part(v_b,'-',2));
          END LOOP;
        END LOOP;
        SELECT value INTO v_p FROM jsonb_array_elements(v_people) WHERE value->>'ref'=v_ref;
        IF v_p->>'discipline'<>v_course.discipline THEN RAISE EXCEPTION 'invalid_level: Disziplin passt nicht zum Kurs'; END IF;
        IF v_p->>'skill_level' IS DISTINCT FROM v_course.skill_level_id THEN
          RAISE EXCEPTION 'invalid_level: Niveau passt nicht zum Kurs';
        END IF;
        v_birth := (v_p->>'birth_date')::date;
        FOREACH v_d IN ARRAY v_dates LOOP
          v_age := public.bc_2627_age_at(v_birth, v_d);
          IF v_age < v_course.min_age OR v_age > v_course.max_age
             OR (v_product.min_age IS NOT NULL AND v_age < v_product.min_age)
             OR (v_product.max_age IS NOT NULL AND v_age > v_product.max_age) THEN
            RAISE EXCEPTION 'invalid_age: Alter % am % ausserhalb %-%', v_age, v_d, v_course.min_age, v_course.max_age;
          END IF;
        END LOOP;
        v_quote := public.quote_bc_2627_product(v_product.id, v_items, 1);
        v_lines := v_lines || jsonb_build_object('kind','group','participant_ref',v_ref,
          'period_key',v_period.source_key,'course_id',v_course.id,'course_name',v_course.name,
          'training_group_id',v_period.training_group_id,'product_id',v_product.id,
          'dates',to_jsonb(v_dates),'blocks',to_jsonb(v_blocks),'instance_ids',to_jsonb(v_instance_ids),
          'skill_level',v_course.skill_level_id,'quote',v_quote,
          'source_sha256',v_period.source_sha256,'tariff_source_ids',to_jsonb(v_period.tariff_source_ids));
        v_total := v_total + (v_quote->>'total_amount')::numeric;

      ELSIF v_s->>'kind'='private' THEN
        IF v_product.type<>'private' THEN RAISE EXCEPTION 'invalid_selection: Kein Privatunterrichtsprodukt'; END IF;
        IF jsonb_typeof(v_s->'participant_refs')<>'array' OR jsonb_array_length(v_s->'participant_refs') NOT BETWEEN 1 AND 5
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_s->'participant_refs') x WHERE NOT x = ANY(v_refs)) THEN
          RAISE EXCEPTION 'invalid_selection: participant_refs ungültig';
        END IF;
        IF jsonb_typeof(v_s->'items')<>'array' OR jsonb_array_length(v_s->'items')=0 THEN
          RAISE EXCEPTION 'invalid_dates: items fehlt';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_s->'items') i WHERE (i->>'date')::date < CURRENT_DATE) THEN
          RAISE EXCEPTION 'invalid_dates: Datum in der Vergangenheit';
        END IF;
        v_quote := public.quote_bc_2627_product(v_product.id, v_s->'items', jsonb_array_length(v_s->'participant_refs'));
        v_line_prices := ARRAY[]::numeric[];
        FOR v_it IN SELECT value FROM jsonb_array_elements(v_s->'items') LOOP
          v_line_prices := v_line_prices || (public.quote_bc_2627_product(v_product.id, jsonb_build_array(v_it),
                             jsonb_array_length(v_s->'participant_refs'))->>'total_amount')::numeric;
        END LOOP;
        IF (SELECT sum(x) FROM unnest(v_line_prices) x) <> (v_quote->>'total_amount')::numeric THEN
          RAISE EXCEPTION 'tier_unavailable: Privatpreis nicht eindeutig';
        END IF;
        v_lines := v_lines || jsonb_build_object('kind','private','participant_refs',v_s->'participant_refs',
          'product_id',v_product.id,'discipline',v_product.discipline,'items',v_s->'items',
          'line_prices',to_jsonb(v_line_prices),'quote',v_quote);
        v_total := v_total + (v_quote->>'total_amount')::numeric;
      ELSE
        RAISE EXCEPTION 'invalid_selection: kind muss group oder private sein';
      END IF;
    END LOOP;
  EXCEPTION WHEN others THEN
    RETURN public.bc_2627_err(
      CASE WHEN SQLERRM ~ '^[a-z_]+: ' THEN split_part(SQLERRM,':',1)
           WHEN SQLSTATE='22023' THEN 'quote_rejected' ELSE 'invalid_selection' END,
      SQLERRM);
  END;

  IF EXISTS (SELECT 1 FROM unnest(v_refs) r WHERE NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_lines) l
        WHERE l->>'participant_ref'=r OR (l->'participant_refs') ? r)) THEN
    RETURN public.bc_2627_err('invalid_selection','Jede teilnehmende Person braucht eine Auswahl');
  END IF;
  IF v_total<=0 THEN RETURN public.bc_2627_err('quote_rejected','Gesamtpreis 0'); END IF;

  -- ---------- Phase 2: writes (single transaction; any error rolls back all) ----------
  v_ticket_number := public.generate_ticket_number();
  v_token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  v_expires := now() + make_interval(mins => v_hold);
  INSERT INTO public.tickets(ticket_number,customer_id,status,notes,ticket_type,source,total_amount,
                             paid_amount,reservation_expires_at,reservation_token,participant_count,season_id)
  VALUES (v_ticket_number,NULL,'provisional',NULLIF(left(p_payload->>'notes',2000),''),'standard',v_source,
          v_total,0,v_expires,v_token,jsonb_array_length(v_people),v_season)
  RETURNING id INTO v_ticket_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    IF v_line->>'kind'='group' THEN
      -- One priced line per participant+selection (price once); enrollments for
      -- every booked instance are created at confirmation. No instructor here.
      INSERT INTO public.ticket_items(ticket_id,product_id,participant_id,instructor_id,date,end_date,
          time_start,time_end,unit_price,quantity,line_total,item_type,status,group_name,skill_level,
          group_participant_count,internal_notes)
      VALUES (v_ticket_id,(v_line->>'product_id')::uuid,NULL,NULL,
          (v_line->'dates'->>0)::date,(v_line->'dates'->>(jsonb_array_length(v_line->'dates')-1))::date,
          split_part(v_line->'blocks'->>0,'-',1)::time,
          split_part(v_line->'blocks'->>(jsonb_array_length(v_line->'blocks')-1),'-',2)::time,
          (v_line->'quote'->>'total_amount')::numeric,1,(v_line->'quote'->>'total_amount')::numeric,
          'group_course','booked',v_line->>'course_name',v_line->>'skill_level',1,
          'bc2627:'||(v_line->>'period_key'))
      RETURNING id INTO v_item_id;
      v_lines_out := v_lines_out || (v_line || jsonb_build_object('ticket_item_ids',jsonb_build_array(v_item_id)));
    ELSE
      -- One consistently available instructor for all lessons of this selection.
      PERFORM pg_advisory_xact_lock(hashtextextended('bc2627-private-day:'||d,0))
         FROM (SELECT DISTINCT (i->>'date') d FROM jsonb_array_elements(v_line->'items') i ORDER BY 1) x;
      SELECT ins.id INTO v_instructor
        FROM public.instructors ins
       WHERE ins.status='active'
         AND (v_line->>'discipline' IS NULL OR ins.roles && ARRAY[v_line->>'discipline'])
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_line->'items') i
            WHERE EXISTS (SELECT 1 FROM public.ticket_items ti JOIN public.tickets t ON t.id=ti.ticket_id
                           WHERE ti.instructor_id=ins.id AND ti.date=(i->>'date')::date
                             AND ti.time_start<(i->>'time_end')::time AND ti.time_end>(i->>'time_start')::time
                             AND COALESCE(ti.status,'') NOT IN ('cancelled','storno')
                             AND COALESCE(t.status,'') NOT IN ('cancelled','storno','expired')
                             AND NOT (t.status IN ('provisional','payment_pending') AND t.finalized_at IS NULL
                                      AND t.reservation_expires_at < now()))
               OR EXISTS (SELECT 1 FROM public.private_appointments pa
                           WHERE pa.instructor_id=ins.id AND pa.date=(i->>'date')::date
                             AND pa.time_start<(i->>'time_end')::time AND pa.time_end>(i->>'time_start')::time
                             AND COALESCE(pa.status,'') NOT IN ('cancelled','storno'))
               OR EXISTS (SELECT 1 FROM public.instructor_absences a
                           WHERE a.instructor_id=ins.id
                             AND COALESCE(a.status,'pending') NOT IN ('rejected','declined','cancelled','abgelehnt')
                             AND a.start_date<=(i->>'date')::date AND a.end_date>=(i->>'date')::date
                             AND (COALESCE(a.is_full_day,true) OR (a.time_start<(i->>'time_end')::time AND a.time_end>(i->>'time_start')::time)))
               OR EXISTS (SELECT 1 FROM public.group_course_instances gi
                           WHERE (gi.instructor_id=ins.id OR gi.assistant_instructor_id=ins.id)
                             AND gi.date=(i->>'date')::date
                             AND COALESCE(gi.status,'') NOT IN ('cancelled','storno')
                             AND gi.start_time<(i->>'time_end')::time AND gi.end_time>(i->>'time_start')::time))
       ORDER BY ins.id LIMIT 1;
      IF v_instructor IS NULL THEN
        RAISE EXCEPTION 'slot_unavailable: Keine Lehrperson für alle gewählten Zeiten frei' USING ERRCODE='P0001';
      END IF;
      v_prefs := ARRAY[]::text[];
      v_i := 0;
      FOR v_it IN SELECT value FROM jsonb_array_elements(v_line->'items') LOOP
        v_i := v_i + 1;
        INSERT INTO public.ticket_items(ticket_id,product_id,participant_id,instructor_id,date,time_start,time_end,
            unit_price,quantity,line_total,item_type,status,group_participant_count,instructor_confirmation)
        VALUES (v_ticket_id,(v_line->>'product_id')::uuid,NULL,v_instructor,(v_it->>'date')::date,
            (v_it->>'time_start')::time,(v_it->>'time_end')::time,
            (v_line->'line_prices'->>(v_i-1))::numeric,1,(v_line->'line_prices'->>(v_i-1))::numeric,
            'private','booked',jsonb_array_length(v_line->'participant_refs'),'pending')
        RETURNING id INTO v_item_id;
        v_prefs := v_prefs || v_item_id::text;
      END LOOP;
      v_lines_out := v_lines_out || (v_line || jsonb_build_object('instructor_id',v_instructor,'ticket_item_ids',to_jsonb(v_prefs)));
    END IF;
  END LOOP;

  v_snapshot := jsonb_build_object('quote_version','bc-2627-exact-v2-unlimited-group','total_amount',v_total,
    'currency','CHF','created_at',now(),'participants',v_people,'lines',v_lines_out);
  INSERT INTO public.bc_2627_reservations(ticket_id,idempotency_key,request_hash,quote_snapshot)
  VALUES (v_ticket_id,v_key,v_hash,v_snapshot);

  RETURN jsonb_build_object('status','success','ticket_id',v_ticket_id,'ticket_number',v_ticket_number,
    'reservation_token',v_token,'reservation_expires_at',v_expires,'total_amount',v_total,
    'currency','CHF','quote',v_snapshot);
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'slot_unavailable:%' THEN
    RETURN public.bc_2627_err('slot_unavailable',SQLERRM);
  END IF;
  RAISE;
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_reserve(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_reserve(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Finalize: attach the real customer + participants. Participant data must
-- match what was validated at reservation time (birth date, discipline, level).
-- Ticket stays provisional until an open invoice exists (invoice-first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_finalize(p_ticket_id uuid, p_token text, p_customer jsonb,
  p_participants jsonb, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t record; v_r record;
  v_email text; v_customer uuid;
  v_snap_p jsonb; v_p jsonb; v_pid uuid;
  v_map jsonb := '{}'::jsonb;
  v_line jsonb;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id=p_ticket_id;
  IF NOT FOUND THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;
  IF v_t.finalized_at IS NOT NULL AND v_t.customer_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','already_finalized',true,'ticket_id',v_t.id,'customer_id',v_t.customer_id);
  END IF;
  IF v_t.status='expired' OR (v_t.reservation_expires_at IS NOT NULL AND v_t.reservation_expires_at<now()) THEN
    RETURN public.bc_2627_err('expired','Reservation expired');
  END IF;
  IF v_t.status NOT IN ('provisional','payment_pending') THEN
    RETURN public.bc_2627_err('invalid_status',COALESCE(v_t.status,''));
  END IF;
  v_email := lower(trim(COALESCE(p_customer->>'email','')));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR COALESCE(trim(p_customer->>'last_name'),'')='' THEN
    RETURN public.bc_2627_err('invalid_customer','Kunde mit E-Mail und Nachname erforderlich');
  END IF;
  IF jsonb_typeof(p_participants)<>'array'
     OR jsonb_array_length(p_participants)<>jsonb_array_length(v_r.quote_snapshot->'participants') THEN
    RETURN public.bc_2627_err('participant_count_mismatch','Anzahl Teilnehmende passt nicht');
  END IF;
  FOR v_snap_p IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'participants') LOOP
    SELECT value INTO v_p FROM jsonb_array_elements(p_participants) WHERE value->>'ref'=v_snap_p->>'ref';
    IF v_p IS NULL OR COALESCE(trim(v_p->>'first_name'),'')=''
       OR v_p->>'birth_date' IS DISTINCT FROM v_snap_p->>'birth_date'
       OR v_p->>'discipline' IS DISTINCT FROM v_snap_p->>'discipline'
       OR v_p->>'skill_level' IS DISTINCT FROM v_snap_p->>'skill_level' THEN
      RETURN public.bc_2627_err('participant_mismatch','Teilnehmende weichen von der geprüften Reservation ab');
    END IF;
  END LOOP;

  SELECT id INTO v_customer FROM public.customers
   WHERE lower(email)=v_email AND merged_into_id IS NULL AND is_archived IS NOT TRUE
   ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers(first_name,last_name,email,phone,street,zip,city,country,holiday_address,customer_type)
    VALUES (p_customer->>'first_name',p_customer->>'last_name',v_email,p_customer->>'phone',p_customer->>'street',
            p_customer->>'zip',p_customer->>'city',COALESCE(p_customer->>'country','CH'),'','private')
    RETURNING id INTO v_customer;
  END IF;

  FOR v_p IN SELECT value FROM jsonb_array_elements(p_participants) LOOP
    v_pid := NULL;
    SELECT id INTO v_pid FROM public.customer_participants
     WHERE customer_id=v_customer AND merged_into_id IS NULL
       AND lower(first_name)=lower(trim(v_p->>'first_name'))
       AND lower(COALESCE(last_name,''))=lower(trim(COALESCE(v_p->>'last_name','')))
       AND birth_date=(v_p->>'birth_date')::date
     LIMIT 1;
    IF v_pid IS NULL THEN
      INSERT INTO public.customer_participants(customer_id,first_name,last_name,birth_date,sport,level_current_season)
      VALUES (v_customer,trim(v_p->>'first_name'),NULLIF(trim(COALESCE(v_p->>'last_name','')),''),
              (v_p->>'birth_date')::date,v_p->>'discipline',v_p->>'skill_level')
      RETURNING id INTO v_pid;
    END IF;
    v_map := v_map || jsonb_build_object(v_p->>'ref',v_pid);
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'lines') LOOP
    UPDATE public.ticket_items SET participant_id=(v_map->>(CASE WHEN v_line->>'kind'='group'
             THEN v_line->>'participant_ref' ELSE v_line->'participant_refs'->>0 END))::uuid
     WHERE ticket_id=p_ticket_id
       AND id IN (SELECT x::uuid FROM jsonb_array_elements_text(v_line->'ticket_item_ids') x);
  END LOOP;

  UPDATE public.tickets SET customer_id=v_customer,
    notes=COALESCE(NULLIF(trim(COALESCE(p_notes,'')),''),notes),
    finalized_at=now(),
    -- keep the hold alive while invoice + confirmation complete
    reservation_expires_at=greatest(reservation_expires_at, now()+interval '15 minutes'),
    updated_at=now()
  WHERE id=p_ticket_id;
  RETURN jsonb_build_object('status','success','ticket_id',p_ticket_id,'customer_id',v_customer,'participant_map',v_map);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_finalize(uuid,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_finalize(uuid,text,jsonb,jsonb,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Confirm after exactly one open invoice exists: binding status + enrollments
-- for every booked instance, then recount actual enrollments (no cap).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_recount_instances(p_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.group_course_instances gi
     SET current_participants=(SELECT count(*)::int FROM public.group_course_enrollments e WHERE e.instance_id=gi.id)
   WHERE gi.id = ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.bc_2627_recount_instances(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_recount_instances(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.bc_2627_confirm(p_ticket_id uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t record; v_r record; v_inv record; v_n int;
  v_line jsonb; v_inst uuid; v_item uuid; v_pid uuid;
  v_touched uuid[] := ARRAY[]::uuid[];
  v_created int := 0;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id=p_ticket_id;
  IF NOT FOUND THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;
  IF v_t.customer_id IS NULL OR v_t.finalized_at IS NULL THEN
    RETURN public.bc_2627_err('not_finalized','Kunde fehlt');
  END IF;
  SELECT count(*) INTO v_n FROM public.invoices WHERE ticket_id=p_ticket_id AND status='open';
  IF v_n<>1 THEN RETURN public.bc_2627_err('invoice_missing',format('%s offene Rechnungen',v_n)); END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE ticket_id=p_ticket_id AND status='open';
  IF v_inv.total<>v_t.total_amount THEN RETURN public.bc_2627_err('invoice_mismatch','Rechnungsbetrag weicht ab'); END IF;
  IF v_t.status='confirmed' THEN
    RETURN jsonb_build_object('status','success','already_confirmed',true,'ticket_id',v_t.id,
      'invoice_id',v_inv.id,'invoice_number',v_inv.invoice_number,'due_date',v_inv.due_date);
  END IF;
  IF v_t.status NOT IN ('provisional','payment_pending') THEN
    RETURN public.bc_2627_err('invalid_status',COALESCE(v_t.status,''));
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'lines') WHERE value->>'kind'='group' LOOP
    v_item := (v_line->'ticket_item_ids'->>0)::uuid;
    SELECT participant_id INTO v_pid FROM public.ticket_items WHERE id=v_item;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'confirm: line without participant'; END IF;
    FOR v_inst IN SELECT x::uuid FROM jsonb_array_elements_text(v_line->'instance_ids') x LOOP
      IF NOT EXISTS (SELECT 1 FROM public.group_course_enrollments
                      WHERE instance_id=v_inst AND participant_id=v_pid AND ticket_item_id=v_item) THEN
        INSERT INTO public.group_course_enrollments(instance_id,ticket_item_id,participant_id,training_group_id,attendance_status)
        VALUES (v_inst,v_item,v_pid,(v_line->>'training_group_id')::uuid,'registered');
        v_created := v_created+1;
      END IF;
      v_touched := v_touched || v_inst;
    END LOOP;
  END LOOP;
  PERFORM public.bc_2627_recount_instances(v_touched);

  UPDATE public.tickets SET status='confirmed', payment_method='invoice', payment_due_date=v_inv.due_date,
         updated_at=now() WHERE id=p_ticket_id;
  RETURN jsonb_build_object('status','success','ticket_id',p_ticket_id,'enrollments_created',v_created,
    'invoice_id',v_inv.id,'invoice_number',v_inv.invoice_number,'due_date',v_inv.due_date);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_confirm(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_confirm(uuid,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Release: expired holds and cancelled 26/27 tickets free their enrollments
-- (other people's enrollments untouched) and counts are recomputed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_release(p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_t record; v_ids uuid[]; v_n int;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR NOT EXISTS (SELECT 1 FROM public.bc_2627_reservations WHERE ticket_id=p_ticket_id) THEN
    RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation');
  END IF;
  IF v_t.status IN ('provisional','payment_pending') AND v_t.reservation_expires_at < now() THEN
    UPDATE public.tickets SET status='expired', updated_at=now() WHERE id=p_ticket_id;
  ELSIF COALESCE(v_t.status,'') NOT IN ('expired','cancelled','storno') THEN
    RETURN public.bc_2627_err('invalid_status','Nur abgelaufene oder stornierte Buchungen');
  END IF;
  WITH del AS (
    DELETE FROM public.group_course_enrollments e USING public.ticket_items ti
     WHERE e.ticket_item_id=ti.id AND ti.ticket_id=p_ticket_id
    RETURNING e.instance_id)
  SELECT array_agg(DISTINCT instance_id), count(*) INTO v_ids, v_n FROM del;
  UPDATE public.ticket_items SET status='cancelled' WHERE ticket_id=p_ticket_id;
  IF v_ids IS NOT NULL THEN PERFORM public.bc_2627_recount_instances(v_ids); END IF;
  RETURN jsonb_build_object('status','success','enrollments_released',v_n);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_release(uuid) TO service_role;
