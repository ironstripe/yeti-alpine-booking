-- Rollback for supabase/pending/bc_2627_atomic_course_booking.sql (only if it was applied).
-- Re-apply 20261003000000_bc_2627_quote_real_product_schema.sql afterwards to restore
-- the previous quote function.
DROP FUNCTION IF EXISTS public.bc_2627_confirm(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_begin_invoice(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_recount_instances(uuid[]);
DROP FUNCTION IF EXISTS public.bc_2627_finalize(uuid,text,jsonb,jsonb,text);
DROP FUNCTION IF EXISTS public.bc_2627_reserve(jsonb);
DROP FUNCTION IF EXISTS public.bc_2627_release_expired();
DROP FUNCTION IF EXISTS public.bc_2627_cancel(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_release_hold(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_course_options(date,date);
DROP FUNCTION IF EXISTS public.bc_2627_instructor_free(uuid,date,time,time);
DROP FUNCTION IF EXISTS public.bc_2627_instructor_can_teach(uuid,text);
DROP FUNCTION IF EXISTS public.bc_2627_live_instance(text,uuid,date,text);
DROP FUNCTION IF EXISTS public.bc_2627_instance_id(text,date,text);
DROP FUNCTION IF EXISTS public.bc_2627_age_at(date,date);
DROP FUNCTION IF EXISTS public.bc_2627_err(text,text);
-- Only safe when no invoice delivery rows exist:
-- DELETE FROM public.booking_email_deliveries WHERE kind='invoice';
ALTER TABLE public.booking_email_deliveries DROP CONSTRAINT IF EXISTS booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries ADD CONSTRAINT booking_email_deliveries_kind_check CHECK (kind='booking_confirmation');
-- Reservation snapshots are evidence (delete is blocked by trigger); drop only after export:
-- DROP TABLE public.bc_2627_reservations;
-- Delivery lease columns (only drop when unused):
-- ALTER TABLE public.booking_email_deliveries DROP COLUMN claimed_at, DROP COLUMN provider_idempotency_key, DROP COLUMN first_claimed_at;
-- generate_invoice_number(): the serialized version keeps the same number format; to revert,
-- restore the previous body from tests/sql/production_schema_baseline.sql (no data impact).
