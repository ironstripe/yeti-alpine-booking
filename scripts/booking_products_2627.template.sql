-- Booking-Corner Malbun 26/27: INACTIVE PRODUCT DRAFTS ONLY.
-- LIVE STATUS: APPLIED on 2026-10-01; do not rerun manually on shared YETI Cloud.
-- Source snapshot: 2026-09-30. All source values stored, but no website/course
-- publication and no change to the live booking/checkout pricing algorithm.
-- DO NOT rerun after a successful COMMIT; the one-time preflight will abort.
-- Run under a single BEGIN/COMMIT transaction, never by statement-by-statement UI.

DO $preflight$
DECLARE
  v_season uuid;
  v_existing integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('malbun-2627-product-drafts'));
  SELECT id INTO v_season FROM public.seasons
  WHERE name = 'Winter 26/27' AND start_date = DATE '2026-12-01'
    AND end_date = DATE '2027-04-15' AND is_current IS TRUE;
  IF v_season IS NULL OR (SELECT count(*) FROM public.seasons WHERE is_current) <> 1 THEN
    RAISE EXCEPTION 'Target season changed; abort product import';
  END IF;
  SELECT count(*) INTO v_existing FROM public.products;
  IF v_existing <> 15 OR (SELECT count(*) FROM public.products WHERE season_id=v_season) <> 0
     OR (SELECT count(*) FROM public.products WHERE is_active) <> 15
     OR (SELECT count(*) FROM public.product_price_tiers) <> 13
     OR (SELECT count(*) FROM public.private_lesson_rates) <> 4
     OR to_regclass('public.bc_product_tariff_sources') IS NOT NULL THEN
     RAISE EXCEPTION 'Product/price preimage drift or import already applied';
  END IF;
END;
$preflight$;

CREATE TABLE public.bc_product_tariff_sources (
  source_id text PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  source_sha256 text NOT NULL,
  source_family text NOT NULL,
  import_status text NOT NULL CHECK (import_status IN ('draft','deferred_care')),
  day_count integer NOT NULL CHECK (day_count BETWEEN 1 AND 7),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 60 AND 420),
  persons_per_lesson integer NOT NULL CHECK (persons_per_lesson BETWEEN 1 AND 5),
  price_chf numeric(10,2) NOT NULL CHECK (price_chf >= 0),
  source_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((import_status='draft' AND product_id IS NOT NULL) OR
         (import_status='deferred_care' AND product_id IS NULL))
);
CREATE INDEX bc_product_tariff_sources_product_idx ON public.bc_product_tariff_sources(product_id);
ALTER TABLE public.bc_product_tariff_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bc_product_tariff_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bc_product_tariff_sources TO authenticated;
GRANT ALL ON public.bc_product_tariff_sources TO service_role;
CREATE POLICY "Staff read BC tariff evidence" ON public.bc_product_tariff_sources
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- A UI toggle cannot accidentally make unvalidated legacy pricing bookable.
-- A later reviewed release migration must explicitly remove this guard after
-- booking, invoice, public API and incomplete-tier cases are covered.
CREATE FUNCTION public.prevent_bc_draft_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $guard$
BEGIN
  IF NEW.is_active IS TRUE AND EXISTS
      (SELECT 1 FROM public.bc_product_tariff_sources WHERE product_id=NEW.id) THEN
    RAISE EXCEPTION 'Booking-Corner draft cannot be activated before pricing release gate';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.prevent_bc_draft_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_bc_draft_activation_on_products
  BEFORE UPDATE OF is_active ON public.products
  FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.prevent_bc_draft_activation();

DO $apply$
DECLARE
  v_payload jsonb := $bc_json$__SOURCE_JSON__$bc_json$::jsonb;
  v_sha text := '__SOURCE_SHA256__';
  v_season uuid;
  v_count integer;
