-- #36 / #15: atomic, source-bound 26/27 website booking. PENDING: not applied anywhere.
-- Apply only after owner approval (copy into a migration via the migration tool, byte-identical).
-- Owner decision 2026-10-03: "Wir buchen ohne Limite" for GROUP courses -> no group person or
-- selection cap anywhere; max_participants / group_capacity are planning thresholds only.
-- Private lessons use the canonical private_appointments model + pa_lock_slots/pa_slot_conflicts.
-- Does NOT activate courses/products, change prices, touch imported bookings or send anything.
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
  -- No upper person limit for groups ("Wir buchen ohne Limite"). Private persons are
  -- constrained only by the existence of a unique source tariff for that person count.
  IF p_participants IS NULL OR p_participants < 1
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 THEN
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
    'quote_version','bc-2627-exact-v3-unlimited-group');
END;
$quote$;
REVOKE ALL ON FUNCTION public.quote_bc_2627_product(uuid,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_bc_2627_product(uuid,jsonb,integer) TO service_role;
-- ---------------------------------------------------------------------------
-- Reservation record: immutable quote/source snapshot + controlled state machine.
--   held -> finalized -> invoicing -> confirmed
--   held|finalized -> released   (cancel / expiry; never once invoicing started)
-- quote_total is the authoritative amount for invoice + confirmation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bc_2627_reservations (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  quote_snapshot jsonb NOT NULL,
  quote_total numeric(10,2) NOT NULL CHECK (quote_total > 0),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','finalized','invoicing','confirmed','released')),
  finalize_hash text,
  customer_id uuid REFERENCES public.customers(id),
  recipient_email text,
  finalized_at timestamptz,
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bc_2627_reservations TO service_role;
GRANT SELECT ON public.bc_2627_reservations TO authenticated;
ALTER TABLE public.bc_2627_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read bc 26/27 reservation snapshots" ON public.bc_2627_reservations;
CREATE POLICY "Staff read bc 26/27 reservation snapshots" ON public.bc_2627_reservations
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.bc_2627_reservation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash OR NEW.quote_snapshot IS DISTINCT FROM OLD.quote_snapshot
     OR NEW.quote_total IS DISTINCT FROM OLD.quote_total OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'bc_2627_reservations quote snapshot is immutable' USING ERRCODE='55000';
  END IF;
  IF OLD.finalize_hash IS NOT NULL AND (NEW.finalize_hash IS DISTINCT FROM OLD.finalize_hash
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at) THEN
    RAISE EXCEPTION 'bc_2627_reservations finalized customer binding is immutable' USING ERRCODE='55000';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state='held' AND NEW.state IN ('finalized','released'))
    OR (OLD.state='finalized' AND NEW.state IN ('invoicing','released'))
    OR (OLD.state='invoicing' AND NEW.state='confirmed')) THEN
    RAISE EXCEPTION 'bc_2627_reservations invalid state transition % -> %', OLD.state, NEW.state USING ERRCODE='55000';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN NEW.state_changed_at := now(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bc_2627_reservation_guard ON public.bc_2627_reservations;
CREATE TRIGGER trg_bc_2627_reservation_guard BEFORE UPDATE ON public.bc_2627_reservations
  FOR EACH ROW EXECUTE FUNCTION public.bc_2627_reservation_guard();
CREATE OR REPLACE FUNCTION public.bc_2627_reservation_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'bc_2627_reservations rows are never deleted' USING ERRCODE='55000'; END;
$$;
DROP TRIGGER IF EXISTS trg_bc_2627_reservation_no_delete ON public.bc_2627_reservations;
CREATE TRIGGER trg_bc_2627_reservation_no_delete BEFORE DELETE ON public.bc_2627_reservations
  FOR EACH ROW EXECUTE FUNCTION public.bc_2627_reservation_no_delete();

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
CREATE OR REPLACE FUNCTION public.bc_2627_instance_id(p_source_key text, p_date date, p_block text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5('malbun-2627:instance:'||p_source_key||':'||p_date::text||':'||p_block)::uuid
$$;
-- Exact current source instance: deterministic id AND course AND date AND real times AND not cancelled.
CREATE OR REPLACE FUNCTION public.bc_2627_live_instance(p_source_key text, p_course uuid, p_date date, p_block text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT gi.id FROM public.group_course_instances gi
   WHERE gi.id = public.bc_2627_instance_id(p_source_key, p_date, p_block)
     AND gi.course_id = p_course AND gi.date = p_date
     AND gi.start_time = split_part(p_block,'-',1)::time AND gi.end_time = split_part(p_block,'-',2)::time
     AND COALESCE(gi.status,'scheduled') NOT IN ('cancelled','storno')
     AND NOT EXISTS (SELECT 1 FROM public.training_course_dates d
                      WHERE d.training_id = p_course AND d.date = p_date AND d.is_cancelled IS TRUE)
$$;
-- Instructor may teach the discipline: legacy role array or a capability of that category.
CREATE OR REPLACE FUNCTION public.bc_2627_instructor_can_teach(p_instructor uuid, p_discipline text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.instructors i WHERE i.id = p_instructor AND i.status = 'active'
                   AND (p_discipline = ANY(COALESCE(i.roles, ARRAY[]::text[]))
                        OR EXISTS (SELECT 1 FROM public.instructor_capabilities ic
                                     JOIN public.capabilities c ON c.id = ic.capability_id
                                    WHERE ic.instructor_id = i.id AND lower(c.category) = lower(p_discipline))))
$$;
-- Canonical availability gate: pa_slot_conflicts (ticket items, private appointments, absences,
-- recurring blocks, deployment windows) PLUS group-course and office assignments.
CREATE OR REPLACE FUNCTION public.bc_2627_instructor_free(p_instructor uuid, p_date date, p_start time, p_end time)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.pa_slot_conflicts(p_instructor, p_date, p_start, p_end, NULL))
     AND NOT EXISTS (SELECT 1 FROM public.group_course_instances gi
                      WHERE (gi.instructor_id = p_instructor OR gi.assistant_instructor_id = p_instructor)
                        AND gi.date = p_date AND COALESCE(gi.status,'') NOT IN ('cancelled','storno')
                        AND gi.start_time < p_end AND gi.end_time > p_start)
     AND NOT EXISTS (SELECT 1 FROM public.office_hour_blocks ob
                      WHERE ob.instructor_id = p_instructor AND ob.date = p_date
                        AND ob.time_start < p_end AND ob.time_end > p_start)
$$;

-- ---------------------------------------------------------------------------
-- Read-only course options. Active course + active website product + eligible
-- variant + unique source-valid tiers + exact live instances. 4h options only
-- list days on which BOTH blocks exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_course_options(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  r record; v record;
  v_tiers jsonb; v_blocks jsonb; v_days date[]; v_block_dates date[]; b text;
BEGIN
  FOR r IN
    SELECT ps.source_key, ps.course_id, ps.training_group_id, ps.teaching_dates, ps.eligible_variants,
           c.name, c.discipline, c.skill_level_id, c.min_age, c.max_age, c.max_participants, c.course_type
      FROM public.bc_2627_course_period_sources ps
      JOIN public.group_courses c ON c.id = ps.course_id AND c.is_active IS TRUE
     WHERE (p_to IS NULL OR ps.teaching_dates[1] <= p_to)
       AND (p_from IS NULL OR ps.teaching_dates[array_length(ps.teaching_dates,1)] >= p_from)
     ORDER BY ps.teaching_dates[1], c.name
  LOOP
    FOR v IN
      SELECT p.id, p.name, p.duration_minutes,
             ARRAY(SELECT x::int FROM jsonb_array_elements_text(r.eligible_variants->p.id::text) x) AS period_days,
             cpv.eligible_day_counts
        FROM public.products p
        JOIN public.bc_2627_course_product_variants cpv ON cpv.product_id = p.id AND cpv.course_id = r.course_id
       WHERE r.eligible_variants ? p.id::text
         AND p.is_active IS TRUE AND p.show_on_website IS TRUE
         AND p.type IN ('group','group_toddler') AND p.name NOT ILIKE '%carving%'
         AND p.duration_minutes IN (120,240)
    LOOP
      v_blocks := '[]'::jsonb; v_days := ARRAY[]::date[];
      IF v.duration_minutes = 240 THEN
        v_block_dates := ARRAY(SELECT d FROM unnest(r.teaching_dates) d
                                WHERE d >= CURRENT_DATE
                                  AND public.bc_2627_live_instance(r.source_key, r.course_id, d, '10:00-12:00') IS NOT NULL
                                  AND public.bc_2627_live_instance(r.source_key, r.course_id, d, '14:00-16:00') IS NOT NULL
                                ORDER BY d);
        IF cardinality(v_block_dates) > 0 THEN
          v_blocks := jsonb_build_array(jsonb_build_object('block','10:00-12:00+14:00-16:00','dates',to_jsonb(v_block_dates)));
          v_days := v_block_dates;
        END IF;
      ELSE
        FOREACH b IN ARRAY ARRAY['10:00-12:00','14:00-16:00'] LOOP
          v_block_dates := ARRAY(SELECT d FROM unnest(r.teaching_dates) d
                                  WHERE d >= CURRENT_DATE
                                    AND public.bc_2627_live_instance(r.source_key, r.course_id, d, b) IS NOT NULL
                                  ORDER BY d);
          IF cardinality(v_block_dates) > 0 THEN
            v_blocks := v_blocks || jsonb_build_object('block', b, 'dates', to_jsonb(v_block_dates));
            v_days := v_days || v_block_dates;
          END IF;
        END LOOP;
      END IF;
      IF jsonb_array_length(v_blocks) = 0 THEN CONTINUE; END IF;
      -- Exactly one tier row AND exactly one matching draft source per day count.
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day_count',x.day_count,'price',x.price,'source_tariff_id',x.source_id)
               ORDER BY x.day_count),'[]'::jsonb)
        INTO v_tiers
        FROM (SELECT t.day_count, max(t.cumulative_price) price, max(src.source_id) source_id
                FROM public.product_price_tiers t
                JOIN public.bc_product_tariff_sources src
                  ON src.product_id = t.product_id AND src.import_status = 'draft' AND src.day_count = t.day_count
                 AND src.duration_minutes = v.duration_minutes AND src.persons_per_lesson = 1
                 AND src.price_chf = t.cumulative_price
               WHERE t.product_id = v.id AND t.cumulative_price > 0
                 AND t.day_count = ANY(v.period_days) AND t.day_count = ANY(v.eligible_day_counts)
               GROUP BY t.day_count
              HAVING count(*) = 1
                 AND (SELECT count(*) FROM public.product_price_tiers t2 WHERE t2.product_id = v.id AND t2.day_count = t.day_count) = 1) x
       WHERE x.day_count <= (SELECT max(jsonb_array_length(bb->'dates')) FROM jsonb_array_elements(v_blocks) bb);
      IF jsonb_array_length(v_tiers) = 0 THEN CONTINUE; END IF;
      v_out := v_out || jsonb_build_object(
        'period_key', r.source_key, 'course_id', r.course_id, 'course_name', r.name,
        'course_type', r.course_type, 'discipline', r.discipline, 'skill_level_id', r.skill_level_id,
        'age_min', r.min_age, 'age_max', r.max_age,
        'cancelled_dates', (SELECT COALESCE(jsonb_agg(d.date ORDER BY d.date),'[]'::jsonb) FROM public.training_course_dates d
                              WHERE d.training_id = r.course_id AND d.is_cancelled IS TRUE AND d.date = ANY(r.teaching_dates)),
        'product_id', v.id, 'product_name', v.name, 'duration_minutes', v.duration_minutes,
        'blocks', v_blocks, 'lunch_included', false, 'tiers', v_tiers,
        -- planning threshold only; never used to refuse a group booking
        'planning_threshold', r.max_participants, 'bookable', true);
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('status','success','quote_version','bc-2627-exact-v3-unlimited-group',
    'informational', jsonb_build_array(jsonb_build_object('product','Carving','bookable',false,
      'reason','Betriebsdaten noch nicht freigegeben')),
    'options', v_out);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_course_options(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_course_options(date,date) TO service_role;

-- ---------------------------------------------------------------------------
-- Release a hold (expired or cancelled before invoicing). Atomic; idempotent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_release_hold(p_ticket_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_t record; v_r record; v_appts int;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR v_r IS NULL THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;
  IF v_r.state = 'released' THEN RETURN jsonb_build_object('status','success','already_released',true); END IF;
  IF v_r.state NOT IN ('held','finalized') THEN
    RETURN public.bc_2627_err('invalid_status','Rechnungsstellung läuft bereits; nur Büro kann stornieren');
  END IF;
  IF p_reason = 'expired' AND NOT (v_t.status = 'expired' OR v_t.reservation_expires_at < now()) THEN
    RETURN public.bc_2627_err('not_expired','Reservation noch gültig');
  END IF;
  IF p_reason NOT IN ('expired','cancelled') THEN RETURN public.bc_2627_err('invalid_input','reason'); END IF;
  UPDATE public.private_appointments SET status = 'cancelled' WHERE ticket_id = p_ticket_id AND status <> 'cancelled';
  GET DIAGNOSTICS v_appts = ROW_COUNT;
  UPDATE public.ticket_items SET status = 'cancelled' WHERE ticket_id = p_ticket_id AND COALESCE(status,'') <> 'cancelled';
  UPDATE public.tickets SET status = p_reason, updated_at = now() WHERE id = p_ticket_id;
  UPDATE public.bc_2627_reservations SET state = 'released' WHERE ticket_id = p_ticket_id;
  RETURN jsonb_build_object('status','success','released_appointments',v_appts,'ticket_status',p_reason);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_release_hold(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_release_hold(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.bc_2627_cancel(p_ticket_id uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_t record;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR p_token IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  RETURN public.bc_2627_release_hold(p_ticket_id, 'cancelled');
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_cancel(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_cancel(uuid,text) TO service_role;

-- Releases every expired 26/27 hold (held/finalized). Safe for cron and called lazily by reserve.
CREATE OR REPLACE FUNCTION public.bc_2627_release_expired()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid; v_n int := 0;
BEGIN
  FOR v_id IN SELECT r.ticket_id FROM public.bc_2627_reservations r JOIN public.tickets t ON t.id = r.ticket_id
               WHERE r.state IN ('held','finalized') AND (t.status = 'expired' OR t.reservation_expires_at < now())
               ORDER BY r.ticket_id FOR UPDATE OF r SKIP LOCKED LOOP
    IF (public.bc_2627_release_hold(v_id, 'expired')->>'status') = 'success' THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_release_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_release_expired() TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic reservation (hold). Validates every selection before any write; any
-- failure rolls back the whole request. No group sales cap of any kind.
-- Payload:
--  { idempotency_key, source?, hold_minutes?, notes?,
--    participants: [{ref, birth_date, discipline, skill_level}],
--    selections: [ {kind:'group', participant_ref, period_key, product_id, dates:[..], block?}
--                | {kind:'private', participant_refs:[..], product_id, items:[{date,time_start,time_end}]} ] }
-- Private lessons use the canonical private_appointments model and pa_lock_slots
-- (same advisory keys as office pa_create_booking); billing lines and
-- participants are attached at finalize/confirm.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_reserve(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_key text := p_payload->>'idempotency_key';
  v_hash text := md5(COALESCE(p_payload::text,''));
  v_existing record;
  v_hold int; v_source text;
  v_people jsonb := p_payload->'participants';
  v_sels jsonb := p_payload->'selections';
  v_p jsonb; v_s jsonb; v_it jsonb; v_line jsonb;
  v_refs text[] := ARRAY[]::text[]; v_ref text; v_prefs text[];
  v_period record; v_course record; v_product record;
  v_dates date[]; v_d date; v_b text; v_blocks text[];
  v_days int; v_allowed int[];
  v_inst uuid; v_instance_ids uuid[];
  v_items jsonb; v_quote jsonb;
  v_lines jsonb := '[]'::jsonb; v_lines_out jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;      -- {ref,date,start,end} for overlap checks
  v_total numeric(10,2) := 0;
  v_birth date; v_age int; v_season uuid;
  v_ticket_id uuid; v_ticket_number text; v_token text; v_expires timestamptz;
  v_item_id uuid; v_instructor uuid; v_aid uuid; v_aids uuid[]; v_group uuid;
  v_line_prices numeric[]; v_i int; v_snapshot jsonb; v_lock_targets jsonb;
  v_private_dates date[] := ARRAY[]::date[]; v_disciplines text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN public.bc_2627_err('invalid_input','payload fehlt');
  END IF;
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 128 THEN
    RETURN public.bc_2627_err('invalid_input','idempotency_key (8-128 Zeichen) fehlt');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bc2627-reserve:'||v_key,0));
  SELECT r.*, t.ticket_number, t.reservation_token, t.reservation_expires_at, t.status AS ticket_status
    INTO v_existing
    FROM public.bc_2627_reservations r JOIN public.tickets t ON t.id = r.ticket_id
   WHERE r.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash THEN
      RETURN public.bc_2627_err('idempotency_conflict','Gleicher Schlüssel mit anderem Inhalt');
    END IF;
    RETURN jsonb_build_object('status','success','replayed',true,'ticket_id',v_existing.ticket_id,
      'ticket_number',v_existing.ticket_number,'reservation_token',v_existing.reservation_token,
      'reservation_expires_at',v_existing.reservation_expires_at,'total_amount',v_existing.quote_total,
      'state',v_existing.state,'quote',v_existing.quote_snapshot);
  END IF;

  BEGIN
    v_hold := COALESCE((p_payload->>'hold_minutes')::int, 20);
  EXCEPTION WHEN others THEN RETURN public.bc_2627_err('invalid_input','hold_minutes ungültig'); END;
  v_source := COALESCE(p_payload->>'source','website');
  IF v_hold NOT BETWEEN 5 AND 60 OR v_source NOT IN ('website','vapi') THEN
    RETURN public.bc_2627_err('invalid_input','hold_minutes/source ungültig');
  END IF;
  -- No upper limit on participants or selections (owner decision: no group limit).
  IF jsonb_typeof(v_people) IS DISTINCT FROM 'array' OR jsonb_array_length(v_people) < 1
     OR jsonb_typeof(v_sels) IS DISTINCT FROM 'array' OR jsonb_array_length(v_sels) < 1 THEN
    RETURN public.bc_2627_err('invalid_input','participants und selections erforderlich');
  END IF;
  FOR v_p IN SELECT value FROM jsonb_array_elements(v_people) LOOP
    IF jsonb_typeof(v_p) IS DISTINCT FROM 'object'
       OR COALESCE(v_p->>'ref','') = '' OR (v_p->>'ref') = ANY(v_refs)
       OR COALESCE(v_p->>'birth_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR COALESCE(v_p->>'discipline','') NOT IN ('ski','snowboard')
       OR COALESCE(trim(v_p->>'skill_level'),'') = '' THEN
      RETURN public.bc_2627_err('invalid_participant','Teilnehmende brauchen eindeutige ref, Geburtsdatum, Disziplin und Niveau');
    END IF;
    BEGIN v_birth := (v_p->>'birth_date')::date;
    EXCEPTION WHEN others THEN RETURN public.bc_2627_err('invalid_participant','Ungültiges Geburtsdatum'); END;
    IF v_birth > CURRENT_DATE THEN RETURN public.bc_2627_err('invalid_participant','Geburtsdatum in der Zukunft'); END IF;
    v_refs := v_refs || (v_p->>'ref');
  END LOOP;

  SELECT id INTO v_season FROM public.seasons
   WHERE name = 'Winter 26/27' AND start_date = DATE '2026-12-01' AND end_date = DATE '2027-04-15';
  IF v_season IS NULL THEN RETURN public.bc_2627_err('season_unavailable','Saison 26/27 fehlt'); END IF;

  -- Free expired holds first so they never block private slots.
  PERFORM public.bc_2627_release_expired();

  -- ---------- Phase 1: validate + quote everything, no writes ----------
  BEGIN
    FOR v_s IN SELECT value FROM jsonb_array_elements(v_sels) LOOP
      IF jsonb_typeof(v_s) IS DISTINCT FROM 'object' OR COALESCE(v_s->>'kind','') NOT IN ('group','private')
         OR COALESCE(v_s->>'product_id','') !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION 'invalid_selection: kind (group|private) und product_id erforderlich';
      END IF;
      SELECT * INTO v_product FROM public.products WHERE id = (v_s->>'product_id')::uuid;
      IF NOT FOUND OR v_product.is_active IS NOT TRUE OR v_product.show_on_website IS NOT TRUE
         OR v_product.season_id IS DISTINCT FROM v_season OR v_product.name ILIKE '%carving%' THEN
        RAISE EXCEPTION 'product_unavailable: Produkt nicht buchbar';
      END IF;

      IF v_s->>'kind' = 'group' THEN
        IF v_product.type NOT IN ('group','group_toddler') THEN
          RAISE EXCEPTION 'invalid_selection: Kein Gruppenkursprodukt';
        END IF;
        v_ref := v_s->>'participant_ref';
        IF v_ref IS NULL OR NOT (v_ref = ANY(v_refs)) THEN RAISE EXCEPTION 'invalid_selection: Unbekannte participant_ref'; END IF;
        SELECT * INTO v_period FROM public.bc_2627_course_period_sources WHERE source_key = v_s->>'period_key';
        IF NOT FOUND THEN RAISE EXCEPTION 'course_unavailable: Kursperiode unbekannt'; END IF;
        SELECT * INTO v_course FROM public.group_courses WHERE id = v_period.course_id;
        IF NOT FOUND OR v_course.is_active IS NOT TRUE THEN
          RAISE EXCEPTION 'course_unavailable: Kurs nicht aktiv';
        END IF;
        IF NOT (v_period.eligible_variants ? v_product.id::text) THEN
          RAISE EXCEPTION 'course_unavailable: Produkt nicht mit Kurs verknüpft';
        END IF;
        SELECT cpv.eligible_day_counts INTO v_allowed FROM public.bc_2627_course_product_variants cpv
         WHERE cpv.course_id = v_course.id AND cpv.product_id = v_product.id;
        IF v_allowed IS NULL THEN RAISE EXCEPTION 'course_unavailable: Produktvariante fehlt'; END IF;
        IF jsonb_typeof(v_s->'dates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_dates: dates fehlt'; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_s->'dates') x
                    WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
          RAISE EXCEPTION 'invalid_dates: Ungültiges Datum';
        END IF;
        BEGIN
          v_dates := ARRAY(SELECT x::date FROM jsonb_array_elements_text(v_s->'dates') x ORDER BY 1);
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_dates: Ungültiges Datum'; END;
        v_days := COALESCE(array_length(v_dates,1),0);
        IF v_days = 0 OR v_days <> (SELECT count(DISTINCT x) FROM unnest(v_dates) x) THEN
          RAISE EXCEPTION 'invalid_dates: Leere oder doppelte Kursdaten';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_dates) x WHERE NOT (x = ANY(v_period.teaching_dates))) THEN
          RAISE EXCEPTION 'invalid_dates: Datum gehört nicht zur Kursperiode';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_dates) x WHERE x < CURRENT_DATE) THEN
          RAISE EXCEPTION 'invalid_dates: Datum in der Vergangenheit';
        END IF;
        IF NOT (v_days = ANY(v_allowed))
           OR NOT (v_days = ANY(ARRAY(SELECT x::int FROM jsonb_array_elements_text(v_period.eligible_variants->v_product.id::text) x))) THEN
          RAISE EXCEPTION 'tier_unavailable: Kein Tarif für % Tage', v_days;
        END IF;
        IF v_product.duration_minutes = 240 THEN
          IF v_s ? 'block' AND v_s->>'block' IS DISTINCT FROM '10:00-12:00+14:00-16:00' THEN
            RAISE EXCEPTION 'invalid_selection: 4h-Kurs umfasst 10-12 und 14-16';
          END IF;
          v_blocks := ARRAY['10:00-12:00','14:00-16:00'];
        ELSIF v_product.duration_minutes = 120 THEN
          IF COALESCE(v_s->>'block','') NOT IN ('10:00-12:00','14:00-16:00') THEN
            RAISE EXCEPTION 'invalid_selection: block (10:00-12:00 oder 14:00-16:00) wählen';
          END IF;
          v_blocks := ARRAY[v_s->>'block'];
        ELSE
          RAISE EXCEPTION 'product_unavailable: Unbekannte Produktdauer';
        END IF;
        v_instance_ids := ARRAY[]::uuid[]; v_items := '[]'::jsonb;
        FOREACH v_d IN ARRAY v_dates LOOP
          FOREACH v_b IN ARRAY v_blocks LOOP
            v_inst := public.bc_2627_live_instance(v_period.source_key, v_course.id, v_d, v_b);
            IF v_inst IS NULL THEN RAISE EXCEPTION 'invalid_dates: Kein Kursblock % %', v_d, v_b; END IF;
            v_instance_ids := v_instance_ids || v_inst;
            v_items := v_items || jsonb_build_object('date',v_d,'time_start',split_part(v_b,'-',1),'time_end',split_part(v_b,'-',2));
            v_slots := v_slots || jsonb_build_object('ref',v_ref,'date',v_d,'s',split_part(v_b,'-',1),'e',split_part(v_b,'-',2));
          END LOOP;
        END LOOP;
        SELECT value INTO v_p FROM jsonb_array_elements(v_people) WHERE value->>'ref' = v_ref;
        IF (v_p->>'discipline') IS DISTINCT FROM v_course.discipline THEN RAISE EXCEPTION 'invalid_level: Disziplin passt nicht zum Kurs'; END IF;
        IF v_course.skill_level_id IS NULL OR (v_p->>'skill_level') IS DISTINCT FROM v_course.skill_level_id THEN
          RAISE EXCEPTION 'invalid_level: Niveau passt nicht zum Kurs';
        END IF;
        v_birth := (v_p->>'birth_date')::date;
        FOREACH v_d IN ARRAY v_dates LOOP
          v_age := public.bc_2627_age_at(v_birth, v_d);
          IF v_course.min_age IS NULL OR v_course.max_age IS NULL
             OR v_age < v_course.min_age OR v_age > v_course.max_age
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

      ELSE -- private
        IF v_product.type <> 'private' THEN RAISE EXCEPTION 'invalid_selection: Kein Privatunterrichtsprodukt'; END IF;
        IF jsonb_typeof(v_s->'participant_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(v_s->'participant_refs') < 1
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_s->'participant_refs') x
                       WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR NOT ((x #>> '{}') = ANY(v_refs)))
           OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(v_s->'participant_refs') x) <> jsonb_array_length(v_s->'participant_refs') THEN
          RAISE EXCEPTION 'invalid_selection: participant_refs ungültig oder doppelt';
        END IF;
        IF jsonb_typeof(v_s->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(v_s->'items') = 0 THEN
          RAISE EXCEPTION 'invalid_dates: items fehlt';
        END IF;
        FOR v_it IN SELECT value FROM jsonb_array_elements(v_s->'items') LOOP
          IF jsonb_typeof(v_it) IS DISTINCT FROM 'object'
             OR COALESCE(v_it->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             OR COALESCE(v_it->>'time_start','') !~ '^[0-9]{2}:[0-9]{2}$' OR COALESCE(v_it->>'time_end','') !~ '^[0-9]{2}:[0-9]{2}$' THEN
            RAISE EXCEPTION 'invalid_dates: Ungültiger Privattermin';
          END IF;
          IF (v_it->>'date')::date < CURRENT_DATE THEN RAISE EXCEPTION 'invalid_dates: Datum in der Vergangenheit'; END IF;
        END LOOP;
        FOR v_ref IN SELECT x FROM jsonb_array_elements_text(v_s->'participant_refs') x LOOP
          SELECT value INTO v_p FROM jsonb_array_elements(v_people) WHERE value->>'ref' = v_ref;
          IF v_product.discipline IS NOT NULL AND (v_p->>'discipline') IS DISTINCT FROM v_product.discipline THEN
            RAISE EXCEPTION 'invalid_level: Disziplin passt nicht zum Privatunterricht';
          END IF;
          FOR v_it IN SELECT value FROM jsonb_array_elements(v_s->'items') LOOP
            v_age := public.bc_2627_age_at((v_p->>'birth_date')::date, (v_it->>'date')::date);
            IF (v_product.min_age IS NOT NULL AND v_age < v_product.min_age)
               OR (v_product.max_age IS NOT NULL AND v_age > v_product.max_age) THEN
              RAISE EXCEPTION 'invalid_age: Alter % ausserhalb Privatunterricht', v_age;
            END IF;
            v_slots := v_slots || jsonb_build_object('ref',v_ref,'date',v_it->>'date','s',v_it->>'time_start','e',v_it->>'time_end');
          END LOOP;
        END LOOP;
        v_quote := public.quote_bc_2627_product(v_product.id, v_s->'items', jsonb_array_length(v_s->'participant_refs'));
        v_line_prices := ARRAY[]::numeric[];
        FOR v_it IN SELECT value FROM jsonb_array_elements(v_s->'items') LOOP
          v_line_prices := v_line_prices || (public.quote_bc_2627_product(v_product.id, jsonb_build_array(v_it),
                             jsonb_array_length(v_s->'participant_refs'))->>'total_amount')::numeric;
          v_private_dates := v_private_dates || (v_it->>'date')::date;
        END LOOP;
        IF (SELECT sum(x) FROM unnest(v_line_prices) x) <> (v_quote->>'total_amount')::numeric THEN
          RAISE EXCEPTION 'tier_unavailable: Privatpreis nicht eindeutig';
        END IF;
        v_disciplines := v_disciplines || COALESCE(v_product.discipline, (SELECT value->>'discipline' FROM jsonb_array_elements(v_people)
                                     WHERE value->>'ref' = v_s->'participant_refs'->>0));
        v_lines := v_lines || jsonb_build_object('kind','private','participant_refs',v_s->'participant_refs',
          'product_id',v_product.id,'discipline',v_disciplines[cardinality(v_disciplines)],'items',v_s->'items',
          'line_prices',to_jsonb(v_line_prices),'quote',v_quote);
        v_total := v_total + (v_quote->>'total_amount')::numeric;
      END IF;
    END LOOP;
  EXCEPTION WHEN others THEN
    RETURN public.bc_2627_err(
      CASE WHEN SQLERRM ~ '^[a-z_]+: ' THEN split_part(SQLERRM,':',1)
           WHEN SQLSTATE = '22023' THEN 'quote_rejected' ELSE 'invalid_selection' END,
      SQLERRM);
  END;

  -- Same participant: no duplicate or overlapping time slots across selections.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_slots) WITH ORDINALITY a(x,i)
               JOIN jsonb_array_elements(v_slots) WITH ORDINALITY b(y,j) ON a.i < b.j
              WHERE x->>'ref' = y->>'ref' AND x->>'date' = y->>'date'
                AND (x->>'s')::time < (y->>'e')::time AND (y->>'s')::time < (x->>'e')::time) THEN
    RETURN public.bc_2627_err('overlapping_selection','Doppelte oder überlappende Auswahl für dieselbe Person');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_refs) r WHERE NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_lines) l
        WHERE l->>'participant_ref' = r OR (l->'participant_refs') ? r)) THEN
    RETURN public.bc_2627_err('invalid_selection','Jede teilnehmende Person braucht eine Auswahl');
  END IF;
  IF v_total <= 0 THEN RETURN public.bc_2627_err('quote_rejected','Gesamtpreis 0'); END IF;

  -- ---------- Phase 2: writes; any error rolls back everything ----------
  BEGIN
    IF cardinality(v_private_dates) > 0 THEN
      -- Canonical pa_slot locks for every capable instructor on every requested day,
      -- taken once in (instructor,date) order -> same keys/order as office pa_* paths.
      SELECT COALESCE(jsonb_agg(jsonb_build_object('instructor_id', i.id, 'date', d)), '[]'::jsonb) INTO v_lock_targets
        FROM public.instructors i, (SELECT DISTINCT unnest(v_private_dates) d) dd
       WHERE i.status = 'active'
         AND EXISTS (SELECT 1 FROM unnest(v_disciplines) disc WHERE public.bc_2627_instructor_can_teach(i.id, disc));
      PERFORM public.pa_lock_slots(v_lock_targets);
    END IF;

    v_ticket_number := public.generate_ticket_number();
    v_token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    v_expires := now() + make_interval(mins => v_hold);
    INSERT INTO public.tickets(ticket_number,customer_id,status,notes,ticket_type,source,total_amount,
                               paid_amount,reservation_expires_at,reservation_token,participant_count,season_id)
    VALUES (v_ticket_number,NULL,'provisional',NULLIF(left(p_payload->>'notes',2000),''),'standard',v_source,
            v_total,0,v_expires,v_token,jsonb_array_length(v_people),v_season)
    RETURNING id INTO v_ticket_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
      IF v_line->>'kind' = 'group' THEN
        -- One priced line per participant+selection (price once); enrollments for every
        -- booked instance are created at confirmation. No instructor (no phantom group teacher).
        INSERT INTO public.ticket_items(ticket_id,product_id,participant_id,instructor_id,date,end_date,
            time_start,time_end,unit_price,quantity,item_type,status,group_name,skill_level,
            group_participant_count,internal_notes)
        VALUES (v_ticket_id,(v_line->>'product_id')::uuid,NULL,NULL,
            (v_line->'dates'->>0)::date,(v_line->'dates'->>(jsonb_array_length(v_line->'dates')-1))::date,
            split_part(v_line->'blocks'->>0,'-',1)::time,
            split_part(v_line->'blocks'->>(jsonb_array_length(v_line->'blocks')-1),'-',2)::time,
            (v_line->'quote'->>'total_amount')::numeric,1,
            'group_course','booked',v_line->>'course_name',v_line->>'skill_level',1,
            'bc2627:'||(v_line->>'period_key'))
        RETURNING id INTO v_item_id;
        v_lines_out := v_lines_out || (v_line || jsonb_build_object('ticket_item_ids',jsonb_build_array(v_item_id)));
      ELSE
        -- One consistently available, capable, deployed instructor for ALL lessons of this selection.
        SELECT i.id INTO v_instructor
          FROM public.instructors i
         WHERE i.status = 'active' AND public.bc_2627_instructor_can_teach(i.id, v_line->>'discipline')
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_line->'items') it
                            WHERE NOT public.bc_2627_instructor_free(i.id, (it->>'date')::date,
                                    (it->>'time_start')::time, (it->>'time_end')::time))
         ORDER BY (SELECT count(*) FROM public.private_appointments pa
                    WHERE pa.instructor_id = i.id AND pa.status <> 'cancelled'
                      AND pa.date IN (SELECT (it->>'date')::date FROM jsonb_array_elements(v_line->'items') it)), i.id
         LIMIT 1;
        IF v_instructor IS NULL THEN
          RAISE EXCEPTION 'slot_unavailable: Keine Lehrperson für alle gewählten Zeiten frei';
        END IF;
        v_group := CASE WHEN jsonb_array_length(v_line->'items') > 1 THEN gen_random_uuid() END;
        v_aids := ARRAY[]::uuid[]; v_i := 0;
        FOR v_it IN SELECT value FROM jsonb_array_elements(v_line->'items') LOOP
          v_i := v_i + 1;
          INSERT INTO public.private_appointments(ticket_id,date,time_start,time_end,instructor_id,status,
              instructor_confirmation,period_group_id,price,submission_key)
          VALUES (v_ticket_id,(v_it->>'date')::date,(v_it->>'time_start')::time,(v_it->>'time_end')::time,
              v_instructor,'booked','pending',v_group,(v_line->'line_prices'->>(v_i-1))::numeric,'bc2627:'||v_key)
          RETURNING id INTO v_aid;
          v_aids := v_aids || v_aid;
        END LOOP;
        v_lines_out := v_lines_out || (v_line || jsonb_build_object('instructor_id',v_instructor,
                         'appointment_ids',to_jsonb(v_aids),'period_group_id',v_group));
      END IF;
    END LOOP;

    v_snapshot := jsonb_build_object('quote_version','bc-2627-exact-v3-unlimited-group','total_amount',v_total,
      'currency','CHF','created_at',now(),'participants',v_people,'lines',v_lines_out);
    INSERT INTO public.bc_2627_reservations(ticket_id,idempotency_key,request_hash,quote_snapshot,quote_total)
    VALUES (v_ticket_id,v_key,v_hash,v_snapshot,v_total);
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'slot_unavailable:%' THEN RETURN public.bc_2627_err('slot_unavailable',SQLERRM); END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('status','success','ticket_id',v_ticket_id,'ticket_number',v_ticket_number,
    'reservation_token',v_token,'reservation_expires_at',v_expires,'total_amount',v_total,
    'currency','CHF','state','held','quote',v_snapshot);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_reserve(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_reserve(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Finalize: bind customer + participants ONCE. Expiry/status are checked before
-- any replay answer; a retry with different input is rejected. Identity policy
-- (same as finalize_provisional_reservation): an existing customer is reused only
-- on a unique e-mail match and is NEVER updated from caller claims; nothing about
-- an existing customer is returned. Ambiguous e-mail -> rejected (no guessing, no duplicate).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_finalize(p_ticket_id uuid, p_token text, p_customer jsonb,
  p_participants jsonb, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t record; v_r record;
  v_email text; v_customer uuid; v_matches int; v_hash text;
  v_snap_p jsonb; v_p jsonb; v_pid uuid;
  v_map jsonb := '{}'::jsonb; v_line jsonb; v_aid uuid; v_ref text;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR p_token IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;

  v_email := lower(trim(COALESCE(p_customer->>'email','')));
  v_hash := md5(jsonb_build_object('c', COALESCE(p_customer,'null'::jsonb), 'p', COALESCE(p_participants,'null'::jsonb),
                                   'n', COALESCE(p_notes,''))::text);

  IF v_r.state = 'released' THEN
    RETURN public.bc_2627_err(CASE WHEN v_t.status = 'expired' THEN 'expired' ELSE 'invalid_status' END, COALESCE(v_t.status,''));
  END IF;
  IF v_r.state IN ('finalized','invoicing','confirmed') THEN
    IF v_r.finalize_hash IS DISTINCT FROM v_hash THEN
      RETURN public.bc_2627_err('finalize_conflict','Reservation wurde bereits mit anderen Angaben abgeschlossen');
    END IF;
    IF v_r.state = 'finalized' AND (v_t.status = 'expired' OR v_t.reservation_expires_at < now()) THEN
      RETURN public.bc_2627_err('expired','Reservation expired');
    END IF;
    RETURN jsonb_build_object('status','success','already_finalized',true,'ticket_id',v_t.id,'state',v_r.state);
  END IF;
  -- state = held
  IF v_t.status = 'expired' OR v_t.reservation_expires_at IS NULL OR v_t.reservation_expires_at < now() THEN
    RETURN public.bc_2627_err('expired','Reservation expired');
  END IF;
  IF v_t.status IS DISTINCT FROM 'provisional' THEN
    RETURN public.bc_2627_err('invalid_status',COALESCE(v_t.status,''));
  END IF;
  IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object'
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR COALESCE(trim(p_customer->>'first_name'),'') = '' OR COALESCE(trim(p_customer->>'last_name'),'') = '' THEN
    RETURN public.bc_2627_err('invalid_customer','Kunde mit E-Mail, Vor- und Nachname erforderlich');
  END IF;
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_participants) <> jsonb_array_length(v_r.quote_snapshot->'participants')
     OR (SELECT count(DISTINCT value->>'ref') FROM jsonb_array_elements(p_participants)) <> jsonb_array_length(p_participants) THEN
    RETURN public.bc_2627_err('participant_count_mismatch','Anzahl Teilnehmende passt nicht');
  END IF;
  FOR v_snap_p IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'participants') LOOP
    v_p := NULL;
    SELECT value INTO v_p FROM jsonb_array_elements(p_participants) WHERE value->>'ref' = v_snap_p->>'ref';
    IF v_p IS NULL OR COALESCE(trim(v_p->>'first_name'),'') = ''
       OR (v_p->>'birth_date') IS DISTINCT FROM (v_snap_p->>'birth_date')
       OR (v_p->>'discipline') IS DISTINCT FROM (v_snap_p->>'discipline')
       OR (v_p->>'skill_level') IS DISTINCT FROM (v_snap_p->>'skill_level') THEN
      RETURN public.bc_2627_err('participant_mismatch','Teilnehmende weichen von der geprüften Reservation ab');
    END IF;
  END LOOP;

  SELECT count(*), min(id::text)::uuid INTO v_matches, v_customer FROM public.customers
   WHERE lower(trim(email)) = v_email AND merged_into_id IS NULL AND is_archived IS NOT TRUE;
  -- customers.email is UNIQUE (exact). >1 active match = case variants; 0 active but a merged/archived
  -- row holding the address would collide. Never guess or link: office must resolve.
  IF v_matches > 1 OR (v_matches = 0 AND EXISTS (SELECT 1 FROM public.customers WHERE lower(trim(email)) = v_email)) THEN
    RETURN public.bc_2627_err('customer_ambiguous','Kundenkonto mit dieser E-Mail nicht eindeutig; bitte Büro kontaktieren');
  END IF;
  IF v_matches = 0 THEN
    INSERT INTO public.customers(first_name,last_name,email,phone,street,zip,city,country,holiday_address,customer_type)
    VALUES (trim(p_customer->>'first_name'),trim(p_customer->>'last_name'),v_email,p_customer->>'phone',p_customer->>'street',
            p_customer->>'zip',p_customer->>'city',COALESCE(NULLIF(p_customer->>'country',''),'CH'),'','private')
    RETURNING id INTO v_customer;
  END IF;

  FOR v_p IN SELECT value FROM jsonb_array_elements(p_participants) LOOP
    v_pid := NULL;
    SELECT id INTO v_pid FROM public.customer_participants
     WHERE customer_id = v_customer AND merged_into_id IS NULL AND is_archived IS NOT TRUE
       AND lower(trim(first_name)) = lower(trim(v_p->>'first_name'))
       AND lower(trim(COALESCE(last_name,''))) = lower(trim(COALESCE(v_p->>'last_name','')))
       AND birth_date = (v_p->>'birth_date')::date
     ORDER BY created_at, id LIMIT 1;
    IF v_pid IS NULL THEN
      INSERT INTO public.customer_participants(customer_id,first_name,last_name,birth_date,sport,level_current_season)
      VALUES (v_customer,trim(v_p->>'first_name'),NULLIF(trim(COALESCE(v_p->>'last_name','')),''),
              (v_p->>'birth_date')::date,v_p->>'discipline',v_p->>'skill_level')
      RETURNING id INTO v_pid;
    END IF;
    v_map := v_map || jsonb_build_object(v_p->>'ref', v_pid);
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'lines') LOOP
    IF v_line->>'kind' = 'group' THEN
      UPDATE public.ticket_items SET participant_id = (v_map->>(v_line->>'participant_ref'))::uuid
       WHERE ticket_id = p_ticket_id AND id = (v_line->'ticket_item_ids'->>0)::uuid;
    ELSE
      -- EVERY participant on EVERY appointment of the private selection.
      FOR v_aid IN SELECT x::uuid FROM jsonb_array_elements_text(v_line->'appointment_ids') x LOOP
        FOR v_ref IN SELECT x FROM jsonb_array_elements_text(v_line->'participant_refs') x LOOP
          INSERT INTO public.private_appointment_participants(appointment_id, participant_id)
          VALUES (v_aid, (v_map->>v_ref)::uuid);
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.tickets SET customer_id = v_customer,
    notes = COALESCE(NULLIF(trim(COALESCE(p_notes,'')),''), notes),
    finalized_at = now(),
    reservation_expires_at = greatest(reservation_expires_at, now() + interval '15 minutes'),
    updated_at = now()
  WHERE id = p_ticket_id;
  UPDATE public.bc_2627_reservations SET state = 'finalized', finalize_hash = v_hash, customer_id = v_customer,
         recipient_email = v_email, finalized_at = now()
   WHERE ticket_id = p_ticket_id;
  RETURN jsonb_build_object('status','success','ticket_id',p_ticket_id,'state','finalized');
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_finalize(uuid,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_finalize(uuid,text,jsonb,jsonb,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Begin invoicing: the point of no return BEFORE any invoice is created.
-- Atomically checks expiry/status and moves ticket -> invoice_pending, which the
-- expiry job and website cancel never touch. Hence an invoice can never be issued
-- for a hold that is concurrently expired/cancelled (no orphan open invoice).
-- Returns the server-bound customer, recipient and authoritative quote total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_begin_invoice(p_ticket_id uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_t record; v_r record;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR p_token IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;
  IF v_r.state = 'finalized' THEN
    IF v_t.status IS DISTINCT FROM 'provisional' OR v_t.reservation_expires_at IS NULL OR v_t.reservation_expires_at < now() THEN
      RETURN public.bc_2627_err('expired','Reservation expired');
    END IF;
    IF v_t.total_amount IS DISTINCT FROM v_r.quote_total THEN
      RETURN public.bc_2627_err('total_mismatch','Ticketbetrag weicht vom Angebot ab');
    END IF;
    UPDATE public.tickets SET status = 'invoice_pending', payment_method = 'invoice', updated_at = now() WHERE id = p_ticket_id;
    UPDATE public.bc_2627_reservations SET state = 'invoicing' WHERE ticket_id = p_ticket_id;
  ELSIF v_r.state NOT IN ('invoicing','confirmed') THEN
    RETURN public.bc_2627_err(CASE WHEN v_r.state = 'held' THEN 'not_finalized' ELSE 'invalid_status' END, v_r.state);
  END IF;
  RETURN jsonb_build_object('status','success','ticket_id',v_t.id,'ticket_number',v_t.ticket_number,
    'customer_id',v_r.customer_id,'recipient_email',v_r.recipient_email,'total_amount',v_r.quote_total,
    'state',CASE WHEN v_r.state = 'finalized' THEN 'invoicing' ELSE v_r.state END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_begin_invoice(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_begin_invoice(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.bc_2627_recount_instances(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Lock rows in id order (NO KEY UPDATE does not conflict with FK KEY SHARE locks of
  -- enrollment inserts), then count in a NEW statement -> fresh READ COMMITTED snapshot.
  PERFORM 1 FROM public.group_course_instances WHERE id = ANY(p_ids) ORDER BY id FOR NO KEY UPDATE;
  UPDATE public.group_course_instances gi
     SET current_participants = (SELECT count(*)::int FROM public.group_course_enrollments e WHERE e.instance_id = gi.id)
   WHERE gi.id = ANY(p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.bc_2627_recount_instances(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_recount_instances(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Confirm: requires state invoicing + exactly one open invoice equal to the
-- immutable quote total for the bound customer. Creates group enrollments for
-- every booked instance and the canonical private billing line per appointment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bc_2627_confirm(p_ticket_id uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t record; v_r record; v_inv record; v_n int;
  v_line jsonb; v_inst uuid; v_item uuid; v_pid uuid; v_aid uuid; v_appt record; v_persons int;
  v_touched uuid[] := ARRAY[]::uuid[]; v_all_appts uuid[] := ARRAY[]::uuid[];
  v_created int := 0;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_t IS NULL OR p_token IS NULL OR v_t.reservation_token IS DISTINCT FROM p_token THEN
    RETURN public.bc_2627_err('not_found','Reservation not found');
  END IF;
  SELECT * INTO v_r FROM public.bc_2627_reservations WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN public.bc_2627_err('not_found','Keine 26/27 Reservation'); END IF;
  SELECT count(*) INTO v_n FROM public.invoices WHERE ticket_id = p_ticket_id AND status = 'open';
  IF v_r.state = 'confirmed' THEN
    SELECT * INTO v_inv FROM public.invoices WHERE ticket_id = p_ticket_id AND status = 'open';
    RETURN jsonb_build_object('status','success','already_confirmed',true,'ticket_id',v_t.id,
      'invoice_id',v_inv.id,'invoice_number',v_inv.invoice_number,'due_date',v_inv.due_date);
  END IF;
  IF v_r.state <> 'invoicing' OR v_t.status IS DISTINCT FROM 'invoice_pending' THEN
    RETURN public.bc_2627_err('invalid_status', v_r.state||'/'||COALESCE(v_t.status,''));
  END IF;
  IF v_n <> 1 THEN RETURN public.bc_2627_err('invoice_missing',format('%s offene Rechnungen',v_n)); END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE ticket_id = p_ticket_id AND status = 'open';
  IF v_inv.total IS DISTINCT FROM v_r.quote_total OR v_inv.customer_id IS DISTINCT FROM v_r.customer_id THEN
    RETURN public.bc_2627_err('invoice_mismatch','Rechnung passt nicht zu Angebot/Kunde');
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_r.quote_snapshot->'lines') LOOP
    IF v_line->>'kind' = 'group' THEN
      v_item := (v_line->'ticket_item_ids'->>0)::uuid;
      SELECT participant_id INTO v_pid FROM public.ticket_items WHERE id = v_item;
      IF v_pid IS NULL THEN RAISE EXCEPTION 'confirm: line without participant'; END IF;
      FOR v_inst IN SELECT x::uuid FROM jsonb_array_elements_text(v_line->'instance_ids') x LOOP
        INSERT INTO public.group_course_enrollments(instance_id,ticket_item_id,participant_id,training_group_id,attendance_status)
        VALUES (v_inst,v_item,v_pid,(v_line->>'training_group_id')::uuid,'registered');
        v_created := v_created + 1;
        v_touched := v_touched || v_inst;
      END LOOP;
    ELSE
      v_persons := jsonb_array_length(v_line->'participant_refs');
      FOR v_aid IN SELECT x::uuid FROM jsonb_array_elements_text(v_line->'appointment_ids') x LOOP
        SELECT * INTO v_appt FROM public.private_appointments WHERE id = v_aid;
        INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end,
          meeting_point, unit_price, quantity, status, instructor_confirmation, item_type,
          group_participant_count, period_group_id, appointment_id)
        VALUES (p_ticket_id, (v_line->>'product_id')::uuid, NULL, v_appt.instructor_id, v_appt.date, v_appt.time_start,
          v_appt.time_end, v_appt.meeting_point, v_appt.price, 1, 'booked', v_appt.instructor_confirmation,
          'private', v_persons, v_appt.period_group_id, v_aid);
        v_all_appts := v_all_appts || v_aid;
      END LOOP;
    END IF;
  END LOOP;
  IF cardinality(v_touched) > 0 THEN PERFORM public.bc_2627_recount_instances(v_touched); END IF;
  IF (SELECT coalesce(sum(line_total),0) FROM public.ticket_items
       WHERE ticket_id = p_ticket_id AND COALESCE(status,'') <> 'cancelled') IS DISTINCT FROM v_r.quote_total THEN
    RAISE EXCEPTION 'confirm: billing lines do not equal immutable quote total';
  END IF;
  IF cardinality(v_all_appts) > 0 THEN
    PERFORM public.pa_emit_change(p_ticket_id, v_all_appts, 'created', NULL, jsonb_build_object('source','website_bc2627'));
  END IF;
  UPDATE public.tickets SET status = 'confirmed', payment_method = 'invoice', payment_due_date = v_inv.due_date,
         reservation_expires_at = NULL, updated_at = now() WHERE id = p_ticket_id;
  UPDATE public.bc_2627_reservations SET state = 'confirmed' WHERE ticket_id = p_ticket_id;
  RETURN jsonb_build_object('status','success','ticket_id',p_ticket_id,'enrollments_created',v_created,
    'private_lines_created',cardinality(v_all_appts),
    'invoice_id',v_inv.id,'invoice_number',v_inv.invoice_number,'due_date',v_inv.due_date);
END;
$fn$;
REVOKE ALL ON FUNCTION public.bc_2627_confirm(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bc_2627_confirm(uuid,text) TO service_role;
