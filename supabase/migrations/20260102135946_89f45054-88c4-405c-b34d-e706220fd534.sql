-- Add validation trigger for ticket_items to enforce operational hours (09:00 - 16:00)
CREATE OR REPLACE FUNCTION public.validate_ticket_item_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate operational hours (09:00 - 16:00)
  IF NEW.time_start IS NOT NULL AND NEW.time_start < '09:00'::time THEN
    RAISE EXCEPTION 'Booking start time must be 09:00 or later (lift opening)';
  END IF;
  
  IF NEW.time_end IS NOT NULL AND NEW.time_end > '16:00'::time THEN
    RAISE EXCEPTION 'Booking end time must be 16:00 or earlier (lift closing)';
  END IF;
  
  IF NEW.time_start IS NOT NULL AND NEW.time_end IS NOT NULL AND NEW.time_end <= NEW.time_start THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for ticket_items
DROP TRIGGER IF EXISTS check_ticket_item_times ON public.ticket_items;
CREATE TRIGGER check_ticket_item_times
BEFORE INSERT OR UPDATE ON public.ticket_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_ticket_item_times();