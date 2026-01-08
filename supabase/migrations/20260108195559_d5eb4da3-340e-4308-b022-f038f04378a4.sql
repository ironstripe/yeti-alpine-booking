-- Create invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Amounts
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  
  -- QR Reference (27 digits)
  qr_reference TEXT NOT NULL,
  
  -- Dates
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  -- PDF storage
  pdf_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices (admin/office can manage)
CREATE POLICY "Admin and office can view all invoices"
  ON public.invoices FOR SELECT
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can insert invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can update invoices"
  ON public.invoices FOR UPDATE
  USING (public.is_admin_or_office(auth.uid()));

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'R-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number LIKE 'R-' || year_str || '-%';
  
  NEW.invoice_number := 'R-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-generating invoice number
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION public.generate_invoice_number();

-- Add new email templates for invoices
INSERT INTO public.email_templates (name, trigger, subject, body_html, body_text, is_active, variables, attachments)
VALUES 
  ('Rechnung', 'invoice.created', 
   'Rechnung {{invoice.number}} - {{school.name}}',
   '<p>Guten Tag {{customer.first_name}} {{customer.last_name}}</p><p>Anbei erhalten Sie die Rechnung für Ihre Buchung.</p><p><strong>Rechnungsnummer:</strong> {{invoice.number}}<br><strong>Betrag:</strong> CHF {{invoice.total}}<br><strong>Zahlbar bis:</strong> {{invoice.due_date}}</p><p>Bitte verwenden Sie den beigefügten QR-Code für die einfache Zahlung mit Ihrer Banking-App.</p><p>Freundliche Grüsse<br>{{school.name}}</p>',
   NULL, true,
   '["customer.first_name", "customer.last_name", "invoice.number", "invoice.total", "invoice.due_date", "school.name"]',
   '{"invoice_pdf": true}'),
  
  ('Zahlungserinnerung', 'payment.reminder', 
   'Zahlungserinnerung - {{invoice.number}}',
   '<p>Guten Tag {{customer.first_name}} {{customer.last_name}}</p><p>Wir möchten Sie freundlich daran erinnern, dass die folgende Rechnung noch offen ist:</p><p><strong>Rechnungsnummer:</strong> {{invoice.number}}<br><strong>Betrag:</strong> CHF {{invoice.total}}<br><strong>Fällig seit:</strong> {{invoice.due_date}}</p><p>Falls Sie die Zahlung bereits veranlasst haben, betrachten Sie diese E-Mail als gegenstandslos.</p><p>Freundliche Grüsse<br>{{school.name}}</p>',
   NULL, true,
   '["customer.first_name", "customer.last_name", "invoice.number", "invoice.total", "invoice.due_date", "school.name"]',
   '{"invoice_pdf": true}'),
  
  ('Mahnung', 'payment.overdue', 
   'Mahnung - {{invoice.number}}',
   '<p>Guten Tag {{customer.first_name}} {{customer.last_name}}</p><p>Trotz unserer Zahlungserinnerung ist die folgende Rechnung noch nicht beglichen:</p><p><strong>Rechnungsnummer:</strong> {{invoice.number}}<br><strong>Betrag:</strong> CHF {{invoice.total}}<br><strong>Fällig seit:</strong> {{invoice.due_date}}</p><p>Wir bitten Sie, den ausstehenden Betrag innerhalb von 10 Tagen zu begleichen.</p><p>Freundliche Grüsse<br>{{school.name}}</p>',
   NULL, true,
   '["customer.first_name", "customer.last_name", "invoice.number", "invoice.total", "invoice.due_date", "school.name"]',
   '{"invoice_pdf": true}')
ON CONFLICT DO NOTHING;