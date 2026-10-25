-- PUBLIC PRIVATE PRICES R1 – DATA STEP (prepared, NOT executed). Not a schema migration.
-- Replaces the public WINDOW LIST of exactly two Winter 26/27 private products (Ski 3646f155…, Snowboard 0e8e8669…)
-- with the six approved standard windows: singles 09-10, 12-13, 13-14; doubles 10-12, 12-14, 14-16.
-- Write path: the regular revision-checked public.save_public_private_tariff_display (same RPC the staff endpoint
-- public-private-tariff-display calls with the signed-in user's id). No direct table UPDATE, no products write,
-- no tariff rule / discount / pa_* change.
-- Amounts in the stored metadata are DERIVED here from the public resolver pa_product_quote(..., p_office=>false)
-- (1 and 2 persons); the endpoint never publishes them (it projects live resolver prices). Discount fields are
-- copied from the canonical private_lesson_discount_rule row.
--
-- Run (privileged psql, single transaction):
--   psql "$DB" -v ON_ERROR_STOP=1 -1 -v staff_actor=<UUID of the staff person who performs/approves> -v verify=<true|false> \
--        -f supabase/pending/public_private_prices_r1_display_update.sql
-- staff_actor MUST be the real staff identity that takes responsibility for this save (it is stored as
-- updated_by and, with verify=true, as verified_by). Never use another person's id without their explicit consent.
-- Prerequisite: public_private_tariff_projection.sql installed (pending, planned 0033).
BEGIN;
SET LOCAL lock_timeout = '3s';
SELECT set_config('yeti.pp_actor', :'staff_actor', true), set_config('yeti.pp_verify', :'verify', true);
DO $$
DECLARE actor uuid := current_setting('yeti.pp_actor')::uuid;
  do_verify boolean := current_setting('yeti.pp_verify')::boolean;
  season uuid := 'f185b448-e6aa-46b8-94ae-0875a7a6c166';
  ids uuid[] := ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid];
  wins text[][] := ARRAY[['09:00','10:00'],['12:00','13:00'],['13:00','14:00'],['10:00','12:00'],['12:00','14:00'],['14:00','16:00']];
  product uuid; i int; q1 jsonb; q2 jsonb; w jsonb; info jsonb; dr record; before jsonb; after jsonb; prod_before text;
BEGIN
  IF NOT public.is_staff(actor) THEN RAISE EXCEPTION 'Verified staff actor required'; END IF;
  IF to_regprocedure('public.public_private_tariff_projection(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Install public_private_tariff_projection.sql first'; END IF;
  SELECT * INTO dr FROM public.private_lesson_discount_rule WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discount rule not configured'; END IF;
  SELECT string_agg(md5(to_jsonb(p)::text), ',' ORDER BY id) INTO prod_before FROM public.products p WHERE id = ANY(ids);
  FOREACH product IN ARRAY ids LOOP
    -- Before-image guard: exactly the reviewed 2026-10-18 row (revision 1, 11 windows, verified).
    SELECT to_jsonb(d) INTO before FROM public.public_private_tariff_display d WHERE product_id = product AND season_id = season FOR UPDATE;
    IF before IS NULL OR (before->>'revision')::int <> 1 OR md5((before->'windows')::text) <> '5f6ce3cfba2f2a2615a5fc00d79b31a6'
       OR before->>'source_date' <> '2026-10-18' THEN
      RAISE EXCEPTION 'Display row for % differs from the reviewed before-image; reload and review', product;
    END IF;
    RAISE NOTICE 'before-image %: %', product, before;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = product AND type = 'private' AND season_id = season AND currency = 'CHF') THEN
      RAISE EXCEPTION 'Target product changed: %', product;
    END IF;
    w := '[]'::jsonb;
    FOR i IN 1 .. array_length(wins, 1) LOOP
      q1 := public.pa_product_quote(product, DATE '2026-12-01', wins[i][1]::time, wins[i][2]::time, 1, false);
      q2 := public.pa_product_quote(product, DATE '2026-12-01', wins[i][1]::time, wins[i][2]::time, 2, false);
      IF q1 ? 'error' OR q2 ? 'error' THEN RAISE EXCEPTION 'Public tariff unavailable for % %-%', product, wins[i][1], wins[i][2]; END IF;
      w := w || jsonb_build_array(jsonb_build_object('start', wins[i][1], 'end', wins[i][2],
        'duration_minutes', (extract(epoch FROM (wins[i][2]::time - wins[i][1]::time)) / 60)::int,
        'amount_chf', (q1->>'price')::numeric, 'extra_person_chf', (q2->>'price')::numeric - (q1->>'price')::numeric,
        'classification', 'standard', 'window_kind', 'exact'));
    END LOOP;
    info := jsonb_build_object('windows', w, 'discount_percent', dr.percent, 'discount_threshold', dr.threshold_minutes,
      'discount_unit', 'minutes', 'discount_scope', dr.scope,
      'source_note', 'Ivo 2026-10-25 approved six public standard windows (DECISIONS); amounts from product tariff resolver; replaces rev 1 of 2026-10-18.',
      'source_date', '2026-10-25');
    after := public.save_public_private_tariff_display(product, season, info, 1, do_verify, actor);
    IF (after->>'revision')::int <> 2 OR jsonb_array_length(after->'windows') <> 6 THEN RAISE EXCEPTION 'Postflight mismatch for %', product; END IF;
    IF do_verify AND NOT (public.public_private_tariff_projection(product, season) ? 'ok') THEN
      RAISE EXCEPTION 'Projection fails after save for %: %', product, public.public_private_tariff_projection(product, season);
    END IF;
  END LOOP;
  IF (SELECT string_agg(md5(to_jsonb(p)::text), ',' ORDER BY id) FROM public.products p WHERE id = ANY(ids)) IS DISTINCT FROM prod_before THEN
    RAISE EXCEPTION 'Products must not change';
  END IF;
END $$;
COMMIT;
