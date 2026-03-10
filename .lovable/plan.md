

# Seasonal Analytics & Product Management

## Overview
Two-part feature: (1) link bookings to seasons for analytics, (2) make products season-specific with a duplication workflow.

## Database Changes (Single Migration)

```sql
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
SET season_id = 'eb4c5f0a-18e7-45e3-bac6-bff6e06d31a1'
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
```

Using a trigger for auto-assignment means **zero changes** needed in the 4 ticket-insert locations (useCreateBooking, SchoolCampBooking, useSharedLesson, edge function).

## Code Changes

### 1. `src/hooks/useSeasons.ts`
- Add a `useCreateSeasonWithProducts` mutation that:
  1. Creates the new season
  2. Calls `duplicate_products_for_season(previous_season_id, new_season_id)` via RPC

### 2. `src/pages/SettingsSeasons.tsx`
- Update the "Neue Saison" dialog to include a checkbox: "Produkte der letzten Saison übernehmen" (checked by default)
- Wire it to the new `useCreateSeasonWithProducts` hook
- Show a success toast with count of duplicated products

### 3. `src/hooks/useProducts.ts`
- Add `seasonId` parameter to `useProducts()` options
- When `seasonId` is provided, add `.eq("season_id", seasonId)` filter

### 4. `src/pages/SettingsProducts.tsx`
- Add a season selector (dropdown) at the top, defaulting to current season
- Pass selected `seasonId` to `useProducts()`
- When creating a new product, auto-set `season_id` to selected season

### 5. `src/components/settings/ProductFormModal.tsx`
- Accept `seasonId` prop
- Include `season_id` in the create/update payload

### 6. Booking product selectors
- `src/hooks/useCreateBooking.ts`, `src/components/bookings/wizard/Step2ProductDates.tsx`, `Step2ProductAllocation.tsx`: filter products by current season (use `useCurrentSeason` to get `season_id`)
- Edge function `create-booking-from-extraction`: add `.eq("season_id", current_season_id)` filter when selecting products

## Files Modified
1. **Migration SQL** — schema + trigger + RPC function
2. `src/hooks/useSeasons.ts` — new mutation hook
3. `src/pages/SettingsSeasons.tsx` — enhanced create dialog
4. `src/hooks/useProducts.ts` — season filter
5. `src/pages/SettingsProducts.tsx` — season selector UI
6. `src/components/settings/ProductFormModal.tsx` — season_id prop
7. `src/hooks/useCreateBooking.ts` — filter products by season
8. `src/components/bookings/wizard/Step2ProductDates.tsx` — filter by season
9. `src/components/bookings/wizard/Step2ProductAllocation.tsx` — filter by season
10. `supabase/functions/create-booking-from-extraction/index.ts` — filter by season

