-- Rollback for supabase/pending/participant_birth_date_guard.sql. Removes only the guard; no data touched.
DROP TRIGGER IF EXISTS trg_participant_birth_date_guard ON public.customer_participants;
DROP FUNCTION IF EXISTS public.participant_birth_date_guard();
