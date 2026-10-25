-- B11 rollback: previous pa_emit_change body. Existing history rows (incl. ticket_total_after_create) are kept.
CREATE OR REPLACE FUNCTION public.pa_emit_change(p_ticket uuid, p_ids uuid[], p_change text, p_actor uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
  VALUES (p_ticket, p_actor, 'PRIVATE_APPOINTMENT_CHANGED',
          jsonb_build_object('change', p_change, 'appointment_ids', to_jsonb(p_ids)) || coalesce(p_details,'{}'::jsonb));
  INSERT INTO public.notification_queue (notification_type, recipient_type, payload, status)
  VALUES ('private_appointment_changed', 'system',
          jsonb_build_object('ticket_id', p_ticket, 'appointment_ids', to_jsonb(p_ids), 'change', p_change, 'actor', p_actor),
          'pending');
END $function$;
