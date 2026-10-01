-- Website cards are a projection of YETI products, not a second offer catalog.
-- Data-only and fail-closed: existing products, prices and active flags are unchanged.
BEGIN;

ALTER TABLE public.products
  ADD COLUMN website_subtitle text,
  ADD COLUMN website_requirement text,
  ADD COLUMN website_meta jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN website_notes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN website_badge text,
  ADD COLUMN website_icon_key text,
  ADD COLUMN website_online_bookable boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD CONSTRAINT product_website_copy_limits CHECK (
    (website_subtitle IS NULL OR char_length(website_subtitle) <= 240)
    AND (website_requirement IS NULL OR char_length(website_requirement) <= 500)
    AND jsonb_typeof(website_meta) = 'array' AND jsonb_array_length(website_meta) <= 8
    AND cardinality(website_notes) <= 8
    AND (website_badge IS NULL OR website_badge IN ('beliebt','empfohlen'))
    AND (website_icon_key IS NULL OR website_icon_key IN ('user','users','baby','calendar','snowflake','trophy','sparkles'))
  );

-- The online booking gate is separate from active product / visible card status.
-- It must be removed by a reviewed migration after pricing, slots, invoice and web flow pass.
CREATE FUNCTION public.prevent_unvalidated_product_web_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $guard$
BEGIN
  IF NEW.website_online_bookable THEN
    RAISE EXCEPTION 'Web booking requires a reviewed release migration';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.prevent_unvalidated_product_web_booking() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_unvalidated_product_web_booking_on_products
  BEFORE INSERT OR UPDATE OF website_online_bookable ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unvalidated_product_web_booking();

-- Existing broad authenticated write policies include teacher accounts; product prices
-- and website copy must instead be managed by office/admin/super_admin only.
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
CREATE POLICY "Staff can insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update products" ON public.products FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete products" ON public.products FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

COMMIT;
