-- Create shop_articles table
CREATE TABLE public.shop_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Sonstiges',
  price NUMERIC NOT NULL,
  cost_price NUMERIC,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
  has_variants BOOLEAN NOT NULL DEFAULT false,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shop_article_variants table
CREATE TABLE public.shop_article_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.shop_articles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  price NUMERIC,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shop_transactions table
CREATE TABLE public.shop_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_number TEXT UNIQUE NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC,
  discount_reason TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'twint', 'invoice')),
  linked_ticket_id UUID REFERENCES public.tickets(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shop_transaction_items table
CREATE TABLE public.shop_transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.shop_transactions(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.shop_articles(id),
  variant_id UUID REFERENCES public.shop_article_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shop_stock_movements table
CREATE TABLE public.shop_stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.shop_articles(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.shop_article_variants(id),
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment', 'return')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.shop_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_article_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shop_articles
CREATE POLICY "Authenticated users can view shop_articles"
  ON public.shop_articles FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shop_articles"
  ON public.shop_articles FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop_articles"
  ON public.shop_articles FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can delete shop_articles"
  ON public.shop_articles FOR DELETE USING (true);

-- RLS Policies for shop_article_variants
CREATE POLICY "Authenticated users can view shop_article_variants"
  ON public.shop_article_variants FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shop_article_variants"
  ON public.shop_article_variants FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop_article_variants"
  ON public.shop_article_variants FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can delete shop_article_variants"
  ON public.shop_article_variants FOR DELETE USING (true);

-- RLS Policies for shop_transactions
CREATE POLICY "Authenticated users can view shop_transactions"
  ON public.shop_transactions FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shop_transactions"
  ON public.shop_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop_transactions"
  ON public.shop_transactions FOR UPDATE USING (true);

-- RLS Policies for shop_transaction_items
CREATE POLICY "Authenticated users can view shop_transaction_items"
  ON public.shop_transaction_items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shop_transaction_items"
  ON public.shop_transaction_items FOR INSERT WITH CHECK (true);

-- RLS Policies for shop_stock_movements
CREATE POLICY "Authenticated users can view shop_stock_movements"
  ON public.shop_stock_movements FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shop_stock_movements"
  ON public.shop_stock_movements FOR INSERT WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_shop_article_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_shop_articles_updated_at
  BEFORE UPDATE ON public.shop_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_shop_article_updated_at();

-- Create function to generate transaction number
CREATE OR REPLACE FUNCTION public.generate_shop_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.shop_transactions;
  
  NEW.transaction_number := 'S-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-generating transaction number
CREATE TRIGGER generate_shop_transaction_number_trigger
  BEFORE INSERT ON public.shop_transactions
  FOR EACH ROW
  WHEN (NEW.transaction_number IS NULL OR NEW.transaction_number = '')
  EXECUTE FUNCTION public.generate_shop_transaction_number();

-- Insert sample products for testing
INSERT INTO public.shop_articles (name, sku, description, category, price, cost_price, stock_quantity, min_stock, is_popular, status) VALUES
  ('Mütze mit Logo', 'MUT-001', 'Warme Wintermütze mit gesticktem Schneesportschule-Logo', 'Bekleidung', 25.00, 12.00, 12, 5, true, 'active'),
  ('Handschuhe', 'HAN-001', 'Warme Skihandschuhe in verschiedenen Grössen', 'Bekleidung', 35.00, 18.00, 4, 5, true, 'active'),
  ('Skibrille Kinder', 'SKI-001', 'Kinderskibrille mit UV-Schutz', 'Ausrüstung', 45.00, 22.00, 1, 3, true, 'active'),
  ('Buff Multituch', 'BUF-001', 'Vielseitiges Multifunktionstuch', 'Accessoires', 20.00, 8.00, 25, 5, true, 'active'),
  ('T-Shirt Logo', 'TSH-001', 'Baumwoll-T-Shirt mit Schneesportschule-Logo', 'Bekleidung', 40.00, 15.00, 18, 5, true, 'active'),
  ('Trinkflasche', 'TRI-001', 'Isolierte Trinkflasche 500ml', 'Accessoires', 15.00, 6.00, 30, 5, false, 'active'),
  ('Sonnencreme SPF50', 'SON-001', 'Wasserfeste Sonnencreme für den Wintersport', 'Accessoires', 12.00, 5.00, 20, 10, false, 'active'),
  ('Lippenbalsam', 'LIP-001', 'Lippenpflege mit UV-Schutz', 'Accessoires', 5.00, 2.00, 50, 15, false, 'active');