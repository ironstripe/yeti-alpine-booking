-- Rollback for supabase/pending/product_private_tariff_rules.sql (consumer-first: disable the
-- frontend flag and redeploy the previous private-appointments function BEFORE running this).
-- 1. Restore pa_create_booking: re-run the pa_create_booking block of supabase/pending/staff_guest_level.sql (0007).
-- 2. Export configured rules first (evidence), e.g. \copy public.product_private_tariff_rules TO 'rules.csv' CSV HEADER
-- 3. Then, only after review:
BEGIN;
DROP FUNCTION IF EXISTS public.pa_create_quote(jsonb);
DROP FUNCTION IF EXISTS public.save_product_private_tariff_rules(uuid, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.pa_product_quote(uuid, date, time, time, integer, boolean);
-- Tables are kept by default (configuration evidence). Drop only with explicit approval:
-- DROP TABLE public.product_private_tariff_rules; DROP TABLE public.product_private_tariff_revisions;
COMMIT;
-- Bookings created under B07-P keep their stored prices; nothing is recalculated.
