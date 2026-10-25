-- PREPARED ONLY, NOT INSTALLED. Additive, service-only, read-only.
-- Public standard private-lesson prices projected from the authoritative product tariff resolver.
-- Prerequisites (installed first): public_private_tariff_display.sql (0013) and product_private_tariff_rules.sql
-- (pa_product_quote, private_lesson_discount_rule) with reviewed seeds.
--
-- Which windows are public = Office-verified display metadata (classification 'standard', window_kind 'exact').
-- What they cost = pa_product_quote(..., p_office => false) for 1 and 2 persons (extra = difference).
-- Stored display amount_chf/extra_person_chf and discount fields are IGNORED (legacy, never published).
-- Office exceptions never become public: an office-only rule makes the public resolver refuse, and the whole
-- product projection then fails closed (no partial list, no guessed price, no legacy fallback).
DO $$ BEGIN
  IF to_regprocedure('public.pa_product_quote(uuid,date,time,time,integer,boolean)') IS NULL
     OR to_regclass('public.private_lesson_discount_rule') IS NULL
     OR to_regclass('public.public_private_tariff_display') IS NULL THEN
    RAISE EXCEPTION 'Install public_private_tariff_display.sql and product_private_tariff_rules.sql first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.public_private_tariff_projection(p_product uuid, p_season uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE d record; v_date date; w jsonb; q1 jsonb; q2 jsonb; v_out jsonb := '[]'::jsonb; dr record; v_rev int;
BEGIN
  SELECT * INTO d FROM public.public_private_tariff_display
   WHERE product_id = p_product AND season_id = p_season AND verified_at IS NOT NULL AND verified_by IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_verified'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product AND type = 'private' AND season_id = p_season) THEN
    RETURN jsonb_build_object('error','invalid_product');
  END IF;
  SELECT start_date INTO v_date FROM public.seasons WHERE id = p_season;
  IF v_date IS NULL THEN RETURN jsonb_build_object('error','invalid_season'); END IF;
  SELECT * INTO dr FROM public.private_lesson_discount_rule WHERE id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','tariff_unavailable','reason','discount_rule_not_configured'); END IF;
  SELECT revision INTO v_rev FROM public.product_private_tariff_revisions WHERE product_id = p_product;

  FOR w IN SELECT x FROM jsonb_array_elements(d.windows) x
            WHERE x->>'classification' = 'standard' AND x->>'window_kind' = 'exact'
            ORDER BY (x->>'duration_minutes')::int, x->>'start' LOOP
    q1 := public.pa_product_quote(p_product, v_date, (w->>'start')::time, (w->>'end')::time, 1, false);
    IF q1 ? 'error' THEN RETURN jsonb_build_object('error','tariff_unavailable','reason',q1->>'reason','window',w->>'start' || '-' || (w->>'end')); END IF;
    q2 := public.pa_product_quote(p_product, v_date, (w->>'start')::time, (w->>'end')::time, 2, false);
    IF q2 ? 'error' THEN RETURN jsonb_build_object('error','tariff_unavailable','reason',q2->>'reason','window',w->>'start' || '-' || (w->>'end')); END IF;
    IF (q1->>'price')::numeric <= 0 OR (q2->>'price')::numeric < (q1->>'price')::numeric THEN
      RETURN jsonb_build_object('error','tariff_unavailable','reason','non_positive','window',w->>'start' || '-' || (w->>'end'));
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('start', w->>'start', 'end', w->>'end',
      'duration_minutes', (w->>'duration_minutes')::int, 'amount_chf', (q1->>'price')::numeric,
      'extra_person_chf', (q2->>'price')::numeric - (q1->>'price')::numeric,
      'classification', 'standard', 'window_kind', 'exact'));
  END LOOP;
  IF jsonb_array_length(v_out) = 0 THEN RETURN jsonb_build_object('error','no_standard_windows'); END IF;
  RETURN jsonb_build_object('ok', true, 'windows', v_out, 'tariff_revision', v_rev, 'discount_rule_revision', dr.revision,
    'discount', jsonb_build_object('percent', dr.percent, 'threshold', dr.threshold_minutes, 'unit', 'minutes', 'scope', dr.scope));
END $$;
REVOKE ALL ON FUNCTION public.public_private_tariff_projection(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_private_tariff_projection(uuid, uuid) TO service_role;
