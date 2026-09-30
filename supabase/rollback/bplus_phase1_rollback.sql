-- Rollback B+ Phase 1 (booking confirmation delivery). Redeploy previous confirm-booking first.
ALTER TABLE public.email_logs DROP COLUMN IF EXISTS delivery_id;
DROP TABLE IF EXISTS public.booking_email_deliveries;
