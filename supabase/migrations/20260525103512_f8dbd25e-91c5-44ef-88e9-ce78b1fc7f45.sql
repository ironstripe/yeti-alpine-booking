-- Booking consents table for legal contract compliance (CH GDPR/AGB)
CREATE TABLE public.booking_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  agb_accepted BOOLEAN NOT NULL,
  agb_version TEXT NOT NULL,
  privacy_accepted BOOLEAN NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  source TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_consents_ticket_id ON public.booking_consents(ticket_id);

ALTER TABLE public.booking_consents ENABLE ROW LEVEL SECURITY;

-- Only admin/office can read consents
CREATE POLICY "Admin/office can view consents"
  ON public.booking_consents FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

-- Only service role can insert (via edge function)
CREATE POLICY "Service role can insert consents"
  ON public.booking_consents FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Function to generate ticket numbers (T-YYYY-NNNNN)
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ticket_number FROM 'T-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.tickets
  WHERE ticket_number LIKE 'T-' || year_str || '-%';
  RETURN 'T-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;