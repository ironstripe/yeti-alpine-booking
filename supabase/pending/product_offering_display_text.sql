-- PREPARED ONLY: incremental extension of installed 0010. Apply once, transactionally.
-- No product/course/price/history updates or backfill. Existing schedules default to NULL.
DO $$ BEGIN
  IF to_regclass('public.product_public_offerings') IS NULL
     OR to_regprocedure('public.save_product_public_offering(uuid,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Install and verify 0010 before this extension';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_public_offerings' AND column_name='display_schedule_text') THEN
    RAISE EXCEPTION 'display_schedule_text already exists; inspect before installation';
  END IF;
END $$;
ALTER TABLE public.product_public_offerings ADD COLUMN display_schedule_text text DEFAULT NULL;
ALTER TABLE public.product_public_offerings ADD CONSTRAINT product_offering_display_text_check CHECK (
  display_schedule_text IS NULL OR (
    char_length(display_schedule_text) BETWEEN 1 AND 160
    AND display_schedule_text = regexp_replace(display_schedule_text,'^[[:space:]]+|[[:space:]]+$','','g')
    AND display_schedule_text !~ '[<>[:cntrl:]]'
  )
);
COMMENT ON COLUMN public.product_public_offerings.display_schedule_text IS 'Editorial website label only; never booking authorization. Machine-readable schedule remains authoritative.';
CREATE OR REPLACE FUNCTION public.save_product_public_offering(p_product_id uuid, p_offering jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w smallint[]; d date[]; b jsonb; k text; r jsonb; display_text text;
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
  IF display_text ~ '[<>[:cntrl:]]' THEN RAISE EXCEPTION 'Display schedule text must be single-line plain text without HTML'; END IF;
  display_text:=nullif(regexp_replace(display_text,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  IF char_length(display_text)>160 THEN RAISE EXCEPTION 'Display schedule text exceeds 160 characters'; END IF;
  k:=p_offering->>'schedule_kind'; b:=p_offering->'time_blocks';
  SELECT coalesce(array_agg(value::smallint ORDER BY ord),'{}') INTO w FROM jsonb_array_elements_text(p_offering->'weekdays') WITH ORDINALITY AS x(value,ord);
  SELECT coalesce(array_agg(value::date ORDER BY ord),'{}') INTO d FROM jsonb_array_elements_text(p_offering->'dates') WITH ORDINALITY AS x(value,ord);
  IF NOT public.product_offering_shape_ok(k,w,d,b) THEN RAISE EXCEPTION 'Invalid offering shape or overlapping blocks'; END IF;
  INSERT INTO public.product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,updated_by,display_schedule_text)
  VALUES(p_product_id,k,w,d,b,p_actor,display_text)
  ON CONFLICT(product_id) DO UPDATE SET schedule_kind=EXCLUDED.schedule_kind,weekdays=EXCLUDED.weekdays,dates=EXCLUDED.dates,time_blocks=EXCLUDED.time_blocks,updated_at=now(),updated_by=EXCLUDED.updated_by,display_schedule_text=EXCLUDED.display_schedule_text;
  SELECT jsonb_build_object('schedule_kind',schedule_kind,'weekdays',weekdays,'dates',dates,'time_blocks',time_blocks,'display_schedule_text',display_schedule_text) INTO r FROM public.product_public_offerings WHERE product_id=p_product_id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) TO service_role;
