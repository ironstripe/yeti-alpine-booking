-- Rollback for supabase/pending/pa_edit_booking.sql. Removes only the new function; no data touched.
-- Deploy the previous private-appointments version first (or together), so no caller reaches a missing RPC.
DROP FUNCTION IF EXISTS public.pa_edit_booking(jsonb, uuid);
