-- Create vouchers table
CREATE TABLE public.vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  original_value DECIMAL NOT NULL CHECK (original_value >= 10 AND original_value <= 500),
  remaining_balance DECIMAL NOT NULL CHECK (remaining_balance >= 0),
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partial', 'redeemed', 'expired', 'cancelled')),
  buyer_customer_id UUID REFERENCES public.customers(id),
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  recipient_name TEXT,
  recipient_message TEXT,
  payment_method TEXT CHECK (payment_method IN ('bar', 'karte', 'twint', 'rechnung')),
  is_paid BOOLEAN DEFAULT true,
  internal_note TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create voucher_redemptions table
CREATE TABLE public.voucher_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id),
  amount DECIMAL NOT NULL CHECK (amount > 0),
  balance_after DECIMAL NOT NULL CHECK (balance_after >= 0),
  reason TEXT,
  redeemed_by UUID,
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for vouchers
CREATE POLICY "Authenticated users can view vouchers"
  ON public.vouchers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert vouchers"
  ON public.vouchers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update vouchers"
  ON public.vouchers FOR UPDATE
  USING (true);

-- RLS policies for voucher_redemptions
CREATE POLICY "Authenticated users can view redemptions"
  ON public.voucher_redemptions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert redemptions"
  ON public.voucher_redemptions FOR INSERT
  WITH CHECK (true);

-- Function to generate voucher code
CREATE OR REPLACE FUNCTION public.generate_voucher_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_year TEXT;
  next_num INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 9) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.vouchers
  WHERE code LIKE 'GS-' || current_year || '-%';
  
  NEW.code := 'GS-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

-- Trigger for auto-generating voucher code
CREATE TRIGGER generate_voucher_code_trigger
  BEFORE INSERT ON public.vouchers
  FOR EACH ROW
  WHEN (NEW.code IS NULL OR NEW.code = '')
  EXECUTE FUNCTION public.generate_voucher_code();

-- Trigger for updated_at
CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update voucher status based on balance
CREATE OR REPLACE FUNCTION public.update_voucher_status_on_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.vouchers
  SET remaining_balance = NEW.balance_after,
      status = CASE 
        WHEN NEW.balance_after = 0 THEN 'redeemed'
        WHEN NEW.balance_after < original_value THEN 'partial'
        ELSE status
      END,
      updated_at = now()
  WHERE id = NEW.voucher_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to update voucher on redemption
CREATE TRIGGER update_voucher_on_redemption
  AFTER INSERT ON public.voucher_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_voucher_status_on_redemption();