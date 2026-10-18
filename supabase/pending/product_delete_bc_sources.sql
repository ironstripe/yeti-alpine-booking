-- Product delete v2: imported Booking-Corner tariff source rows no longer block deleting an otherwise
-- unused product. They are removed in the same locked transaction, after a full snapshot (product,
-- tiers, offering, BC source rows) is written to product_deletion_log for manual recovery.
-- All real business usage (courses, BC course variants, booking requests, ticket items,
-- public tariff display, pricing rules) still refuses the delete.
CREATE TABLE IF NOT EXISTS public.product_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
GRANT SELECT ON public.product_deletion_log TO authenticated;
GRANT ALL ON public.product_deletion_log TO service_role;
ALTER TABLE public.product_deletion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read product deletion log" ON public.product_deletion_log;
CREATE POLICY "Staff read product deletion log" ON public.product_deletion_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.product_delete(p_product uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deps jsonb;
  prod record;
BEGIN
  IF p_actor IS NULL OR NOT (public.is_admin_or_office(p_actor) OR public.is_super_admin(p_actor)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prod FROM public.products WHERE id = p_product FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  PERFORM 1 FROM public.bc_product_tariff_sources WHERE product_id = p_product FOR UPDATE;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'bc_2627_course_product_variants', NULLIF((SELECT count(*) FROM public.bc_2627_course_product_variants WHERE product_id = p_product), 0),
    'group_courses', NULLIF((SELECT count(*) FROM public.group_courses WHERE product_id = p_product), 0),
    'booking_requests', NULLIF((SELECT count(*) FROM public.booking_requests WHERE product_id = p_product), 0),
    'ticket_items', NULLIF((SELECT count(*) FROM public.ticket_items WHERE product_id = p_product), 0),
    'public_private_tariff_display', NULLIF((SELECT count(*) FROM public.public_private_tariff_display WHERE product_id = p_product), 0),
    'pricing_rules', NULLIF((SELECT count(*) FROM public.pricing_rules WHERE p_product = ANY(applies_to_products)), 0)
  )) INTO deps;

  IF deps <> '{}'::jsonb THEN
    RETURN jsonb_build_object('error', 'referenced', 'dependencies', deps);
  END IF;

  INSERT INTO public.product_deletion_log(product_id, product_name, deleted_by, snapshot)
  VALUES (p_product, prod.name, p_actor, jsonb_build_object(
    'product', to_jsonb(prod),
    'price_tiers', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.product_price_tiers t WHERE t.product_id = p_product), '[]'::jsonb),
    'public_offering', (SELECT to_jsonb(o) FROM public.product_public_offerings o WHERE o.product_id = p_product),
    'bc_product_tariff_sources', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.bc_product_tariff_sources s WHERE s.product_id = p_product), '[]'::jsonb)
  ));

  DELETE FROM public.bc_product_tariff_sources WHERE product_id = p_product;
  DELETE FROM public.products WHERE id = p_product;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.product_delete(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_delete(uuid, uuid) TO service_role;
