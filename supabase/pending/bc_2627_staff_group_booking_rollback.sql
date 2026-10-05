-- Rollback for bc_2627_staff_group_booking.sql. Removes only the staff group-booking
-- functions; the submissions table is kept (it references real tickets) and marked retired.
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_book(jsonb, uuid);
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_options(date[], text);
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_blocks(uuid, int, text, date[]);
DO $$ BEGIN
  IF to_regclass('public.bc_2627_staff_group_submissions') IS NOT NULL THEN
    COMMENT ON TABLE public.bc_2627_staff_group_submissions IS 'DEPRECATED: staff group booking functions rolled back';
  END IF;
END $$;

-- Restore the original quote rule (group capacity limit, 1-5 persons for all products).
CREATE OR REPLACE FUNCTION public.quote_bc_2627_product(p_product_id uuid, p_items jsonb, p_participants integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_participants IS NULL OR p_participants < 1 OR p_participants > 5
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
  IF v_product.type<>'private' THEN
    SELECT min((src.source_payload->>'group_capacity')::integer) INTO v_capacity
      FROM public.bc_product_tariff_sources src
     WHERE src.product_id=p_product_id AND src.import_status='draft';
    IF v_capacity IS NULL OR p_participants>v_capacity THEN
      RAISE EXCEPTION 'Participant count exceeds source group capacity' USING ERRCODE='22023';
    END IF;
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
    'quote_version','bc-2627-exact-v1');
END;
$function$;
