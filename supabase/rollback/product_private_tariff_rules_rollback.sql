-- Rollback for supabase/pending/product_private_tariff_rules.sql (B07-P + B07-P2), consumer-first:
-- set PRODUCT_PRIVATE_TARIFFS_LIVE=false + republish and redeploy the previous private-appointments
-- function BEFORE running this.
-- 1. Restore pa_create_booking: re-run the pa_create_booking block of supabase/pending/staff_guest_level.sql (0007).
-- 2. Restore pa_apply_slot: re-run the pa_apply_slot block of drizzle/migrations/0001_pa_assign_later.sql.
-- 3. Export configuration + provenance first (evidence), e.g.
--    \copy public.product_private_tariff_rules TO 'rules.csv' CSV HEADER
--    \copy public.private_appointment_pricing TO 'pricing.csv' CSV HEADER
-- 4. Then, only after review:
BEGIN;
DROP TRIGGER IF EXISTS trg_pa_tariff_transition_appt ON public.private_appointments;
DROP TRIGGER IF EXISTS trg_pa_tariff_transition_item ON public.ticket_items;
DROP TRIGGER IF EXISTS trg_pa_tariff_transition_parts ON public.private_appointment_participants;
DROP FUNCTION IF EXISTS public.pa_tariff_transition_guard();
DROP FUNCTION IF EXISTS public.pa_create_quote(jsonb);
DROP FUNCTION IF EXISTS public.pa_price_request(uuid, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.pa_price_request(uuid, jsonb, jsonb, boolean, jsonb);
DROP FUNCTION IF EXISTS public.pa_private_day_context(uuid[], date[]);
DROP FUNCTION IF EXISTS public.pa_discount_intent(jsonb, boolean);
DROP FUNCTION IF EXISTS public.pa_same_day_discount(jsonb, numeric, integer);
DROP FUNCTION IF EXISTS public.save_product_private_tariff_rules(uuid, integer, jsonb, uuid);
DROP FUNCTION IF EXISTS public.pa_product_quote(uuid, date, time, time, integer, boolean);
-- Tables are kept by default (configuration + pricing evidence). Drop only with explicit approval:
-- DROP TABLE public.private_appointment_pricing; DROP TABLE public.private_lesson_discount_rule;
-- DROP TABLE public.product_private_tariff_rules; DROP TABLE public.product_private_tariff_revisions;
COMMIT;
-- Bookings created meanwhile keep their stored prices and discounts; nothing is recalculated.
-- NOTE: after the guard is dropped, moves of tariff-priced appointments would reprice via legacy pa_price.
