-- PROPOSED, NOT RUN. Targeted tariff seed + office activation for exactly the two confirmed
-- Winter 26/27 private products. Requires product_private_tariff_rules.sql and b07_private_activation_guard.sql.
-- Never touches the five Winter 25/26 private products (incl. Schulatrif 60), public offerings or BC sources.
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/pending/b07_private_2627_activation.PROPOSED.sql
\set ON_ERROR_STOP 1
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id, type, is_active, season_id FROM public.products
            WHERE id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1') FOR UPDATE LOOP
    IF r.type <> 'private' OR r.season_id <> 'f185b448-e6aa-46b8-94ae-0875a7a6c166' THEN
      RAISE EXCEPTION 'unexpected product % (type %, season %)', r.id, r.type, r.season_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.product_private_tariff_revisions WHERE product_id = r.id) THEN
      RAISE EXCEPTION 'product % already has a tariff revision; review instead of reseeding', r.id;
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 2 THEN RAISE EXCEPTION 'expected both Winter 26/27 private products, found %', n; END IF;
END $$;

\set product_id '3646f155-8a66-53e3-b512-749f3a42c1ae'
\set expected_revision 0
\ir product_private_tariff_rules_seed.PROPOSED.sql
\set product_id '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'
\ir product_private_tariff_rules_seed.PROPOSED.sql

-- Office activation only; the guard re-checks coverage and raises otherwise.
UPDATE public.products SET is_active = true
 WHERE id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1') AND is_active IS FALSE;

-- Post-checks (must return 2 / 0 rows):
SELECT count(*) AS activated FROM public.products
 WHERE id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1') AND is_active AND public.private_tariff_activation_ok(id);
