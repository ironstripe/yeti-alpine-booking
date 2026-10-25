-- PROPOSED, NOT EXECUTED. Requires review + explicit approval; run in a privileged psql session with
--   -v staff_actor=<verified staff UUID>
-- after product_private_tariff_rules.sql + its reviewed seed and public_private_tariff_projection.sql.
-- Replaces the public window LIST of the two Malbun private products with the six approved standard windows
-- (singles 09-10, 12-13, 13-14; doubles 10-12, 12-14, 14-16). Office exceptions (09-11, 13-15 double;
-- 85/h single in 10-12/14-16) are not listed: they stay operational, never public.
-- Display amount fields are required by the 0013 shape; they are filled FROM the resolver at seed time and are
-- never published (the endpoint projects live resolver prices). Discount fields mirror the configured rule.
-- Saved UNVERIFIED (verify=false): Office must verify again before anything is published.
BEGIN;
SET LOCAL lock_timeout = '3s';
SELECT set_config('yeti.display_seed_actor', :'staff_actor', true);
DO $$
DECLARE actor uuid := current_setting('yeti.display_seed_actor')::uuid;
  season uuid := 'f185b448-e6aa-46b8-94ae-0875a7a6c166';
  ids uuid[] := ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid];
  wins text[][] := ARRAY[['09:00','10:00'],['12:00','13:00'],['13:00','14:00'],['10:00','12:00'],['12:00','14:00'],['14:00','16:00']];
  product uuid; i int; q1 jsonb; q2 jsonb; w jsonb; info jsonb; rev int; dr record;
BEGIN
  IF NOT public.is_staff(actor) THEN RAISE EXCEPTION 'Verified staff actor required'; END IF;
  SELECT * INTO dr FROM public.private_lesson_discount_rule WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discount rule not configured'; END IF;
  FOREACH product IN ARRAY ids LOOP
    w := '[]'::jsonb;
    FOR i IN 1 .. array_length(wins, 1) LOOP
      q1 := public.pa_product_quote(product, DATE '2026-12-01', wins[i][1]::time, wins[i][2]::time, 1, false);
      q2 := public.pa_product_quote(product, DATE '2026-12-01', wins[i][1]::time, wins[i][2]::time, 2, false);
      IF q1 ? 'error' OR q2 ? 'error' THEN RAISE EXCEPTION 'Tariff not configured for % %-%', product, wins[i][1], wins[i][2]; END IF;
      w := w || jsonb_build_array(jsonb_build_object('start', wins[i][1], 'end', wins[i][2],
        'duration_minutes', (extract(epoch FROM (wins[i][2]::time - wins[i][1]::time)) / 60)::int,
        'amount_chf', (q1->>'price')::numeric, 'extra_person_chf', (q2->>'price')::numeric - (q1->>'price')::numeric,
        'classification', 'standard', 'window_kind', 'exact'));
    END LOOP;
    info := jsonb_build_object('windows', w, 'discount_percent', dr.percent, 'discount_threshold', dr.threshold_minutes,
      'discount_unit', 'minutes', 'discount_scope', dr.scope,
      'source_note', 'Ivo 2026-10-25: six public standard windows; prices from product tariff configuration.', 'source_date', '2026-10-25');
    SELECT revision INTO rev FROM public.public_private_tariff_display WHERE product_id = product AND season_id = season;
    PERFORM public.save_public_private_tariff_display(product, season, info, rev, false, actor);
  END LOOP;
END $$;
COMMIT;
