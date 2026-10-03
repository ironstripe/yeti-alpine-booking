-- Rollback for 20261003220000_bc_2627_atomic_course_booking.sql.
-- Re-apply 20261003000000_bc_2627_quote_real_product_schema.sql afterwards to restore
-- the previous quote (with the old group-capacity rejection).
DROP FUNCTION IF EXISTS public.bc_2627_release(uuid);
DROP FUNCTION IF EXISTS public.bc_2627_confirm(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_recount_instances(uuid[]);
DROP FUNCTION IF EXISTS public.bc_2627_finalize(uuid,text,jsonb,jsonb,text);
DROP FUNCTION IF EXISTS public.bc_2627_reserve(jsonb);
DROP FUNCTION IF EXISTS public.bc_2627_course_options(date,date);
DROP FUNCTION IF EXISTS public.bc_2627_age_at(date,date);
DROP FUNCTION IF EXISTS public.bc_2627_err(text,text);
-- Only safe when no invoice delivery rows exist:
-- DELETE FROM public.booking_email_deliveries WHERE kind='invoice';
ALTER TABLE public.booking_email_deliveries DROP CONSTRAINT IF EXISTS booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries ADD CONSTRAINT booking_email_deliveries_kind_check CHECK (kind='booking_confirmation');
-- Snapshots are evidence; drop only after export:
-- DROP TABLE public.bc_2627_reservations;
