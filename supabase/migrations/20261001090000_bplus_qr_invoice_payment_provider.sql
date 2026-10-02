-- B+ Phase 2: Swiss QR invoice e-mail delivery + payment provider integration.
-- Additive only: existing rows, statuses and templates keep working.
-- Rollback: supabase/rollback/bplus_qr_payment_rollback.sql

-- ---------------------------------------------------------------------------
-- 1) Delivery kinds: the invoice e-mail joins the booking confirmation
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_email_deliveries
  DROP CONSTRAINT IF EXISTS booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries
  ADD CONSTRAINT booking_email_deliveries_kind_check
  CHECK (kind IN ('booking_confirmation', 'invoice'));

-- ---------------------------------------------------------------------------
-- 2) Payment sessions: one checkout attempt per booking, provider references
--    and the verified amount are stored server-side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe')),
  provider_session_id text NOT NULL UNIQUE,
  provider_payment_intent_id text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency IN ('CHF', 'EUR')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'processing', 'succeeded', 'failed', 'expired', 'refunded')),
  checkout_url text,
  expires_at timestamptz,
  consumed_at timestamptz,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_sessions_ticket_idx
  ON public.payment_sessions (ticket_id);
CREATE INDEX IF NOT EXISTS payment_sessions_intent_idx
  ON public.payment_sessions (provider_payment_intent_id);
-- At most one open checkout per booking; finished sessions stay for the audit.
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_live_unique
  ON public.payment_sessions (ticket_id) WHERE status IN ('created', 'processing');

GRANT ALL ON public.payment_sessions TO service_role;
GRANT SELECT ON public.payment_sessions TO authenticated;
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office and admin can view payment sessions"
  ON public.payment_sessions FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()));
CREATE TRIGGER update_payment_sessions_updated_at
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) Payment events: every webhook exactly once (idempotency + audit trail).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe')),
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  payment_session_id uuid REFERENCES public.payment_sessions(id) ON DELETE SET NULL,
  provider_session_id text,
  outcome text,
  processing_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_events_ticket_idx ON public.payment_events (ticket_id);
CREATE INDEX IF NOT EXISTS payment_events_session_idx ON public.payment_events (payment_session_id);

GRANT ALL ON public.payment_events TO service_role;
GRANT SELECT ON public.payment_events TO authenticated;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office and admin can view payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Invoice e-mail template: the Swiss QR payment part is inserted as markup.
--    {{invoice.qr_payment_part}} is filled server-side from the invoice's
--    immutable payment snapshot; the amount/IBAN/reference are never typed by
--    the office.
-- ---------------------------------------------------------------------------
UPDATE public.email_templates
SET subject = 'Rechnung {{invoice.number}} - {{school.name}}',
    body_html = '<p>Guten Tag {{customer.first_name}} {{customer.last_name}}</p>'
      || '<p>für Ihre Buchung {{ticket.ticket_number}} erhalten Sie die Rechnung {{invoice.number}}.</p>'
      || '<p><strong>Betrag:</strong> {{invoice.currency}} {{invoice.total}}<br><strong>Zahlbar bis:</strong> {{invoice.due_date}}</p>'
      || '{{invoice.qr_payment_part}}'
      || '<p>Mit dem QR-Code in Ihrer Banking-App erfassen Sie alle Zahlungsdaten automatisch.</p>'
      || '<p>Freundliche Grüsse<br>{{school.name}}</p>',
    variables = '["customer.first_name", "customer.last_name", "ticket.ticket_number", "invoice.number", "invoice.total", "invoice.currency", "invoice.due_date", "invoice.qr_payment_part", "school.name"]'::jsonb,
    attachments = '{"invoice_pdf": true, "invoice_qr_png": true}'::jsonb,
    updated_at = now()
WHERE trigger = 'invoice.created';