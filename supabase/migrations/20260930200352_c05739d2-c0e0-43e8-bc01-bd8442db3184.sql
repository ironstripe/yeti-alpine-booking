CREATE TABLE public.booking_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('booking_confirmation')),
  idempotency_key text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error text,
  template_id uuid,
  email_log_id uuid REFERENCES public.email_logs(id) ON DELETE SET NULL,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, kind)
);
GRANT SELECT ON public.booking_email_deliveries TO authenticated;
GRANT ALL ON public.booking_email_deliveries TO service_role;
ALTER TABLE public.booking_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office and admin can view booking email deliveries"
  ON public.booking_email_deliveries FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()));
CREATE TRIGGER update_booking_email_deliveries_updated_at
  BEFORE UPDATE ON public.booking_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS delivery_id uuid;