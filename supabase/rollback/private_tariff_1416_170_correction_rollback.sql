-- Rollback for private_tariff_1416_170_correction.sql: sets 14–16 back to 190 through the same canonical save
-- (new revision, so quotes on the 170 revision also become stale). Bookings priced at 170 meanwhile stay as stored.
-- psql "$DB" -v ON_ERROR_STOP=1 -v expected_revision=<current, normally 2> -f this file
BEGIN;
SELECT set_config('yeti.tr_rev', :'expected_revision', true);
DO $$
DECLARE product uuid; rules jsonb; res jsonb; rev int := current_setting('yeti.tr_rev')::int;
BEGIN
  FOREACH product IN ARRAY ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid] LOOP
    SELECT jsonb_agg(jsonb_build_object('rule_kind', rule_kind, 'window_start', to_char(window_start,'HH24:MI'), 'window_end', to_char(window_end,'HH24:MI'),
        'price_chf', CASE WHEN rule_kind='exact_block' AND window_start='14:00' AND window_end='16:00' THEN 190 ELSE price_chf END,
        'extra_person_chf', extra_person_chf, 'max_persons', max_persons, 'max_block_minutes', max_block_minutes, 'office_only', office_only,
        'provenance', CASE WHEN rule_kind='exact_block' AND window_start='14:00' AND window_end='16:00' THEN 'Rollback of 2026-10-25 170 correction' ELSE provenance END)
      ORDER BY rule_kind, window_start) INTO rules FROM public.product_private_tariff_rules WHERE product_id = product;
    res := public.save_product_private_tariff_rules(product, rev, rules, NULL);
    IF NOT coalesce((res->>'ok')::boolean, false) THEN RAISE EXCEPTION 'Rollback failed for %: %', product, res; END IF;
  END LOOP;
END $$;
COMMIT;
