-- PREPARED ONLY: install atomically with the tracked migration installer. NO seed/backfill.
-- Display information only. Never read by operational pa_*, quotes or invoice pricing.
DO $$ BEGIN
  IF to_regclass('public.public_private_tariff_display') IS NOT NULL
    OR to_regprocedure('public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid)') IS NOT NULL
    OR to_regprocedure('public.public_private_display_shape(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Conflicting public private display implementation; inspect first';
  END IF;
END $$;
CREATE FUNCTION public.public_private_display_shape(w jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE x jsonb; minutes integer; span numeric;
BEGIN
  IF w IS NULL OR jsonb_typeof(w)<>'array' OR jsonb_array_length(w) NOT BETWEEN 1 AND 48 THEN RETURN false; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(w) LOOP
    IF jsonb_typeof(x)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(x))<>7
      OR NOT (x ?& ARRAY['start','end','duration_minutes','amount_chf','extra_person_chf','classification','window_kind'])
      OR jsonb_typeof(x->'start') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'end') IS DISTINCT FROM 'string'
      OR (x->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (x->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR jsonb_typeof(x->'duration_minutes') IS DISTINCT FROM 'number' OR (x->>'duration_minutes') NOT IN ('60','120')
      OR jsonb_typeof(x->'amount_chf') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'extra_person_chf') IS DISTINCT FROM 'number'
      OR (x->>'amount_chf')::numeric NOT BETWEEN 0.01 AND 100000 OR (x->>'extra_person_chf')::numeric NOT BETWEEN 0 AND 100000
      OR round((x->>'amount_chf')::numeric,2)<>(x->>'amount_chf')::numeric
      OR round((x->>'extra_person_chf')::numeric,2)<>(x->>'extra_person_chf')::numeric
      OR coalesce(x->>'classification','') NOT IN ('standard','office_exception')
      OR coalesce(x->>'window_kind','') NOT IN ('exact','within') THEN RETURN false; END IF;
    minutes:=(x->>'duration_minutes')::integer;
    span:=extract(epoch FROM ((x->>'end')::time-(x->>'start')::time))/60;
    IF span<minutes OR (x->>'window_kind'='exact' AND span<>minutes)
      OR (x->>'window_kind'='within' AND x->>'classification'<>'office_exception') THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(w))<>(SELECT count(DISTINCT (v->>'start',v->>'end',v->>'duration_minutes',v->>'classification')) FROM jsonb_array_elements(w) v) THEN RETURN false; END IF;
  RETURN true;
END $$;
CREATE TABLE public.public_private_tariff_display (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  windows jsonb NOT NULL CHECK (public.public_private_display_shape(windows)),
  base_persons smallint NOT NULL DEFAULT 1 CHECK (base_persons=1),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent>0 AND discount_percent<=100),
  discount_threshold integer NOT NULL CHECK (discount_threshold>0),
  discount_unit text NOT NULL CHECK (discount_unit IN ('lessons','minutes')),
  discount_scope text NOT NULL DEFAULT 'same_participant_same_day' CHECK (discount_scope='same_participant_same_day'),
  source_note text NOT NULL CHECK (length(source_note) BETWEEN 1 AND 240 AND source_note !~ '[<>\n\r]'),
  source_date date NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid,
  verified_at timestamptz,
  PRIMARY KEY(product_id,season_id),
  CHECK ((verified_by IS NULL)=(verified_at IS NULL))
);
GRANT SELECT ON public.public_private_tariff_display TO authenticated;
GRANT ALL ON public.public_private_tariff_display TO service_role;
ALTER TABLE public.public_private_tariff_display ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read private display information" ON public.public_private_tariff_display
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
COMMENT ON TABLE public.public_private_tariff_display IS 'Website information ONLY, not operational rates. Explicit Office verification required before catalog projection; immutable BC provenance remains untouched.';
CREATE FUNCTION public.save_public_private_tariff_display(
 p_product_id uuid,p_season_id uuid,p_information jsonb,p_expected_revision integer,p_verify boolean,p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; old_revision integer; result jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT type,season_id,currency INTO p FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR p.type<>'private' OR p.season_id<>p_season_id OR coalesce(p.currency,'CHF')<>'CHF' THEN RAISE EXCEPTION 'Private CHF product/season mismatch'; END IF;
  PERFORM 1 FROM public.seasons WHERE id=p_season_id FOR SHARE;
  SELECT revision INTO old_revision FROM public.public_private_tariff_display WHERE product_id=p_product_id AND season_id=p_season_id FOR UPDATE;
  IF old_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Concurrent change: reload before saving' USING ERRCODE='40001'; END IF;
  IF p_information IS NULL OR jsonb_typeof(p_information)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_information))<>7
    OR NOT (p_information ?& ARRAY['windows','discount_percent','discount_threshold','discount_unit','discount_scope','source_note','source_date'])
    OR NOT public.public_private_display_shape(p_information->'windows')
    OR jsonb_typeof(p_information->'discount_percent') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_information->'discount_threshold') IS DISTINCT FROM 'number'
    OR (p_information->>'discount_threshold') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_information->'source_note') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_information->'source_date') IS DISTINCT FROM 'string'
    OR p_information->>'source_date' !~ '^\d{4}-\d{2}-\d{2}$'
    OR jsonb_typeof(p_information->'discount_unit') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_information->'discount_scope') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid display information'; END IF;
  INSERT INTO public.public_private_tariff_display(product_id,season_id,windows,discount_percent,discount_threshold,discount_unit,discount_scope,source_note,source_date,updated_by,verified_by,verified_at)
  VALUES(p_product_id,p_season_id,p_information->'windows',(p_information->>'discount_percent')::numeric,(p_information->>'discount_threshold')::integer,p_information->>'discount_unit',p_information->>'discount_scope',trim(p_information->>'source_note'),(p_information->>'source_date')::date,p_actor,CASE WHEN p_verify THEN p_actor END,CASE WHEN p_verify THEN now() END)
  ON CONFLICT(product_id,season_id) DO UPDATE SET windows=EXCLUDED.windows,discount_percent=EXCLUDED.discount_percent,discount_threshold=EXCLUDED.discount_threshold,discount_unit=EXCLUDED.discount_unit,discount_scope=EXCLUDED.discount_scope,source_note=EXCLUDED.source_note,source_date=EXCLUDED.source_date,revision=public.public_private_tariff_display.revision+1,updated_at=now(),updated_by=p_actor,verified_by=EXCLUDED.verified_by,verified_at=EXCLUDED.verified_at;
  SELECT to_jsonb(t) INTO result FROM public.public_private_tariff_display t WHERE product_id=p_product_id AND season_id=p_season_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.public_private_display_shape(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.public_private_display_shape(jsonb) TO authenticated,service_role;
