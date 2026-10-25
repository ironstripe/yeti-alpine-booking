-- PROPOSED SEED, NOT INSTALLED. Requires product_private_tariff_rules.sql and explicit review.
-- Run only with psql variables naming the REVIEWED product and the still-undecided values:
--   psql -v product_id=<uuid> -v extra_person_hourly=<chf> -v exact_1012_extra_person=<chf> -f this.sql
-- There are deliberately NO defaults: a missing variable aborts the seed.
-- Provenance of each value:
--   75/h outside rush, 85/h rush single-hour office exception: Ivo, chat 2026-10-25 13:44 UTC.
--   190 exact 10:00-12:00 double lesson: Ivo, chat 2026-10-25 ("Die Doppelstunde von zehn bis zwölf kostet neu 190 Franken").
--   extra-person values: NOT decided for this model (legacy global rate was CHF 20/person/hour) -> must be supplied.
--   14:00-16:00 double lesson: NOT configured (no confirmed exact price; rush hourly rule is single-hour only),
--     so a 14-16 booking stays "tariff_unavailable" until Ivo confirms a value.
--   Window boundaries 09-10 / 12-14 non-rush copy the current private_lesson_rates windows.
\set ON_ERROR_STOP 1
SELECT public.save_product_private_tariff_rules(:'product_id'::uuid, 0, jsonb_build_array(
  jsonb_build_object('rule_kind','hourly','window_start','09:00','window_end','10:00','price_chf',75,
    'extra_person_chf',:'extra_person_hourly'::numeric,'max_persons',4,'max_block_minutes',null,'office_only',false,
    'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeiten'),
  jsonb_build_object('rule_kind','hourly','window_start','12:00','window_end','14:00','price_chf',75,
    'extra_person_chf',:'extra_person_hourly'::numeric,'max_persons',4,'max_block_minutes',null,'office_only',false,
    'provenance','Ivo 2026-10-25: 75/h ausserhalb Stosszeiten'),
  jsonb_build_object('rule_kind','hourly','window_start','10:00','window_end','12:00','price_chf',85,
    'extra_person_chf',:'extra_person_hourly'::numeric,'max_persons',4,'max_block_minutes',60,'office_only',true,
    'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','hourly','window_start','14:00','window_end','16:00','price_chf',85,
    'extra_person_chf',:'extra_person_hourly'::numeric,'max_persons',4,'max_block_minutes',60,'office_only',true,
    'provenance','Ivo 2026-10-25: 85/h Einzelstunde Stosszeit, Büro-Ausnahme'),
  jsonb_build_object('rule_kind','exact_block','window_start','10:00','window_end','12:00','price_chf',190,
    'extra_person_chf',:'exact_1012_extra_person'::numeric,'max_persons',4,'office_only',false,
    'provenance','Ivo 2026-10-25: Standard-Doppelstunde 10-12 = 190')
), NULL);
