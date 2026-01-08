-- School Settings table (singleton pattern)
CREATE TABLE public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Skischule',
  slogan TEXT,
  logo_url TEXT,
  
  -- Address
  street TEXT,
  zip TEXT,
  city TEXT,
  country TEXT DEFAULT 'LI',
  
  -- Contact
  phone TEXT,
  email TEXT,
  website TEXT,
  
  -- Banking
  bank_name TEXT,
  iban TEXT,
  bic TEXT,
  account_holder TEXT,
  vat_number TEXT,
  
  -- Hours (stored as JSONB)
  office_hours JSONB DEFAULT '{"weekdays": {"start": "08:00", "end": "17:00"}, "saturday": {"start": "08:00", "end": "12:00"}, "sunday": null}'::jsonb,
  lesson_times JSONB DEFAULT '{"morning": {"start": "10:00", "end": "12:00"}, "afternoon": {"start": "14:00", "end": "16:00"}}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- Only admin/office can view and edit school settings
CREATE POLICY "Admin and office can view school settings"
  ON public.school_settings FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can update school settings"
  ON public.school_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can insert school settings"
  ON public.school_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_school_settings_updated_at
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seasons table
CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view seasons"
  ON public.seasons FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can manage seasons"
  ON public.seasons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON public.seasons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- High season periods
CREATE TABLE public.high_season_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.high_season_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view high season periods"
  ON public.high_season_periods FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can manage high season periods"
  ON public.high_season_periods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Closure dates
CREATE TABLE public.closure_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(season_id, date)
);

ALTER TABLE public.closure_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view closure dates"
  ON public.closure_dates FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can manage closure dates"
  ON public.closure_dates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Pricing rules table
CREATE TABLE public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('volume', 'duration', 'promo', 'partner')),
  
  -- Conditions
  min_quantity INTEGER,
  min_days INTEGER,
  promo_code TEXT,
  partner_name TEXT,
  applies_to_products UUID[],
  
  -- Discount
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed', 'override')),
  discount_value DECIMAL(10,2) NOT NULL,
  
  -- Validity
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view pricing rules"
  ON public.pricing_rules FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can manage pricing rules"
  ON public.pricing_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Cancellation policy (singleton)
CREATE TABLE public.cancellation_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  free_cancellation_hours INTEGER DEFAULT 24,
  late_cancellation_percent INTEGER DEFAULT 50,
  no_show_percent INTEGER DEFAULT 100,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.cancellation_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view cancellation policy"
  ON public.cancellation_policy FOR SELECT
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can manage cancellation policy"
  ON public.cancellation_policy FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default school settings
INSERT INTO public.school_settings (name, slogan, country)
VALUES ('Skischule YETY Malbun', 'Skifahren lernen mit Spass', 'LI');

-- Insert default cancellation policy
INSERT INTO public.cancellation_policy (free_cancellation_hours, late_cancellation_percent, no_show_percent)
VALUES (24, 50, 100);