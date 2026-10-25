-- Rollback for public_private_prices_r1_display_update.sql: restores the exact 2026-10-18 window list through the
-- same revision-checked save path (new revision, provenance kept). Redeploy the previous get-website-products first
-- if the projection endpoint should also be withdrawn. Run with -v staff_actor=<staff UUID> -v expected_revision=<current>.
-- Note: the old list contains 09-11/11-13/13-15 = 160 as "standard"; with the projection endpoint this makes the
-- product fail closed (no private prices shown), identical to today's public result.
BEGIN;
SELECT set_config('yeti.pp_actor', :'staff_actor', true), set_config('yeti.pp_rev', :'expected_revision', true);
DO $$
DECLARE actor uuid := current_setting('yeti.pp_actor')::uuid; rev int := current_setting('yeti.pp_rev')::int; product uuid;
  season uuid := 'f185b448-e6aa-46b8-94ae-0875a7a6c166';
  old jsonb := $old${"windows":[{"start":"09:00","end":"10:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"12:00","end":"13:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"13:00","end":"14:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"},{"start":"09:00","end":"11:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"10:00","end":"12:00","duration_minutes":120,"amount_chf":190,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"11:00","end":"13:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"12:00","end":"14:00","duration_minutes":120,"amount_chf":150,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"13:00","end":"15:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"14:00","end":"16:00","duration_minutes":120,"amount_chf":190,"extra_person_chf":40,"classification":"standard","window_kind":"exact"},{"start":"10:00","end":"12:00","duration_minutes":60,"amount_chf":85,"extra_person_chf":20,"classification":"office_exception","window_kind":"within"},{"start":"14:00","end":"16:00","duration_minutes":60,"amount_chf":85,"extra_person_chf":20,"classification":"office_exception","window_kind":"within"}],"discount_percent":10,"discount_threshold":4,"discount_unit":"lessons","discount_scope":"same_participant_same_day","source_note":"Rollback to 2026-10-18 list (Ivo 2026-10-18 public website information approved).","source_date":"2026-10-18"}$old$::jsonb;
BEGIN
  FOREACH product IN ARRAY ARRAY['3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid,'0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid] LOOP
    PERFORM public.save_public_private_tariff_display(product, season, old, rev, true, actor);
  END LOOP;
END $$;
COMMIT;
