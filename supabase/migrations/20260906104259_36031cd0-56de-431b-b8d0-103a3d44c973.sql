CREATE TABLE public.billing_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_type text NOT NULL DEFAULT 'hotel',
  billing_email text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_partners TO authenticated;
GRANT ALL ON public.billing_partners TO service_role;

ALTER TABLE public.billing_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view billing partners"
ON public.billing_partners FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin or office can insert billing partners"
ON public.billing_partners FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin or office can update billing partners"
ON public.billing_partners FOR UPDATE TO authenticated
USING (public.is_admin_or_office(auth.uid()))
WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin can delete billing partners"
ON public.billing_partners FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_billing_partners_updated_at
BEFORE UPDATE ON public.billing_partners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS billing_partner_id uuid REFERENCES public.billing_partners(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tickets_billing_partner ON public.tickets(billing_partner_id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discipline text,
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS reporting_category text;

ALTER TABLE public.products
  ADD CONSTRAINT products_discipline_check CHECK (discipline IS NULL OR discipline IN ('ski','snowboard','other')),
  ADD CONSTRAINT products_audience_check CHECK (audience IS NULL OR audience IN ('kids','adults','mixed')),
  ADD CONSTRAINT products_reporting_category_check CHECK (reporting_category IS NULL OR reporting_category IN ('private','group','other'));

CREATE OR REPLACE FUNCTION public.duplicate_products_for_season(p_source_season_id uuid, p_target_season_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_product RECORD;
  v_new_id uuid;
BEGIN
  FOR v_product IN
    SELECT * FROM public.products WHERE season_id = p_source_season_id
  LOOP
    INSERT INTO public.products (
      season_id, name, description, type, price, currency, vat_rate,
      duration_minutes, min_age, max_age, is_active, sort_order, pricing_type,
      is_training_product, discipline, audience, reporting_category
    ) VALUES (
      p_target_season_id, v_product.name, v_product.description, v_product.type,
      v_product.price, v_product.currency, v_product.vat_rate, v_product.duration_minutes,
      v_product.min_age, v_product.max_age, v_product.is_active, v_product.sort_order,
      v_product.pricing_type, v_product.is_training_product,
      v_product.discipline, v_product.audience, v_product.reporting_category
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.product_price_tiers (product_id, min_participants, max_participants, price, sort_order)
    SELECT v_new_id, min_participants, max_participants, price, sort_order
    FROM public.product_price_tiers WHERE product_id = v_product.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;