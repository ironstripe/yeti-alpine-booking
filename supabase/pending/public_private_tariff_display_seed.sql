-- PREPARED ONLY, never a schema migration. Explicit authorised products in Winter 26/27 only.
-- Execute later via privileged controlled psql session with -v staff_actor=<verified staff UUID>.
-- User-sourced prices: Ivo 2026-10-18. No operational pricing updates; seeded UNVERIFIED.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.products,public.seasons,public.private_lesson_rates,public.bc_product_tariff_sources,public.pricing_rules,public.public_private_tariff_display,public.user_roles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
SELECT set_config('yeti.display_seed_actor', :'staff_actor', true);
DO $$
DECLARE actor uuid:=current_setting('yeti.display_seed_actor')::uuid;
 season uuid:='f185b448-e6aa-46b8-94ae-0875a7a6c166';
 ids uuid[]:=ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid,'0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid];
 product uuid;
 information jsonb:=$information${"windows":[{"start":"09:00","end":"10:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"12:00","end":"13:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"13:00","end":"14:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"09:00","end":"11:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"10:00","end":"12:00","duration_minutes":120,"amount_chf":190,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"11:00","end":"13:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"12:00","end":"14:00","duration_minutes":120,"amount_chf":150,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"13:00","end":"15:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"14:00","end":"16:00","duration_minutes":120,"amount_chf":190,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"10:00","end":"12:00","duration_minutes":60,"amount_chf":85,"extra_person_chf":20,"classification":"office_exception","window_kind":"within"},{"start":"14:00","end":"16:00","duration_minutes":60,"amount_chf":85,"extra_person_chf":20,"classification":"office_exception","window_kind":"within"}],"discount_percent":10,"discount_threshold":4,"discount_unit":"lessons","discount_scope":"same_participant_same_day","source_note":"Ivo 2026-10-18: public information only; Office must verify both disciplines and lessons vs hours discount before publication.","source_date":"2026-10-18"}$information$::jsonb;
BEGIN
 IF NOT public.is_staff(actor) THEN RAISE EXCEPTION 'Verified staff actor required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.seasons WHERE id=season AND start_date='2026-12-01' AND end_date='2027-04-15' AND is_current) THEN RAISE EXCEPTION 'Season changed'; END IF;
 IF (SELECT count(*) FROM public.products WHERE id=ANY(ids) AND type='private' AND season_id=season AND currency='CHF' AND price=75 AND pricing_type='fixed' AND ((id=ids[1] AND discipline='ski' AND duration_minutes=55) OR (id=ids[2] AND discipline='snowboard' AND duration_minutes=60)))<>2 THEN RAISE EXCEPTION 'Target products changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.public_private_tariff_display WHERE product_id=ANY(ids)) THEN RAISE EXCEPTION 'Display information already entered; do not overwrite'; END IF;
 IF EXISTS(SELECT 1 FROM public.pricing_rules WHERE is_active) THEN RAISE EXCEPTION 'Active price rules require fresh Office review'; END IF;
 IF (SELECT count(*) FROM public.private_lesson_rates)<>4 OR
    (SELECT count(*) FROM public.private_lesson_rates WHERE additional_person_rate=20 AND ((start_time='09:00' AND end_time='10:00' AND rate_per_hour=75 AND NOT is_peak) OR (start_time='10:00' AND end_time='12:00' AND rate_per_hour=85 AND is_peak) OR (start_time='12:00' AND end_time='14:00' AND rate_per_hour=75 AND NOT is_peak) OR (start_time='14:00' AND end_time='16:00' AND rate_per_hour=85 AND is_peak)))<>4 THEN RAISE EXCEPTION 'Operational hourly source changed; review before seeding display information'; END IF;
 FOREACH product IN ARRAY ids LOOP
   IF (SELECT count(*) FROM public.bc_product_tariff_sources WHERE product_id=product AND season_id=season AND import_status='draft' AND persons_per_lesson=1 AND ((duration_minutes=60 AND price_chf=75) OR (duration_minutes=120 AND price_chf=170)))<>2 THEN RAISE EXCEPTION 'BC provenance changed'; END IF;
   PERFORM public.save_public_private_tariff_display(product,season,information,NULL,false,actor);
 END LOOP;
 IF (SELECT count(*) FROM public.public_private_tariff_display WHERE product_id=ANY(ids) AND season_id=season AND verified_at IS NULL AND windows=information->'windows')<>2 THEN RAISE EXCEPTION 'Seed postflight mismatch'; END IF;
END $$;
COMMIT;
