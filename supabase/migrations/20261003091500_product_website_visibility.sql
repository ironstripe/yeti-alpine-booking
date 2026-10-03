-- Website listing is an explicit decision on each product, independent of
-- internal activation and online booking. Preserve the already published 17
-- informational cards of Winter 26/27; future products default to hidden.
BEGIN;

DO $preflight$
DECLARE
  v_season uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('yeti-product-website-visibility-v1'));
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'show_on_website'
  ) THEN
    RAISE EXCEPTION 'Website product visibility already migrated';
  END IF;
  IF (SELECT count(*) FROM public.seasons WHERE is_current IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one current season';
  END IF;
  SELECT id INTO v_season FROM public.seasons
  WHERE is_current IS TRUE AND name = 'Winter 26/27';
  IF v_season IS NULL OR
     (SELECT count(*) FROM public.products
      WHERE season_id = v_season AND type <> 'office_shift') <> 17 THEN
    RAISE EXCEPTION 'Published 17-product baseline changed; abort';
  END IF;
  IF (SELECT count(*) FROM public.products p
      WHERE p.season_id = v_season AND p.type <> 'office_shift'
        AND p.is_active IS TRUE) <> 0 THEN
    RAISE EXCEPTION '26/27 product activation changed; re-evaluate baseline';
  END IF;
END;
$preflight$;

ALTER TABLE public.products
  ADD COLUMN show_on_website boolean NOT NULL DEFAULT false;

UPDATE public.products
SET show_on_website = true
WHERE season_id = (SELECT id FROM public.seasons WHERE is_current IS TRUE)
  AND type <> 'office_shift';

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM public.products WHERE show_on_website IS TRUE) <> 17 THEN
    RAISE EXCEPTION 'Expected exactly 17 preserved public products';
  END IF;
END;
$postflight$;

COMMIT;
