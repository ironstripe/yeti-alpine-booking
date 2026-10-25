-- Rollback for r1_invoice_content_snapshot.sql. Redeploy the previous issue-invoice/send-invoice/confirm-booking/
-- course-booking/retry-* functions FIRST (they write/read content_snapshot). The column is kept (data preserved,
-- marked deprecated); only the guard is removed.
DROP TRIGGER IF EXISTS trg_invoice_content_snapshot_immutable ON public.invoices;
DROP FUNCTION IF EXISTS public.invoice_content_snapshot_immutable();
COMMENT ON COLUMN public.invoices.content_snapshot IS 'DEPRECATED (R1 rolled back): not read by the app';
