-- =====================================================
-- YETY Ski School - Instructors & Products Tables
-- =====================================================

-- Create instructors table (ski instructors with real-time status)
CREATE TABLE public.instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  level TEXT,
  specialization TEXT DEFAULT 'ski',
  status TEXT DEFAULT 'active',
  real_time_status TEXT DEFAULT 'unavailable',
  hourly_rate NUMERIC NOT NULL,
  bank_name TEXT,
  iban TEXT,
  ahv_number TEXT,
  notes TEXT
);

-- Create indexes for instructors
CREATE INDEX idx_instructors_email ON public.instructors(email);
CREATE INDEX idx_instructors_real_time_status ON public.instructors(real_time_status);

-- Enable RLS on instructors
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

-- RLS policies for instructors
CREATE POLICY "Authenticated users can view all instructors"
ON public.instructors
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert instructors"
ON public.instructors
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update instructors"
ON public.instructors
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete instructors"
ON public.instructors
FOR DELETE
TO authenticated
USING (true);

-- Enable Realtime for instructor status updates (traffic light system)
ALTER TABLE public.instructors REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructors;

-- Create products table (product catalog)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  duration_minutes INTEGER,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'CHF',
  vat_rate NUMERIC DEFAULT 7.7,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Create indexes for products
CREATE INDEX idx_products_type ON public.products(type);
CREATE INDEX idx_products_is_active ON public.products(is_active);

-- Enable RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- RLS policies for products
CREATE POLICY "Authenticated users can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.instructors IS 'Ski instructors with real-time availability status';
COMMENT ON COLUMN public.instructors.level IS 'Training level: e.g. Kids Instructor, Swiss Snowsports';
COMMENT ON COLUMN public.instructors.specialization IS 'Sport specialization: ski, snowboard, or both';
COMMENT ON COLUMN public.instructors.status IS 'Employment status: active, inactive, or on_hold';
COMMENT ON COLUMN public.instructors.real_time_status IS 'Traffic light status: available, on_call, or unavailable';
COMMENT ON COLUMN public.instructors.ahv_number IS 'Swiss social security number';

COMMENT ON TABLE public.products IS 'Product catalog for all bookable items';
COMMENT ON COLUMN public.products.type IS 'Product type: private, group, addon, or merchandise';
COMMENT ON COLUMN public.products.vat_rate IS 'VAT rate in percentage (default 7.7% for Switzerland)';