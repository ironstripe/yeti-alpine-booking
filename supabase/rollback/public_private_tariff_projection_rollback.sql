-- Rollback for public_private_tariff_projection.sql. Redeploy the previous get-website-products FIRST.
-- Read-only function; no data to restore.
DROP FUNCTION IF EXISTS public.public_private_tariff_projection(uuid, uuid);
