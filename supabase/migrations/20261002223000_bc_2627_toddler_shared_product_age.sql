-- Two distinct YETI levels share the one 26/27 toddler product:
-- Windel Wedel 3–4, Swiss Snow Kids Village 4–6. Product union = 3–6.
-- The age of the *selected course* must be checked before reservation.
-- Only two inactive source-imported product metadata rows may change.
DO $toddler_union$
DECLARE
  v_season uuid;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('malbun-2627-toddler-product-age'));
  SELECT id INTO v_season FROM public.seasons
    WHERE name='Winter 26/27' AND start_date=DATE '2026-12-01'
      AND end_date=DATE '2027-04-15' AND is_current IS TRUE;
  IF v_season IS NULL THEN RAISE EXCEPTION 'Toddler age: season drift'; END IF;
  SELECT count(*) INTO v_count FROM public.products p
    WHERE p.season_id=v_season AND p.type='group_toddler' AND p.audience='kids'
      AND p.discipline='ski' AND EXISTS (
        SELECT 1 FROM public.bc_product_tariff_sources src
        WHERE src.product_id=p.id AND src.import_status='draft');
  IF v_count<>2 OR EXISTS (
    SELECT 1 FROM public.products p
      WHERE p.season_id=v_season AND p.type='group_toddler' AND p.audience='kids'
        AND p.discipline='ski' AND EXISTS (
          SELECT 1 FROM public.bc_product_tariff_sources src
          WHERE src.product_id=p.id AND src.import_status='draft')
        AND (p.min_age IS DISTINCT FROM 3 OR p.max_age IS DISTINCT FROM 4
             OR p.is_active IS NOT FALSE)
  ) THEN RAISE EXCEPTION 'Toddler age: preimage drift'; END IF;
  UPDATE public.products p SET max_age=6
    WHERE p.season_id=v_season AND p.type='group_toddler' AND p.audience='kids'
      AND p.discipline='ski' AND p.min_age=3 AND p.max_age=4 AND p.is_active IS FALSE
      AND EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                  WHERE src.product_id=p.id AND src.import_status='draft');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>2 THEN RAISE EXCEPTION 'Toddler age: updated % products, expected 2',v_count; END IF;
END;
$toddler_union$;
