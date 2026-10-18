BEGIN;
-- Export product_public_offerings first if Office has entered configuration after release.
-- Removes only this additive feature. No product, course, booking, tariff or invoice writes.
DROP FUNCTION public.save_product_public_offering(uuid,jsonb,uuid);
DROP TABLE public.product_public_offerings;
DROP FUNCTION public.product_offering_validate();
DROP FUNCTION public.product_offering_shape_ok(text,smallint[],date[],jsonb);
COMMIT;
