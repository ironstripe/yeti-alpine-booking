-- Create daily_reconciliations table for end-of-day cash register reconciliation
CREATE TABLE public.daily_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'no_revenue')),
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_bookings INTEGER NOT NULL DEFAULT 0,
  total_instructors INTEGER NOT NULL DEFAULT 0,
  total_hours NUMERIC NOT NULL DEFAULT 0,
  cash_expected NUMERIC NOT NULL DEFAULT 0,
  cash_actual NUMERIC,
  card_expected NUMERIC NOT NULL DEFAULT 0,
  card_actual NUMERIC,
  twint_expected NUMERIC NOT NULL DEFAULT 0,
  twint_actual NUMERIC,
  difference NUMERIC NOT NULL DEFAULT 0,
  difference_reason TEXT,
  difference_acknowledged BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID,
  closed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view reconciliations"
  ON public.daily_reconciliations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert reconciliations"
  ON public.daily_reconciliations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update open reconciliations"
  ON public.daily_reconciliations FOR UPDATE TO authenticated 
  USING (status = 'open' OR is_admin_or_office(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_daily_reconciliations_updated_at
  BEFORE UPDATE ON public.daily_reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();