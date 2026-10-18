-- PREPARED ONLY: apply once through tracked migration, after 0010/0011.
-- No business data writes or backfill. RLS and table grants remain unchanged.
DO $$ BEGIN
 IF to_regclass('public.product_public_offerings') IS NULL OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_public_offerings' AND column_name='display_schedule_text') THEN RAISE EXCEPTION '0011 prerequisite missing'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_public_offerings' AND column_name='series') OR to_regprocedure('public.product_series_dates(date,date,smallint[])') IS NOT NULL THEN RAISE EXCEPTION 'Series implementation already exists; inspect first'; END IF;
END $$;
CREATE FUNCTION public.product_series_dates(p_start date,p_end date,p_weekdays smallint[])
RETURNS date[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(array_agg(p_start+i ORDER BY i),'{}'::date[]) FROM generate_series(0,CASE WHEN p_end-p_start BETWEEN 0 AND 366 THEN p_end-p_start ELSE -1 END) i WHERE extract(isodow FROM p_start+i)::smallint=ANY(p_weekdays)
$$;
REVOKE ALL ON FUNCTION public.product_series_dates(date,date,smallint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_series_dates(date,date,smallint[]) TO service_role;
ALTER TABLE public.product_public_offerings ADD COLUMN series jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE FUNCTION public.product_series_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s jsonb; prev jsonb; pos integer:=0; p record; label_text text; dates date[]; tier_limit integer;
BEGIN
 IF jsonb_typeof(NEW.series) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.series)>24 THEN RAISE EXCEPTION 'Invalid series array'; END IF;
 IF jsonb_array_length(NEW.series)>0 AND NEW.schedule_kind<>'weekly' THEN RAISE EXCEPTION 'Series require weekly schedule'; END IF;
 SELECT se.start_date,se.end_date INTO p FROM public.products pr LEFT JOIN public.seasons se ON se.id=pr.season_id WHERE pr.id=NEW.product_id;
 SELECT max(day_count) INTO tier_limit FROM public.product_price_tiers WHERE product_id=NEW.product_id AND cumulative_price>0;
 FOR s IN SELECT value FROM jsonb_array_elements(NEW.series) LOOP
  pos:=pos+1;
  IF jsonb_typeof(s)<>'object' OR jsonb_typeof(s->'sequence') IS DISTINCT FROM 'number' OR (s->>'sequence')::numeric<>pos OR jsonb_typeof(s->'max_selected_days') IS DISTINCT FROM 'number' OR (s->>'max_selected_days')::numeric NOT BETWEEN 1 AND 366 OR (s->>'max_selected_days')::numeric<>trunc((s->>'max_selected_days')::numeric) THEN RAISE EXCEPTION 'Invalid series sequence or limit'; END IF;
  IF tier_limit IS NULL OR (s->>'max_selected_days')::integer>tier_limit THEN RAISE EXCEPTION 'Series limit exceeds existing price tiers'; END IF;
  IF s ? 'label' AND jsonb_typeof(s->'label') NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid series label'; END IF;
  label_text:=s->>'label';
  IF char_length(label_text)>160 OR label_text ~ ('[<>' || chr(1) || '-' || chr(31) || chr(127) || ']') THEN RAISE EXCEPTION 'Invalid series label'; END IF;
  IF jsonb_typeof(s->'start_date') IS DISTINCT FROM 'string' OR jsonb_typeof(s->'end_date') IS DISTINCT FROM 'string' OR (s->>'start_date') !~ '^\d{4}-\d{2}-\d{2}$' OR (s->>'end_date') !~ '^\d{4}-\d{2}-\d{2}$' OR (s->>'start_date')::date>(s->>'end_date')::date THEN RAISE EXCEPTION 'Invalid series range'; END IF;
  IF (s->>'start_date')::date<p.start_date OR (s->>'end_date')::date>p.end_date THEN RAISE EXCEPTION 'Series outside season'; END IF;
  dates:=public.product_series_dates((s->>'start_date')::date,(s->>'end_date')::date,NEW.weekdays);
  IF cardinality(dates)=0 THEN RAISE EXCEPTION 'Series has no offered dates'; END IF;
  FOR prev IN SELECT value FROM jsonb_array_elements(NEW.series) WITH ORDINALITY a(value,n) WHERE n<pos LOOP
   IF (s->>'start_date')::date<=(prev->>'end_date')::date AND (prev->>'start_date')::date<=(s->>'end_date')::date THEN RAISE EXCEPTION 'Series overlap'; END IF;
  END LOOP;
 END LOOP;
 -- Canonicalize optional labels without changing dates/order/limits.
 SELECT coalesce(jsonb_agg(value || jsonb_build_object('label',nullif(regexp_replace(value->>'label','^[[:space:]]+|[[:space:]]+$','','g'),'')) ORDER BY n),'[]'::jsonb) INTO NEW.series FROM jsonb_array_elements(NEW.series) WITH ORDINALITY a(value,n);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.product_series_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_series_guard() TO service_role;
CREATE TRIGGER product_series_guard BEFORE INSERT OR UPDATE ON public.product_public_offerings FOR EACH ROW EXECUTE FUNCTION public.product_series_guard();
COMMENT ON COLUMN public.product_public_offerings.series IS 'Ordered advertised weekly windows; not courses or booking authorization. Limit selections within one series.';
CREATE OR REPLACE FUNCTION public.save_product_public_offering(p_product_id uuid, p_offering jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w smallint[]; d date[]; b jsonb; k text; r jsonb; display_text text; series_value jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p_offering IS NULL OR p_offering='null'::jsonb THEN
    DELETE FROM public.product_public_offerings WHERE product_id=p_product_id;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_offering)<>'object' OR jsonb_typeof(p_offering->'weekdays') IS DISTINCT FROM 'array' OR jsonb_typeof(p_offering->'dates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid offering'; END IF;
  IF p_offering ? 'display_schedule_text' AND jsonb_typeof(p_offering->'display_schedule_text') NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid display schedule text'; END IF;
  display_text:=p_offering->>'display_schedule_text';
  IF display_text ~ ('[<>' || chr(1) || '-' || chr(31) || chr(127) || ']') THEN RAISE EXCEPTION 'Display schedule text must be single-line plain text without HTML'; END IF;
  display_text:=nullif(regexp_replace(display_text,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  IF char_length(display_text)>160 THEN RAISE EXCEPTION 'Display schedule text exceeds 160 characters'; END IF;
  SELECT series INTO series_value FROM public.product_public_offerings WHERE product_id=p_product_id;
  series_value:=CASE WHEN p_offering ? 'series' THEN p_offering->'series' ELSE coalesce(series_value,'[]'::jsonb) END;
  k:=p_offering->>'schedule_kind'; b:=p_offering->'time_blocks';
  SELECT coalesce(array_agg(value::smallint ORDER BY ord),'{}') INTO w FROM jsonb_array_elements_text(p_offering->'weekdays') WITH ORDINALITY AS x(value,ord);
  SELECT coalesce(array_agg(value::date ORDER BY ord),'{}') INTO d FROM jsonb_array_elements_text(p_offering->'dates') WITH ORDINALITY AS x(value,ord);
  IF NOT public.product_offering_shape_ok(k,w,d,b) THEN RAISE EXCEPTION 'Invalid offering shape or overlapping blocks'; END IF;
  INSERT INTO public.product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,updated_by,display_schedule_text,series)
  VALUES(p_product_id,k,w,d,b,p_actor,display_text,series_value)
  ON CONFLICT(product_id) DO UPDATE SET schedule_kind=EXCLUDED.schedule_kind,weekdays=EXCLUDED.weekdays,dates=EXCLUDED.dates,time_blocks=EXCLUDED.time_blocks,updated_at=now(),updated_by=EXCLUDED.updated_by,display_schedule_text=EXCLUDED.display_schedule_text,series=EXCLUDED.series;
  SELECT jsonb_build_object('schedule_kind',schedule_kind,'weekdays',weekdays,'dates',dates,'time_blocks',time_blocks,'display_schedule_text',display_schedule_text,'series',series) INTO r FROM public.product_public_offerings WHERE product_id=p_product_id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) TO service_role;

-- Read-only future quote helper: caller must separately validate internal course/date suitability.
-- No gate changes, reservations, payments, discount pooling or wall-clock dependency.
CREATE FUNCTION public.validate_product_series_selection(p_product_id uuid,p_sequence integer,p_dates date[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; s jsonb; offered date[]; tier numeric;
BEGIN
 SELECT * INTO o FROM public.product_public_offerings WHERE product_id=p_product_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Offering missing'; END IF;
 SELECT value INTO s FROM jsonb_array_elements(o.series) WHERE (value->>'sequence')::integer=p_sequence;
 IF s IS NULL OR p_dates IS NULL OR cardinality(p_dates)<1 OR cardinality(p_dates)>(s->>'max_selected_days')::integer OR array_position(p_dates,NULL) IS NOT NULL OR (SELECT count(DISTINCT d) FROM unnest(p_dates) d)<>cardinality(p_dates) THEN RAISE EXCEPTION 'Invalid series selection count'; END IF;
 offered:=public.product_series_dates((s->>'start_date')::date,(s->>'end_date')::date,o.weekdays);
 IF NOT p_dates <@ offered THEN RAISE EXCEPTION 'Dates must belong to one series'; END IF;
 SELECT cumulative_price INTO tier FROM public.product_price_tiers WHERE product_id=p_product_id AND day_count=cardinality(p_dates);
 IF tier IS NULL OR tier<=0 THEN RAISE EXCEPTION 'Exact day tier missing'; END IF;
 RETURN jsonb_build_object('product_id',p_product_id,'series_sequence',p_sequence,'day_count',cardinality(p_dates),'price',tier,'online_bookable',false);
END $$;
REVOKE ALL ON FUNCTION public.validate_product_series_selection(uuid,integer,date[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_series_selection(uuid,integer,date[]) TO service_role;
