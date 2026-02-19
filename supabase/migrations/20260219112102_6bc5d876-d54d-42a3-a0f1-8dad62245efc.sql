
-- Update log_ticket_created to capture auth.uid() and actor_email
CREATE OR REPLACE FUNCTION public.log_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
  VALUES (
    NEW.id,
    'BOOKING_CREATED',
    auth.uid(),
    jsonb_build_object(
      'ticket_number', NEW.ticket_number,
      'total_amount', NEW.total_amount,
      'customer_id', NEW.customer_id,
      'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
  RETURN NEW;
END;
$$;

-- Update log_ticket_status_changed
CREATE OR REPLACE FUNCTION public.log_ticket_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Update log_ticket_item_instructor_changed
CREATE OR REPLACE FUNCTION public.log_ticket_item_instructor_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.instructor_id IS DISTINCT FROM NEW.instructor_id THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
    VALUES (
      NEW.ticket_id,
      'INSTRUCTOR_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'ticket_item_id', NEW.id,
        'old_instructor_id', OLD.instructor_id,
        'new_instructor_id', NEW.instructor_id,
        'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Update log_booking_cancelled
CREATE OR REPLACE FUNCTION public.log_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, created_by_user_id, details)
  VALUES (
    NEW.ticket_id,
    'BOOKING_CANCELLED',
    auth.uid(),
    jsonb_build_object(
      'cancellation_type', NEW.cancellation_type,
      'cancellation_fee', NEW.fee_charged,
      'reason', NEW.cancellation_reason,
      'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
  RETURN NEW;
END;
$$;
