-- Owner decision 2026-10-03: group courses are for children/youth through age 16;
-- the source-backed Ski Erwachsene groups explicitly remain bookable exceptions.
-- Set product age metadata only. NEVER activate products or create courses here.
-- Do not rerun manually after success on the shared Lovable Cloud.
DO $age_policy$
DECLARE
  v_count integer;
  v_season uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('malbun-2627-group-age-policy'));
  SELECT id INTO v_season FROM public.seasons
  WHERE name='Winter 26/27' AND start_date=DATE '2026-12-01'
    AND end_date=DATE '2027-04-15' AND is_current IS TRUE;
  IF v_season IS NULL OR (SELECT count(*) FROM public.seasons WHERE is_current)<>1 THEN
    RAISE EXCEPTION '26/27 age policy: season drift';
  END IF;
  SELECT count(*) INTO v_count FROM public.products p
  WHERE p.season_id=v_season AND p.type IN ('group','group_toddler')
    AND EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                WHERE src.product_id=p.id AND src.import_status='draft');
  IF v_count<>13 OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.season_id=v_season AND p.type IN ('group','group_toddler')
      AND EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                  WHERE src.product_id=p.id AND src.import_status='draft')
      AND (p.is_active IS NOT FALSE OR p.min_age IS NOT NULL OR p.max_age IS NOT NULL
           OR p.audience NOT IN ('adults','kids','mixed')
           OR (p.audience='mixed' AND p.discipline<>'snowboard')
           OR (p.type='group_toddler' AND p.audience<>'kids'))
  ) THEN
    RAISE EXCEPTION '26/27 age policy: product preimage drift';
  END IF;
  UPDATE public.products p
     SET min_age=CASE WHEN p.audience='adults' THEN 17
                      WHEN p.type='group_toddler' THEN 3 ELSE 0 END,
         max_age=CASE WHEN p.audience='adults' THEN 120
                      WHEN p.type='group_toddler' THEN 4 ELSE 16 END
   WHERE p.season_id=v_season AND p.type IN ('group','group_toddler')
     AND EXISTS (SELECT 1 FROM public.bc_product_tariff_sources src
                 WHERE src.product_id=p.id AND src.import_status='draft');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>13 THEN RAISE EXCEPTION '26/27 age policy: wrote % products, expected 13',v_count; END IF;
END;
$age_policy$;
