-- Promoted 2026-10-25 from supabase/pending/group_lunch_full_day.sql (B01-B11 + B07 coordinated release step 5). Do not re-run the pending copy: it was removed.
-- PREPARATION ONLY: body patch preserving guest levels, settlement, discounts, locks and replay.
-- No tables or business writes. Unexpected installed function version fails closed.
DO $patch$
DECLARE
  body text;
  old_price text := 'IF v_lunch_n <> 1 OR coalesce(v_lunch_price, 0) <= 0 THEN';
  old_days text := '    v_veg := cardinality(v_lunch) > 0 AND coalesce((e->>''vegetarian'')::boolean, false);';
  old_insert text := '    FOREACH d IN ARRAY v_lunch LOOP
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, date, unit_price, quantity,
        discount_percent, discount_reason, status, item_type, is_vegetarian, meeting_point)
      VALUES (v_ticket, v_lunch_product, v_pid, d, v_lunch_price, 1, v_disc, v_disc_reason, ''booked'', ''lunch'', v_veg, NULL);
    END LOOP;';
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, old_price) = 0 OR strpos(body, old_days) = 0 OR strpos(body, old_insert) = 0 THEN
    RAISE EXCEPTION 'Unexpected staff group booking body; lunch patch not applied';
  END IF;
  body := replace(body, old_price, 'IF v_lunch_n <> 1 OR v_lunch_price IS DISTINCT FROM 30::numeric THEN');
  body := replace(body, old_days, '    IF cardinality(v_lunch) > 0 AND (v_course.duration_minutes IS DISTINCT FROM 240 OR v_block IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''lunch_full_day'', DETAIL = i::text;
    END IF;
' || old_days);
  body := replace(body, old_insert, '    FOREACH d IN ARRAY v_lunch LOOP
      IF EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = v_ticket
          AND participant_id = v_pid AND date = d AND item_type = ''lunch''
          AND is_vegetarian IS DISTINCT FROM v_veg) THEN
        RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''lunch'', DETAIL = i::text;
      END IF;
      INSERT INTO public.ticket_items (ticket_id, product_id, participant_id, date, unit_price, quantity,
        discount_percent, discount_reason, status, item_type, is_vegetarian, meeting_point)
      SELECT v_ticket, v_lunch_product, v_pid, d, v_lunch_price, 1, v_disc, v_disc_reason, ''booked'', ''lunch'', v_veg, NULL
      WHERE NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = v_ticket
        AND participant_id = v_pid AND date = d AND item_type = ''lunch'');
    END LOOP;');
  EXECUTE body;
END $patch$;
