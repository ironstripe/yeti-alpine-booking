-- =====================================================
-- YETY Ski School - Booking Tables (tickets, ticket_items)
-- =====================================================

-- Create tickets table (booking header)
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ticket_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  status TEXT DEFAULT 'draft',
  total_amount NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  payment_due_date DATE,
  notes TEXT,
  internal_notes TEXT,
  created_by UUID
);

-- Create indexes for tickets
CREATE INDEX idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX idx_tickets_customer_id ON public.tickets(customer_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);

-- Enable RLS on tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- RLS policies for tickets
CREATE POLICY "Authenticated users can view all tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert tickets"
ON public.tickets
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update tickets"
ON public.tickets
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete tickets"
ON public.tickets
FOR DELETE
TO authenticated
USING (true);

-- Create ticket_items table (booking line items)
CREATE TABLE public.ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  participant_id UUID REFERENCES public.customer_participants(id),
  instructor_id UUID REFERENCES public.instructors(id),
  date DATE NOT NULL,
  time_start TIME,
  time_end TIME,
  meeting_point TEXT,
  unit_price NUMERIC NOT NULL,
  quantity INTEGER DEFAULT 1,
  discount_percent NUMERIC DEFAULT 0,
  discount_reason TEXT,
  line_total NUMERIC GENERATED ALWAYS AS (unit_price * quantity * (1 - COALESCE(discount_percent, 0) / 100)) STORED,
  status TEXT DEFAULT 'booked',
  instructor_confirmation TEXT DEFAULT 'pending',
  instructor_confirmed_at TIMESTAMPTZ,
  actual_duration_minutes INTEGER,
  instructor_notes TEXT,
  internal_notes TEXT
);

-- Create indexes for ticket_items
CREATE INDEX idx_ticket_items_ticket_id ON public.ticket_items(ticket_id);
CREATE INDEX idx_ticket_items_date ON public.ticket_items(date);
CREATE INDEX idx_ticket_items_instructor_id ON public.ticket_items(instructor_id);
CREATE INDEX idx_ticket_items_status ON public.ticket_items(status);

-- Enable RLS on ticket_items
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for ticket_items
CREATE POLICY "Authenticated users can view all ticket_items"
ON public.ticket_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert ticket_items"
ON public.ticket_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update ticket_items"
ON public.ticket_items
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete ticket_items"
ON public.ticket_items
FOR DELETE
TO authenticated
USING (true);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for tickets.updated_at
CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.tickets IS 'Booking header - one ticket per customer booking';
COMMENT ON COLUMN public.tickets.ticket_number IS 'Unique ticket number format: YETY-2025-00001';
COMMENT ON COLUMN public.tickets.status IS 'Booking status: draft, confirmed, paid, partially_paid, cancelled';
COMMENT ON COLUMN public.tickets.payment_method IS 'Payment method: cash, card, twint, invoice, voucher';
COMMENT ON COLUMN public.tickets.created_by IS 'User ID who created the ticket (audit trail)';

COMMENT ON TABLE public.ticket_items IS 'Individual booking line items with own status for tracking';
COMMENT ON COLUMN public.ticket_items.meeting_point IS 'Meeting point: Hotel Gorfion, Malbipark, Kasse Sesselbahn Täli';
COMMENT ON COLUMN public.ticket_items.line_total IS 'Computed: unit_price * quantity * (1 - discount_percent/100)';
COMMENT ON COLUMN public.ticket_items.status IS 'Item status: booked, rebooked, cancelled, completed';
COMMENT ON COLUMN public.ticket_items.instructor_confirmation IS 'Instructor confirmation: pending, confirmed, declined';
COMMENT ON COLUMN public.ticket_items.actual_duration_minutes IS 'Actual duration if different from planned';