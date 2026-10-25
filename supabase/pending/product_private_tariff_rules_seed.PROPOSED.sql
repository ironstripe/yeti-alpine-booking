-- PROPOSED SEED, NOT INSTALLED. Requires product_private_tariff_rules.sql and explicit review.
-- Run once per REVIEWED active private product (product id must be named explicitly, no default):
--   psql -v product_id=<uuid> -v expected_revision=0 -f this.sql
-- The discount-rule row is inserted only if absent (one global rule; later changes bump its revision).
-- Provenance (ivo-brain DECISIONS, confirmed 2026-10-25):
--   exact double lessons 10-12 = 190, 14-16 = 190, 12-14 = 150 (standard)
--   exact double lessons 09-11 = 160, 13-15 = 160 (exceptions => office_only, no public offer expansion)
--   75/h outside peak (09-10, 12-14); 85/h single-hour office exception inside 10-12 / 14-16
--   additional person: 20 per hour, 40 per double lesson (existing source: public tariff display seed 0013)
--   automatic 10% when the SAME participant has >= 240 planned minutes on the SAME day; shared lessons
--   divided equally for the discount calculation only; explicit manual discount overrides it.
-- Identical values are used as fixture rows in tests/b07DiscountPricing.integration.mjs.
\set ON_ERROR_STOP 1
INSERT INTO public.private_lesson_discount_rule (percent, threshold_minutes, provenance)
VALUES (10, 240, 'Ivo 2026-10-04/2026-10-25: 10% ab 4 Std. gleiche Person gleicher Tag; geteilte Lektion gleich aufgeteilt')
ON CONFLICT (id) DO NOTHING;

SELECT public.save_product_private_tariff_rules(:'product_id'::uuid, :'expected_revision'::int, jsonb_build_array(
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

-- Coverage check after seeding (must return no rows before the switch goes ON):
-- SELECT p.id, p.name FROM public.products p WHERE p.type='private' AND p.is_active
--   AND NOT EXISTS (SELECT 1 FROM public.product_private_tariff_rules r WHERE r.product_id=p.id);
