-- PREPARED ONLY. Single transaction via migration installer. No backfill or product writes.
-- Preflight fails closed if an unrelated implementation already owns this table.
DO $$ BEGIN
  IF to_regclass('public.product_public_offerings') IS NOT NULL THEN
    RAISE EXCEPTION 'product_public_offerings already exists; inspect before installation';
  END IF;
END $$;

-- Immutable structural checks only; product/season-dependent checks live in the trigger.
CREATE FUNCTION public.product_offering_shape_ok(k text, w smallint[], d date[], b jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE x jsonb; a jsonb; z jsonb;
BEGIN
  IF k IS NULL OR w IS NULL OR d IS NULL OR b IS NULL OR jsonb_typeof(b) <> 'array' THEN RETURN false; END IF;
  IF k = 'flexible_private' THEN RETURN cardinality(w)=0 AND cardinality(d)=0 AND jsonb_array_length(b)=0; END IF;
  IF k = 'weekly' THEN
    IF cardinality(w) NOT BETWEEN 1 AND 7 OR cardinality(d)<>0 OR EXISTS (SELECT 1 FROM unnest(w) v WHERE v IS NULL OR v NOT BETWEEN 1 AND 7) OR (SELECT count(DISTINCT v) FROM unnest(w) v)<>cardinality(w) THEN RETURN false; END IF;
  ELSIF k = 'explicit_dates' THEN
    IF cardinality(w)<>0 OR cardinality(d) NOT BETWEEN 1 AND 366 OR array_position(d,NULL) IS NOT NULL OR (SELECT count(DISTINCT v) FROM unnest(d) v)<>cardinality(d) THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  IF jsonb_array_length(b) NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(b) LOOP
    IF jsonb_typeof(x)<>'object' OR jsonb_typeof(x->'start') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'end') IS DISTINCT FROM 'string'
      OR (x->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (x->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (x->>'start') >= (x->>'end') THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_array_length(b)=2 THEN
    a:=b->0; z:=b->1;
    IF a->>'start' < z->>'end' AND z->>'start' < a->>'end' THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;
CREATE TABLE public.product_public_offerings (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  schedule_kind text NOT NULL,
  weekdays smallint[] NOT NULL DEFAULT '{}',
  dates date[] NOT NULL DEFAULT '{}',
  time_blocks jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT product_public_offerings_shape_check CHECK (public.product_offering_shape_ok(schedule_kind, weekdays, dates, time_blocks))
);
GRANT SELECT ON public.product_public_offerings TO authenticated;
GRANT ALL ON public.product_public_offerings TO service_role;
ALTER TABLE public.product_public_offerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office read product offerings" ON public.product_public_offerings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE FUNCTION public.product_offering_validate() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p record; s record; total integer;
BEGIN
  SELECT type, duration_minutes, season_id INTO p FROM public.products WHERE id=NEW.product_id FOR UPDATE;
  IF NEW.schedule_kind='flexible_private' AND p.type<>'private' THEN RAISE EXCEPTION 'Flexible schedule requires private product'; END IF;
  IF NEW.schedule_kind<>'flexible_private' THEN
    SELECT sum(extract(epoch FROM ((v->>'end')::time-(v->>'start')::time))/60)::integer INTO total FROM jsonb_array_elements(NEW.time_blocks) v;
    IF p.duration_minutes>0 AND total<>p.duration_minutes THEN RAISE EXCEPTION 'Time blocks must match product duration'; END IF;
  END IF;
  IF NEW.schedule_kind='explicit_dates' AND p.season_id IS NOT NULL THEN
    SELECT start_date,end_date INTO s FROM public.seasons WHERE id=p.season_id;
    IF EXISTS (SELECT 1 FROM unnest(NEW.dates) d WHERE d<s.start_date OR d>s.end_date) THEN RAISE EXCEPTION 'Date outside season'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_offering_validate BEFORE INSERT OR UPDATE ON public.product_public_offerings
FOR EACH ROW EXECUTE FUNCTION public.product_offering_validate();

CREATE FUNCTION public.save_product_public_offering(p_product_id uuid, p_offering jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w smallint[]; d date[]; b jsonb; k text; r jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p_offering IS NULL OR p_offering='null'::jsonb THEN
    DELETE FROM public.product_public_offerings WHERE product_id=p_product_id;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_offering)<>'object' OR jsonb_typeof(p_offering->'weekdays') IS DISTINCT FROM 'array' OR jsonb_typeof(p_offering->'dates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid offering'; END IF;
  k:=p_offering->>'schedule_kind'; b:=p_offering->'time_blocks';
  SELECT coalesce(array_agg(value::smallint ORDER BY ord),'{}') INTO w FROM jsonb_array_elements_text(p_offering->'weekdays') WITH ORDINALITY AS x(value,ord);
  SELECT coalesce(array_agg(value::date ORDER BY ord),'{}') INTO d FROM jsonb_array_elements_text(p_offering->'dates') WITH ORDINALITY AS x(value,ord);
  IF NOT public.product_offering_shape_ok(k,w,d,b) THEN RAISE EXCEPTION 'Invalid offering shape or overlapping blocks'; END IF;
  INSERT INTO public.product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,updated_by)
  VALUES(p_product_id,k,w,d,b,p_actor)
  ON CONFLICT(product_id) DO UPDATE SET schedule_kind=EXCLUDED.schedule_kind,weekdays=EXCLUDED.weekdays,dates=EXCLUDED.dates,time_blocks=EXCLUDED.time_blocks,updated_at=now(),updated_by=EXCLUDED.updated_by;
  SELECT jsonb_build_object('schedule_kind',schedule_kind,'weekdays',weekdays,'dates',dates,'time_blocks',time_blocks) INTO r FROM public.product_public_offerings WHERE product_id=p_product_id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) TO service_role;
