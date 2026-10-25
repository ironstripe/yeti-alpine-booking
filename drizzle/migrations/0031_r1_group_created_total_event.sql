-- R1 (S2 group final audit): future office group bookings record their final booking value in history.
-- * bc_2627_staff_group_book (single group booking): one GROUP_BOOKING_CREATED event after all lines and
--   the ticket total are written, before settlement (so PAYMENT_RECORDED follows it). Not written when the
--   call writes onto a b07a multi-item ticket (b07a.ticket marker) - no intermediate group subtotal.
-- * b07a_office_multi: a group-only multi-item booking records the same event with the whole booking
--   total; carts with private lessons keep their existing B11 'created' event (whole total) unchanged.
-- * Replays return the stored result before any write, so no duplicate event. No historical rows touched.
-- Requires 0026 (B07a). Rollback: supabase/rollback/r1_group_created_total_event_rollback.sql.
DO $patch$
DECLARE
  body text;
  anchor text := '  PERFORM public.pa_recalc_ticket_total(v_ticket);
  -- Office settlement/notes in the SAME transaction (a failure rolls back the whole booking).
  IF p ? ''finalization'' THEN PERFORM public.staff_booking_finalize(v_ticket, p->''finalization'', p_actor); END IF;';
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, 'b07a.ticket') = 0 OR strpos(body, 'GROUP_BOOKING_CREATED') > 0 OR strpos(body, anchor) = 0 THEN
    RAISE EXCEPTION 'Unexpected staff group booking body (B07a required, R1 not yet applied); R1 patch not applied';
  END IF;
  body := replace(body, anchor, '  PERFORM public.pa_recalc_ticket_total(v_ticket);
  -- R1: final booking value of this group booking (own payload; skipped inside a b07a multi-item ticket).
  IF nullif(current_setting(''b07a.ticket'', true), '''') IS NULL THEN
    INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
    VALUES (v_ticket, p_actor, ''GROUP_BOOKING_CREATED'', jsonb_build_object(
      ''ticket_total_after_create'', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
      ''persons'', cardinality(v_parts),
      ''lines'', (SELECT count(*) FROM public.ticket_items WHERE ticket_id = v_ticket)));
  END IF;
  -- Office settlement/notes in the SAME transaction (a failure rolls back the whole booking).
  IF p ? ''finalization'' THEN PERFORM public.staff_booking_finalize(v_ticket, p->''finalization'', p_actor); END IF;');
  EXECUTE body;
END $patch$;

DO $patch$
DECLARE
  body text;
  anchor text := '    IF p ? ''finalization'' THEN PERFORM public.staff_booking_finalize(v_ticket, p->''finalization'', p_actor); END IF;';
BEGIN
  body := pg_get_functiondef('public.b07a_office_multi(jsonb,uuid,text)'::regprocedure);
  IF strpos(body, 'GROUP_BOOKING_CREATED') > 0 OR (length(body) - length(replace(body, anchor, ''))) <> length(anchor) THEN
    RAISE EXCEPTION 'Unexpected b07a_office_multi body; R1 patch not applied';
  END IF;
  body := replace(body, anchor, '    -- R1: group-only multi-item booking: one final-value event for the whole booking.
    IF cardinality(v_ids) = 0 THEN
      INSERT INTO public.ticket_history (ticket_id, created_by_user_id, event_type, details)
      VALUES (v_ticket, p_actor, ''GROUP_BOOKING_CREATED'', jsonb_build_object(''multi_item'', true,
        ''items'', jsonb_array_length(v_items),
        ''ticket_total_after_create'', (SELECT total_amount FROM public.tickets WHERE id = v_ticket),
        ''persons'', (SELECT participant_count FROM public.tickets WHERE id = v_ticket),
        ''lines'', (SELECT count(*) FROM public.ticket_items WHERE ticket_id = v_ticket)));
    END IF;
' || anchor);
  EXECUTE body;
END $patch$;
