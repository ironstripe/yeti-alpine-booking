-- Rollback for private appointments Phase 2 (pa_phase2_tx + pa_phase2_fix_line_total).
-- Reviewed, NOT executed. Refuses to run once any appointment was created through Phase 2.
-- Pair with removing the `private-appointments` function and the appointmentId branch of set-booking-confirmation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.private_appointments WHERE submission_key IS NOT NULL) THEN
    RAISE EXCEPTION 'Phase 2 rollback refused: appointments created via Phase 2 exist';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.pa_confirm_appointment(uuid, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.pa_period_update(uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.pa_move_appointment(uuid, date, time, time, uuid, uuid);
DROP FUNCTION IF EXISTS public.pa_create_booking(jsonb, uuid);
DROP FUNCTION IF EXISTS public.pa_apply_slot(uuid, date, time, time, uuid);
DROP FUNCTION IF EXISTS public.pa_emit_change(uuid, uuid[], text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.pa_recalc_ticket_total(uuid);
DROP INDEX IF EXISTS public.idx_private_appointments_submission_key;
ALTER TABLE public.private_appointments DROP COLUMN IF EXISTS submission_key;
