-- Minimal guarded product delete. Called only by the staff Edge function `product-management` (service_role).
-- Locks the product row (blocks concurrent FK inserts), refuses when protected usage exists,
-- otherwise deletes in one transaction; DB CASCADE removes only own price tiers and public offering.
CREATE OR REPLACE FUNCTION public.product_delete(p_product uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deps jsonb;
BEGIN
  IF p_actor IS NULL OR NOT (public.is_admin_or_office(p_actor) OR public.is_super_admin(p_actor)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.products WHERE id = p_product FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'bc_product_tariff_sources', NULLIF((SELECT count(*) FROM public.bc_product_tariff_sources WHERE product_id = p_product), 0),
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

  DELETE FROM public.products WHERE id = p_product;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.product_delete(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_delete(uuid, uuid) TO service_role;
