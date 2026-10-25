-- B11 PREPARATION ONLY (not installed). Additive audit field: the 'created' PRIVATE_APPOINTMENT_CHANGED
-- event records the ticket total at the end of the successful canonical create transaction
-- (pa_create_booking calls pa_emit_change after pa_recalc_ticket_total). Same signature, grants,
-- notification row and all other payload keys; other change kinds unchanged. No backfill.
-- This is the booking amount after lesson pricing, NOT payment settlement and NOT invoice issue.
-- Rollback: supabase/pending/b11_created_total_event_rollback.sql (existing events stay).
CREATE OR REPLACE FUNCTION public.pa_emit_change(p_ticket uuid, p_ids uuid[], p_change text, p_actor uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
  VALUES (p_ticket, p_actor, 'PRIVATE_APPOINTMENT_CHANGED',
          jsonb_build_object('change', p_change, 'appointment_ids', to_jsonb(p_ids)) || coalesce(p_details,'{}'::jsonb)
          || CASE WHEN p_change = 'created'
               THEN jsonb_build_object('ticket_total_after_create', (SELECT total_amount FROM public.tickets WHERE id = p_ticket))
               ELSE '{}'::jsonb END);
  INSERT INTO public.notification_queue (notification_type, recipient_type, payload, status)
  VALUES ('private_appointment_changed', 'system',
          jsonb_build_object('ticket_id', p_ticket, 'appointment_ids', to_jsonb(p_ids), 'change', p_change, 'actor', p_actor),
          'pending');
END $function$;