BEGIN
  SELECT id INTO STRICT v_season FROM public.seasons WHERE name='Winter 26/27'
    AND start_date=DATE '2026-12-01' AND end_date=DATE '2027-04-15' AND is_current IS TRUE;
  IF jsonb_array_length(v_payload->'products') <> 15 OR jsonb_array_length(v_payload->'tariffs') <> 121 THEN
    RAISE EXCEPTION 'Embedded product/source row count drift';
  END IF;
  IF (SELECT count(DISTINCT rowdata->>'source_id') FROM jsonb_array_elements(v_payload->'tariffs') rowdata) <> 121
     OR (SELECT count(*) FROM jsonb_array_elements(v_payload->'tariffs') rowdata
         WHERE rowdata->>'status' = 'deferred_care') <> 6 THEN
    RAISE EXCEPTION 'Source identity/care classification drift';
  END IF;

  INSERT INTO public.products
    (id,season_id,name,description,type,duration_minutes,price,currency,vat_rate,
     is_active,sort_order,pricing_type,is_training_product,discipline,audience,reporting_category)
  SELECT (p->>'product_id')::uuid, v_season, p->>'name', p->>'description', p->>'type',
         (p->>'duration_minutes')::integer,(p->>'price')::numeric,'CHF',7.7,
         false,200+(row_number() OVER (ORDER BY p->>'product_key'))::integer,
         p->>'pricing_type', false,p->>'discipline',p->>'audience',p->>'reporting_category'
  FROM jsonb_array_elements(v_payload->'products') p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 15 THEN RAISE EXCEPTION 'Expected 15 inactive products, got %',v_count; END IF;

  INSERT INTO public.bc_product_tariff_sources
    (source_id,season_id,product_id,source_sha256,source_family,import_status,
     day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
  SELECT r->>'source_id',v_season,(m.product_record->>'product_id')::uuid,v_sha,
         r->>'family',r->>'status',(r->>'day_count')::int,(r->>'duration_minutes')::int,
         (r->>'persons')::int,(r->>'amount')::numeric,r
  FROM jsonb_array_elements(v_payload->'tariffs') r
  LEFT JOIN LATERAL (
    SELECT p AS product_record FROM jsonb_array_elements(v_payload->'products') p
    WHERE p->>'product_key'=r->>'product_key' LIMIT 1
  ) m ON true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 121 THEN RAISE EXCEPTION 'Expected 121 source tariffs, got %',v_count; END IF;

  -- Existing YETI product_price_tiers are cumulative group day prices.
  -- Only source-present day counts are added. Missing day counts stay absent.
  INSERT INTO public.product_price_tiers(product_id,day_count,cumulative_price)
  SELECT s.product_id,s.day_count,s.price_chf FROM public.bc_product_tariff_sources s
  WHERE s.import_status='draft' AND s.source_family IN ('Gruppenunterricht','Samstagkurs');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 45 THEN RAISE EXCEPTION 'Expected 45 verified group day tiers, got %',v_count; END IF;

  IF (SELECT count(*) FROM public.products WHERE season_id=v_season AND is_active IS FALSE) <> 15
      OR (SELECT count(*) FROM public.products WHERE is_active IS TRUE) <> 15
      OR (SELECT count(*) FROM public.product_price_tiers) <> 58
      OR (SELECT count(*) FROM public.bc_product_tariff_sources WHERE import_status='draft' AND source_family='Privatkurs') <> 70
      OR (SELECT count(*) FROM public.bc_product_tariff_sources WHERE import_status='deferred_care') <> 6
      OR (SELECT count(*) FROM public.products WHERE season_id=v_season AND currency='CHF') <> 15
      OR (SELECT count(*) FROM public.bc_product_tariff_sources WHERE source_sha256=v_sha) <> 121 THEN
    RAISE EXCEPTION 'Postflight mismatch: roll back the product draft transaction';
  END IF;
  RAISE NOTICE 'Imported 15 inactive 26/27 product drafts, 45 verified group tiers, 70 private price points, 6 deferred care tariffs';
END;
$apply$;
