-- Rollback for drizzle/migrations/0026_b07a_office_multi_create.sql, consumer-first:
-- 0. Redeploy without `office-booking` (or disable it) and publish the client that keeps multiItemBlocked.
-- 1. Export evidence: \copy public.b07a_office_submissions TO 'b07a_submissions.csv' CSV HEADER
--    (tickets/appointments/lines created by B07a stay; they are ordinary bookings).
-- 2. This file removes the multi function, restores the single-item group ticket step, then drops the table.
DROP FUNCTION IF EXISTS public.b07a_office_multi(jsonb, uuid, text);
DO $patch$
DECLARE
  body text;
  old_ticket text := '  v_number := public.generate_ticket_number();
  INSERT INTO public.tickets (ticket_number, customer_id, status, total_amount, paid_amount, source, created_by, notes)
  VALUES (v_number, v_customer, ''confirmed'', 0, 0, ''office'', p_actor, nullif(p->>''notes'', ''''))
  RETURNING id INTO v_ticket;
  INSERT INTO public.bc_2627_staff_group_submissions (submission_key, ticket_id, created_by) VALUES (v_key, v_ticket, p_actor);';
  new_ticket text := '  -- B07a: lines of an atomic multi-item booking go onto the caller''s ticket (transaction-local marker
  -- set only by b07a_office_multi); otherwise unchanged single-item behaviour.
  v_ticket := nullif(current_setting(''b07a.ticket'', true), '''')::uuid;
  IF v_ticket IS NOT NULL THEN
    SELECT ticket_number INTO v_number FROM public.tickets WHERE id = v_ticket AND customer_id = v_customer;
    IF v_number IS NULL THEN RETURN jsonb_build_object(''error'', ''invalid'', ''field'', ''ticket''); END IF;
  ELSE
' || old_ticket || '
  END IF;';
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, new_ticket) = 0 THEN RAISE EXCEPTION 'B07a group patch not found; nothing restored'; END IF;
  EXECUTE replace(body, new_ticket, old_ticket);
END $patch$;
DROP TABLE IF EXISTS public.b07a_office_submissions;
