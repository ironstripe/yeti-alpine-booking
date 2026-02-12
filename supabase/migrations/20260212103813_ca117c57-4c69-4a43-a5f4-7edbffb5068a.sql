
-- Create ticket_history table
CREATE TABLE public.ticket_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  event_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can SELECT
CREATE POLICY "Authenticated users can view ticket_history"
  ON public.ticket_history FOR SELECT
  USING (true);

-- RLS: authenticated can INSERT
CREATE POLICY "Authenticated users can insert ticket_history"
  ON public.ticket_history FOR INSERT
  WITH CHECK (true);

-- Index for fast lookups by ticket_id
CREATE INDEX idx_ticket_history_ticket_id ON public.ticket_history(ticket_id);

-- Trigger 1: Log ticket creation
CREATE OR REPLACE FUNCTION public.log_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, details)
  VALUES (
    NEW.id,
    'BOOKING_CREATED',
    jsonb_build_object(
      'ticket_number', NEW.ticket_number,
      'total_amount', NEW.total_amount,
      'customer_id', NEW.customer_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_created();

-- Trigger 2: Log ticket status changes
CREATE OR REPLACE FUNCTION public.log_ticket_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, details)
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_status_changed
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_status_changed();

-- Trigger 3: Log instructor changes on ticket_items
CREATE OR REPLACE FUNCTION public.log_ticket_item_instructor_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.instructor_id IS DISTINCT FROM NEW.instructor_id THEN
    INSERT INTO public.ticket_history (ticket_id, event_type, details)
    VALUES (
      NEW.ticket_id,
      'INSTRUCTOR_CHANGED',
      jsonb_build_object(
        'ticket_item_id', NEW.id,
        'old_instructor_id', OLD.instructor_id,
        'new_instructor_id', NEW.instructor_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_item_instructor_changed
  AFTER UPDATE OF instructor_id ON public.ticket_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_item_instructor_changed();

-- Trigger 4: Log booking cancellations
CREATE OR REPLACE FUNCTION public.log_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticket_history (ticket_id, event_type, details)
  VALUES (
    NEW.ticket_id,
    'BOOKING_CANCELLED',
    jsonb_build_object(
      'cancellation_type', NEW.cancellation_type,
      'cancellation_fee', NEW.fee_charged,
      'reason', NEW.cancellation_reason
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_cancelled
  AFTER INSERT ON public.booking_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION public.log_booking_cancelled();
