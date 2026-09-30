-- ROLLBACK for private appointments Phase 1 (pa_phase1a_schema + pa_phase1b_functions)
-- Reviewed, NOT executed. Run only by an operator, only if Phase 2+ is not live.
-- Grants nothing, adds no anon access, no blanket statements.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.private_appointment_participants)
     OR EXISTS (SELECT 1 FROM public.private_appointment_backfill_log) THEN
    RAISE EXCEPTION 'Rollback refused: Phase 1 tables contain rows';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_pa_ticket_item_guard ON public.ticket_items;
DROP FUNCTION IF EXISTS public.pa_ticket_item_guard();
DROP FUNCTION IF EXISTS public.pa_reconcile_report();
DROP FUNCTION IF EXISTS public.pa_slot_is_free(uuid, date, time, time, uuid);
DROP FUNCTION IF EXISTS public.pa_slot_conflicts(uuid, date, time, time, uuid);
DROP FUNCTION IF EXISTS public.pa_is_protected(uuid);
DROP FUNCTION IF EXISTS public.pa_price(date, time, time, integer);
DROP FUNCTION IF EXISTS public.pa_business_today();

DROP TABLE IF EXISTS public.private_appointment_backfill_log;
DROP TABLE IF EXISTS public.private_appointment_participants;

ALTER TABLE public.private_appointments DROP CONSTRAINT IF EXISTS private_appointments_status_check;
ALTER TABLE public.private_appointments
  DROP COLUMN IF EXISTS confirmed_by,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS price;

COMMIT;
