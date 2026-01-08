-- Create trigger to auto-generate request_number for booking_requests
CREATE TRIGGER generate_booking_request_number
  BEFORE INSERT ON public.booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_request_number();