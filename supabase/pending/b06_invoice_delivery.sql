-- B06 ONLY. Pending, not installed. Assign the next free tracked migration at release.
-- Requires B04 (b04_delivery_compatibility.sql) to be installed first.
-- Adds the invoice binding for office invoice sends. Nullable: existing rows and
-- the website course flow (no invoice_id) keep their exact current behaviour.
-- The existing UNIQUE (ticket_id, kind) is preserved: one delivery row per
-- ticket+kind. A replacement/second invoice for the same ticket therefore can
-- never silently reuse the first invoice's delivery; the send-invoice function
-- fails closed with needs_review when the bound invoice differs.
BEGIN;
ALTER TABLE public.booking_email_deliveries
  ADD COLUMN IF NOT EXISTS invoice_id uuid;
COMMENT ON COLUMN public.booking_email_deliveries.invoice_id IS
  'B06: exact invoice this delivery belongs to. NULL = website course flow or historical row; never backfill. A row bound to a different invoice is review-required, never reused.';
COMMIT;
