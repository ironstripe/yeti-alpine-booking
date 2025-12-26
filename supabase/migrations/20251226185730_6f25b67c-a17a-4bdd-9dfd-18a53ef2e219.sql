-- =====================================================
-- YETY Ski School Booking System - Database Foundation
-- Tables: customers, customer_participants
-- =====================================================

-- Create customers table (contract partner/invoice recipient)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  first_name TEXT,
  last_name TEXT NOT NULL,
  street TEXT,
  zip TEXT,
  city TEXT,
  country TEXT DEFAULT 'LI',
  language TEXT DEFAULT 'de',
  preferred_channel TEXT DEFAULT 'email',
  kulanz_score INTEGER DEFAULT 0,
  notes TEXT,
  marketing_consent BOOLEAN DEFAULT false
);

-- Create index on email for faster lookups
CREATE INDEX idx_customers_email ON public.customers(email);

-- Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS policies for customers (authenticated users only - office staff)
CREATE POLICY "Authenticated users can view all customers"
ON public.customers
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (true);

-- Create customer_participants table (actual course participants)
CREATE TABLE public.customer_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  birth_date DATE NOT NULL,
  level TEXT,
  sport TEXT DEFAULT 'ski',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on customer_id for faster lookups
CREATE INDEX idx_customer_participants_customer_id ON public.customer_participants(customer_id);

-- Enable RLS on customer_participants
ALTER TABLE public.customer_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_participants (authenticated users only - office staff)
CREATE POLICY "Authenticated users can view all participants"
ON public.customer_participants
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert participants"
ON public.customer_participants
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update participants"
ON public.customer_participants
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete participants"
ON public.customer_participants
FOR DELETE
TO authenticated
USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.customers IS 'Contract partners and invoice recipients (usually parents)';
COMMENT ON TABLE public.customer_participants IS 'Actual course participants (usually children) linked to customers';
COMMENT ON COLUMN public.customers.kulanz_score IS 'Goodwill score from -10 to +10';
COMMENT ON COLUMN public.customers.preferred_channel IS 'Preferred contact channel: email, whatsapp, or phone';
COMMENT ON COLUMN public.customer_participants.level IS 'Skill level: e.g. Blue Prince, Blue King, Red Prince';
COMMENT ON COLUMN public.customer_participants.sport IS 'Sport type: ski or snowboard';