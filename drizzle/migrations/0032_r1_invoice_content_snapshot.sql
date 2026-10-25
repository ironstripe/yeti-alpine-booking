-- R1 (S1 invoice projection): immutable, versioned content snapshot for NEW invoices (additive).
-- NULL = legacy invoice (rendered exactly as before; no backfill). Once a snapshot is stored it can never be
-- changed or removed; it may only be set while the invoice is still a draft or in the same update that
-- issues it (draft -> open). Payment snapshot, routing, QR, due date and idempotency are untouched.
-- Rollback: supabase/rollback/r1_invoice_content_snapshot_rollback.sql (deploy previous Edge functions first).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS content_snapshot jsonb;
COMMENT ON COLUMN public.invoices.content_snapshot IS
  'R1: frozen invoice content {version:1, lines:[{description, details, amount, ticket_item_ids}]}; NULL = legacy rendering.';
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_content_snapshot_shape;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_content_snapshot_shape CHECK (
  content_snapshot IS NULL OR (jsonb_typeof(content_snapshot) = 'object'
    AND coalesce(content_snapshot->'version' = '1'::jsonb, false)
    AND coalesce(jsonb_typeof(content_snapshot->'lines') = 'array', false)));

CREATE OR REPLACE FUNCTION public.invoice_content_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.content_snapshot IS NOT NULL AND NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = 'R1C01', MESSAGE = 'invoice_content_snapshot_immutable';
  END IF;
  IF OLD.content_snapshot IS NULL AND NEW.content_snapshot IS NOT NULL AND OLD.status <> 'draft' THEN
    -- Never attach new content to an already issued (legacy) invoice: no historical redraw.
    RAISE EXCEPTION USING ERRCODE = 'R1C01', MESSAGE = 'invoice_content_snapshot_legacy';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invoice_content_snapshot_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_invoice_content_snapshot_immutable ON public.invoices;
CREATE TRIGGER trg_invoice_content_snapshot_immutable BEFORE UPDATE OF content_snapshot ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_content_snapshot_immutable();
