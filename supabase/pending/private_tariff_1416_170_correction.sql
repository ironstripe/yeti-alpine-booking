-- TARIFF CORRECTION 2026-10-25 (Ivo, DECISIONS "Tarifkorrektur: Privat-Doppelstunde 14–16 = CHF 170").
-- PREPARED, NOT EXECUTED. Data step, not a schema migration. For NEW quotes/bookings only.
-- Exactly two Winter 26/27 private products (Ski 3646f155…, Snowboard 0e8e8669…). Changes ONE rule value each:
-- exact_block 14:00–16:00 price 190 -> 170 (extra person stays 40). All other 8 rules are carried over unchanged
-- from the current rows. Written via the canonical revision-checked public.save_product_private_tariff_rules
-- (expected revision 1 -> 2). The revision bump makes every quote/acknowledgement issued on revision 1 fail with
-- `quote_changed` (pa_create_booking / b07a_office_multi / L1 requote) - existing semantics, nothing new.
-- NOT touched: stored private_appointment_pricing, ticket_items, invoices, payments, delivery payloads,
-- bc_product_tariff_sources, legacy private_lesson_rates/matrix, discount rule, display metadata, products.
-- Note: the save replaces the rule rows, so rule IDs change (before IDs of the 14–16 rule:
-- Ski 45b0102a-c285-4a13-a2e9-5bd2b1e9aadf, Snowboard d6deec82-7fec-4b30-9ee3-522c5412ca96).
--
-- Run (privileged psql):  psql "$DB" -v ON_ERROR_STOP=1 -f supabase/pending/private_tariff_1416_170_correction.sql
-- Actor: NULL like the reviewed activation 0028 (installer run); provenance text names the decision and source.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE ids uuid[] := ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid];
  product uuid; rules jsonb; res jsonb; q jsonb; n int; prov text :=
  'Ivo 2026-10-25 DECISIONS Tarifkorrektur: Doppelstunde 14-16 = CHF 170 (vorher 190); installer run';
BEGIN
  FOREACH product IN ARRAY ids LOOP
    IF (SELECT revision FROM public.product_private_tariff_revisions WHERE product_id = product) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Tariff revision for % is not 1; reload and review', product;
    END IF;
    -- Before-image guard: exactly the reviewed nine rules of revision 1.
    SELECT count(*) INTO n FROM public.product_private_tariff_rules WHERE product_id = product AND max_persons = 4 AND (
         (rule_kind='hourly' AND window_start='09:00' AND window_end='10:00' AND price_chf=75 AND extra_person_chf=20 AND NOT office_only AND max_block_minutes IS NULL)
      OR (rule_kind='hourly' AND window_start='12:00' AND window_end='14:00' AND price_chf=75 AND extra_person_chf=20 AND NOT office_only AND max_block_minutes IS NULL)
      OR (rule_kind='hourly' AND window_start='10:00' AND window_end='12:00' AND price_chf=85 AND extra_person_chf=20 AND office_only AND max_block_minutes=60)
      OR (rule_kind='hourly' AND window_start='14:00' AND window_end='16:00' AND price_chf=85 AND extra_person_chf=20 AND office_only AND max_block_minutes=60)
      OR (rule_kind='exact_block' AND window_start='10:00' AND window_end='12:00' AND price_chf=190 AND extra_person_chf=40 AND NOT office_only)
      OR (rule_kind='exact_block' AND window_start='14:00' AND window_end='16:00' AND price_chf=190 AND extra_person_chf=40 AND NOT office_only)
      OR (rule_kind='exact_block' AND window_start='12:00' AND window_end='14:00' AND price_chf=150 AND extra_person_chf=40 AND NOT office_only)
      OR (rule_kind='exact_block' AND window_start='09:00' AND window_end='11:00' AND price_chf=160 AND extra_person_chf=40 AND office_only)
      OR (rule_kind='exact_block' AND window_start='13:00' AND window_end='15:00' AND price_chf=160 AND extra_person_chf=40 AND office_only));
    IF n <> 9 OR (SELECT count(*) FROM public.product_private_tariff_rules WHERE product_id = product) <> 9 THEN
      RAISE EXCEPTION 'Rules of % differ from the reviewed revision 1', product;
    END IF;
    SELECT jsonb_agg(jsonb_build_object('rule_kind', rule_kind, 'window_start', to_char(window_start,'HH24:MI'), 'window_end', to_char(window_end,'HH24:MI'),
        'price_chf', CASE WHEN rule_kind='exact_block' AND window_start='14:00' AND window_end='16:00' THEN 170 ELSE price_chf END,
        'extra_person_chf', extra_person_chf, 'max_persons', max_persons, 'max_block_minutes', max_block_minutes, 'office_only', office_only,
        'provenance', CASE WHEN rule_kind='exact_block' AND window_start='14:00' AND window_end='16:00' THEN prov ELSE provenance END)
      ORDER BY rule_kind, window_start) INTO rules
      FROM public.product_private_tariff_rules WHERE product_id = product;
    res := public.save_product_private_tariff_rules(product, 1, rules, NULL);
    IF NOT coalesce((res->>'ok')::boolean, false) OR (res->>'revision')::int <> 2 THEN RAISE EXCEPTION 'Save failed for %: %', product, res; END IF;
    q := public.pa_product_quote(product, DATE '2026-12-14', '14:00', '16:00', 1, false);
    IF (q->>'price')::numeric <> 170 THEN RAISE EXCEPTION 'Postflight 14-16 for %: %', product, q; END IF;
    q := public.pa_product_quote(product, DATE '2026-12-14', '10:00', '12:00', 1, false);
    IF (q->>'price')::numeric <> 190 THEN RAISE EXCEPTION 'Postflight 10-12 for %: %', product, q; END IF;
  END LOOP;
END $$;
COMMIT;
