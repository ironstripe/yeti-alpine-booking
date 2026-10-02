-- Rollback B+ Phase 2 (Swiss QR invoice e-mail + payment provider).
--
-- Order matters:
--   1. redeploy the previous `confirm-booking` and `retry-booking-confirmation`,
--      then remove `create-payment-session` and `webhook-payment`,
--   2. run this script (invoice deliveries first, then the kind constraint),
--   3. restore STRIPE_* secrets only if they should stay disabled.

-- 1) Drop invoice deliveries (must happen before the constraint narrows again).
DELETE FROM public.booking_email_deliveries WHERE kind = 'invoice';

ALTER TABLE public.booking_email_deliveries
  DROP CONSTRAINT IF EXISTS booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries
  ADD CONSTRAINT booking_email_deliveries_kind_check
  CHECK (kind IN ('booking_confirmation'));

-- 2) Provider tables (payment_events first: it references payment_sessions).
DROP TABLE IF EXISTS public.payment_events;
DROP TABLE IF EXISTS public.payment_sessions;

-- 3) Restore the invoice template without the QR payment part.
UPDATE public.email_templates
SET subject = 'Rechnung {{invoice.number}} - {{school.name}}',
    body_html = '<p>Guten Tag {{customer.first_name}} {{customer.last_name}}</p><p>Anbei erhalten Sie die Rechnung für Ihre Buchung.</p><p><strong>Rechnungsnummer:</strong> {{invoice.number}}<br><strong>Betrag:</strong> CHF {{invoice.total}}<br><strong>Zahlbar bis:</strong> {{invoice.due_date}}</p><p>Bitte verwenden Sie den beigefügten QR-Code für die einfache Zahlung mit Ihrer Banking-App.</p><p>Freundliche Grüsse<br>{{school.name}}</p>',
    variables = '["customer.first_name", "customer.last_name", "invoice.number", "invoice.total", "invoice.due_date", "school.name"]'::jsonb,
    attachments = '{"invoice_pdf": true}'::jsonb,
    updated_at = now()
WHERE trigger = 'invoice.created';