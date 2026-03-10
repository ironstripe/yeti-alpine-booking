-- 1. Add season_id to tickets (nullable FK)
ALTER TABLE public.tickets 
  ADD COLUMN season_id UUID REFERENCES public.seasons(id);

-- 2. Add season_id to products (nullable initially, backfill, then set NOT NULL)
ALTER TABLE public.products 
  ADD COLUMN season_id UUID REFERENCES public.seasons(id);

-- 3. Backfill tickets: match created_at against season date ranges
UPDATE public.tickets t
SET season_id = s.id
FROM public.seasons s
WHERE t.season_id IS NULL
  AND t.created_at::date >= s.start_date
  AND t.created_at::date <= s.end_date;

-- 4. Backfill products: assign all existing products to current season
UPDATE public.products
SET season_id = (SELECT id FROM public.seasons WHERE is_current = true LIMIT 1)
WHERE season_id IS NULL;

-- 5. Make products.season_id NOT NULL after backfill
ALTER TABLE public.products 
  ALTER COLUMN season_id SET NOT NULL;

-- 6. DB function to auto-assign season_id on ticket insert
CREATE OR REPLACE FUNCTION public.auto_assign_ticket_season()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id
    FROM public.seasons
    WHERE NEW.created_at::date >= start_date
      AND NEW.created_at::date <= end_date
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_ticket_season
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_ticket_season();

-- 7. DB function to duplicate products for a new season
CREATE OR REPLACE FUNCTION public.duplicate_products_for_season(
  p_source_season_id UUID,
  p_target_season_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_old_product RECORD;
  v_new_product_id UUID;
BEGIN
  FOR v_old_product IN
    SELECT * FROM public.products WHERE season_id = p_source_season_id
  LOOP
    INSERT INTO public.products (
      name, description, type, duration_minutes, price, currency,
      vat_rate, is_active, sort_order, is_training_product, pricing_type,
      min_age, max_age, season_id
    ) VALUES (
      v_old_product.name, v_old_product.description, v_old_product.type,
      v_old_product.duration_minutes, v_old_product.price, v_old_product.currency,
      v_old_product.vat_rate, v_old_product.is_active, v_old_product.sort_order,
      v_old_product.is_training_product, v_old_product.pricing_type,
      v_old_product.min_age, v_old_product.max_age, p_target_season_id
    ) RETURNING id INTO v_new_product_id;

    -- Copy price tiers
    INSERT INTO public.product_price_tiers (product_id, day_count, cumulative_price)
    SELECT v_new_product_id, day_count, cumulative_price
    FROM public.product_price_tiers
    WHERE product_id = v_old_product.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;