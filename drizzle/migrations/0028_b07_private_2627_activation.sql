-- Release step 13 (data, targeted): seed reviewed private tariff rules + the global discount rule and
-- activate EXACTLY the two confirmed Winter 26/27 private products. Plain SQL (expanded from
-- supabase/pending/b07_private_2627_activation.PROPOSED.sql + product_private_tariff_rules_seed.PROPOSED.sql).
-- Requires 0024 product_private_tariff_rules and 0027 b07_private_activation_guard. Fails (whole migration
-- rolls back) if either product is missing, not private, in another season, already has a tariff revision,
-- or if any other private product or any Booking-Corner tariff source row changes.
-- Products: 3646f155-8a66-53e3-b512-749f3a42c1ae (Ski), 0e8e8669-d8f4-5b19-8e6d-36ff588fdee1 (Snowboard), season f185b448-e6aa-46b8-94ae-0875a7a6c166.
-- Values: Ivo DECISIONS 2026-10-25 (see mem business-rules/private-lesson-product-tariffs); stored as data only.

CREATE TEMP TABLE b07_rel_before ON COMMIT DROP AS
SELECT (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')) FROM public.products p
         WHERE p.type = 'private' AND p.id NOT IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1')) AS other_private,
       (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s::text), '')) FROM public.bc_product_tariff_sources s) AS bc_sources,
       (SELECT count(*) FROM public.private_lesson_discount_rule) AS discount_rows;

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

INSERT INTO public.private_lesson_discount_rule (percent, threshold_minutes, provenance)
VALUES (10, 240, 'Ivo 2026-10-04/2026-10-25: 10% ab 4 Std. gleiche Person gleicher Tag; geteilte Lektion gleich aufgeteilt')
ON CONFLICT (id) DO NOTHING;

SELECT public.save_product_private_tariff_rules('3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, 0, jsonb_build_array(
  jsonb_build_object('rule_kind','hourly','window_start','09:00','window_end','10:00','price_chf',75,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',null,'office_only',false,'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeit, +20/Person/h'),
  jsonb_build_object('rule_kind','hourly','window_start','12:00','window_end','14:00','price_chf',75,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',null,'office_only',false,'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeit, +20/Person/h'),
  jsonb_build_object('rule_kind','hourly','window_start','10:00','window_end','12:00','price_chf',85,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',60,'office_only',true,'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','hourly','window_start','14:00','window_end','16:00','price_chf',85,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',60,'office_only',true,'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','exact_block','window_start','10:00','window_end','12:00','price_chf',190,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo 2026-10-25: Standard-Doppelstunde 10-12 = 190, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','14:00','window_end','16:00','price_chf',190,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo DECISIONS: Standard-Doppelstunde 14-16 = 190, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','12:00','window_end','14:00','price_chf',150,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo DECISIONS: Doppelstunde 12-14 = 150, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','09:00','window_end','11:00','price_chf',160,'extra_person_chf',40,
    'max_persons',4,'office_only',true,'provenance','Ivo DECISIONS: Ausnahme 09-11 = 160, Büro'),
  jsonb_build_object('rule_kind','exact_block','window_start','13:00','window_end','15:00','price_chf',160,'extra_person_chf',40,
    'max_persons',4,'office_only',true,'provenance','Ivo DECISIONS: Ausnahme 13-15 = 160, Büro')
), NULL);

SELECT public.save_product_private_tariff_rules('0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid, 0, jsonb_build_array(
  jsonb_build_object('rule_kind','hourly','window_start','09:00','window_end','10:00','price_chf',75,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',null,'office_only',false,'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeit, +20/Person/h'),
  jsonb_build_object('rule_kind','hourly','window_start','12:00','window_end','14:00','price_chf',75,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',null,'office_only',false,'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeit, +20/Person/h'),
  jsonb_build_object('rule_kind','hourly','window_start','10:00','window_end','12:00','price_chf',85,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',60,'office_only',true,'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','hourly','window_start','14:00','window_end','16:00','price_chf',85,'extra_person_chf',20,
    'max_persons',4,'max_block_minutes',60,'office_only',true,'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','exact_block','window_start','10:00','window_end','12:00','price_chf',190,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo 2026-10-25: Standard-Doppelstunde 10-12 = 190, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','14:00','window_end','16:00','price_chf',190,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo DECISIONS: Standard-Doppelstunde 14-16 = 190, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','12:00','window_end','14:00','price_chf',150,'extra_person_chf',40,
    'max_persons',4,'office_only',false,'provenance','Ivo DECISIONS: Doppelstunde 12-14 = 150, +40/Person'),
  jsonb_build_object('rule_kind','exact_block','window_start','09:00','window_end','11:00','price_chf',160,'extra_person_chf',40,
    'max_persons',4,'office_only',true,'provenance','Ivo DECISIONS: Ausnahme 09-11 = 160, Büro'),
  jsonb_build_object('rule_kind','exact_block','window_start','13:00','window_end','15:00','price_chf',160,'extra_person_chf',40,
    'max_persons',4,'office_only',true,'provenance','Ivo DECISIONS: Ausnahme 13-15 = 160, Büro')
), NULL);

-- Office activation only; the activation guard re-checks full window coverage and raises otherwise.
UPDATE public.products SET is_active = true
 WHERE id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1') AND is_active IS FALSE;

DO $$
DECLARE b record; v_other text; v_bc text; v_rule record;
BEGIN
  SELECT * INTO b FROM b07_rel_before;
  IF (SELECT count(*) FROM public.products WHERE id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1')
        AND is_active AND public.private_tariff_activation_ok(id)) <> 2 THEN
    RAISE EXCEPTION 'activation post-check failed: both products must be active with full tariff coverage';
  END IF;
  IF (SELECT count(*) FROM public.product_private_tariff_revisions WHERE product_id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1') AND revision = 1) <> 2 THEN
    RAISE EXCEPTION 'expected tariff revision 1 for both products';
  END IF;
  IF (SELECT count(*) FROM public.product_private_tariff_rules WHERE product_id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1')) <> 18 THEN
    RAISE EXCEPTION 'expected 9 tariff rules per product';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')) INTO v_other FROM public.products p
   WHERE p.type = 'private' AND p.id NOT IN ('3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1');
  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s::text), '')) INTO v_bc FROM public.bc_product_tariff_sources s;
  IF v_other IS DISTINCT FROM b.other_private THEN RAISE EXCEPTION 'other private products changed'; END IF;
  IF v_bc IS DISTINCT FROM b.bc_sources THEN RAISE EXCEPTION 'Booking-Corner tariff sources changed'; END IF;
  IF (SELECT count(*) FROM public.private_lesson_discount_rule) <> 1 THEN RAISE EXCEPTION 'expected exactly one discount rule row'; END IF;
  SELECT * INTO v_rule FROM public.private_lesson_discount_rule LIMIT 1;
  IF v_rule.percent <> 10 OR v_rule.threshold_minutes <> 240 THEN RAISE EXCEPTION 'discount rule is not 10%% / 240 min'; END IF;
END $$;
