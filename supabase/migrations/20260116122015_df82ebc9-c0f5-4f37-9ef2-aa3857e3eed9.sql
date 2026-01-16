-- Add pricing_type column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'fixed';

-- Add min_age and max_age columns for age-based products
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_age INTEGER;

-- Create product_price_tiers table for tiered pricing
CREATE TABLE IF NOT EXISTS product_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  day_count INTEGER NOT NULL CHECK (day_count >= 1 AND day_count <= 7),
  cumulative_price DECIMAL(10,2) NOT NULL CHECK (cumulative_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, day_count)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_tiers_product ON product_price_tiers(product_id);

-- Enable RLS on price tiers
ALTER TABLE product_price_tiers ENABLE ROW LEVEL SECURITY;

-- RLS policies for price tiers (public read, admin/office write)
CREATE POLICY "Price tiers are viewable by everyone"
  ON product_price_tiers FOR SELECT
  USING (true);

CREATE POLICY "Price tiers can be managed by admin/office"
  ON product_price_tiers FOR ALL
  USING (public.is_admin_or_office(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_price_tiers_updated_at
  BEFORE UPDATE ON product_price_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();