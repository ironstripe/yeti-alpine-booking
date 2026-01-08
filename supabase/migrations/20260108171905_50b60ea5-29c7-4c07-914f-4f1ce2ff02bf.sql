-- Create booking_requests table for public booking inquiries
CREATE TABLE public.booking_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'rejected', 'expired')),
  type TEXT NOT NULL CHECK (type IN ('private', 'group')),
  product_id UUID REFERENCES public.products(id),
  requested_date DATE NOT NULL,
  requested_time_slot TEXT CHECK (requested_time_slot IN ('morning', 'afternoon', 'flexible')),
  duration_hours NUMERIC,
  sport_type TEXT NOT NULL CHECK (sport_type IN ('ski', 'snowboard')),
  participant_count INTEGER NOT NULL DEFAULT 1,
  participants_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  voucher_code TEXT,
  voucher_discount NUMERIC,
  estimated_price NUMERIC,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'widget', 'manual')),
  magic_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  converted_ticket_id UUID REFERENCES public.tickets(id),
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Public can insert new requests (no auth required)
CREATE POLICY "Anyone can create booking requests"
ON public.booking_requests
FOR INSERT
WITH CHECK (true);

-- Public can view their own request via magic token
CREATE POLICY "Anyone can view requests by magic token"
ON public.booking_requests
FOR SELECT
USING (true);

-- Authenticated users (office/admin) can update requests
CREATE POLICY "Authenticated users can update booking requests"
ON public.booking_requests
FOR UPDATE
USING (auth.role() = 'authenticated');

-- Create index for faster lookups
CREATE INDEX idx_booking_requests_status ON public.booking_requests(status);
CREATE INDEX idx_booking_requests_magic_token ON public.booking_requests(magic_token);
CREATE INDEX idx_booking_requests_request_number ON public.booking_requests(request_number);

-- Function to generate request number
CREATE OR REPLACE FUNCTION generate_request_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(request_number FROM 'ANF-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.booking_requests
  WHERE request_number LIKE 'ANF-' || year_str || '-%';
  
  NEW.request_number := 'ANF-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate request number
CREATE TRIGGER set_request_number
  BEFORE INSERT ON public.booking_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION generate_request_number();