-- Rollback for supabase/pending/product_private_tariffs.sql
-- Removes the effective private tariff matrix and its save function.
-- Destructive: drops product_private_tariffs (effective edited prices). Run only after review.
BEGIN;
DROP FUNCTION IF EXISTS public.save_product_private_tariffs(uuid, jsonb, uuid);
DROP TABLE IF EXISTS public.product_private_tariffs;
COMMIT;
