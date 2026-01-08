-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  reference_type TEXT,
  reference_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Admin/office can insert notifications for any user
CREATE POLICY "Admin can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (is_admin_or_office(auth.uid()));

-- Create email_templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on email_templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Admin/office can manage email templates
CREATE POLICY "Admin can manage email templates"
ON public.email_templates FOR ALL
USING (is_admin_or_office(auth.uid()));

-- Create email_logs table for tracking sent emails
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  opened_at TIMESTAMP WITH TIME ZONE,
  open_count INTEGER DEFAULT 0,
  clicked_at TIMESTAMP WITH TIME ZONE,
  click_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Admin/office can view email logs
CREATE POLICY "Admin can view email logs"
ON public.email_logs FOR SELECT
USING (is_admin_or_office(auth.uid()));

-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferences JSONB DEFAULT '{}',
  email_frequency TEXT DEFAULT 'immediate',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage own preferences"
ON public.notification_preferences FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_email_logs_created ON public.email_logs(created_at DESC);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Insert default email templates
INSERT INTO public.email_templates (name, trigger, subject, body_html, body_text, variables) VALUES
(
  'Buchungsanfrage erhalten',
  'booking.request.received',
  'Ihre Buchungsanfrage {{request_number}} wurde erhalten',
  '<h1>Vielen Dank für Ihre Anfrage!</h1><p>Guten Tag {{customer_name}},</p><p>wir haben Ihre Buchungsanfrage erhalten und werden diese schnellstmöglich bearbeiten.</p><p><strong>Anfrage-Nr:</strong> {{request_number}}<br><strong>Datum:</strong> {{requested_date}}<br><strong>Produkt:</strong> {{product_name}}</p><p>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p><p>Mit freundlichen Grüssen,<br>Ihr Team der Schneesportschule Malbun</p>',
  'Vielen Dank für Ihre Anfrage! Anfrage-Nr: {{request_number}}. Wir melden uns innerhalb von 24 Stunden.',
  '["customer_name", "request_number", "requested_date", "product_name"]'
),
(
  'Buchungsbestätigung',
  'booking.confirmed',
  'Buchungsbestätigung - {{ticket_number}}',
  '<h1>Ihre Buchung ist bestätigt!</h1><p>Guten Tag {{customer_salutation}} {{customer_last_name}},</p><p>wir freuen uns, Ihre Buchung zu bestätigen.</p><h2>Buchungsdetails</h2><p><strong>Ticket-Nr:</strong> {{ticket_number}}<br><strong>Datum:</strong> {{booking_date}}<br><strong>Zeit:</strong> {{booking_time}}<br><strong>Produkt:</strong> {{product_name}}</p><p><strong>Treffpunkt:</strong> {{meeting_point}}<br>Bitte seien Sie 10 Minuten vor Beginn da.</p><p>Mit freundlichen Grüssen,<br>Ihr Team der Schneesportschule Malbun</p>',
  'Ihre Buchung {{ticket_number}} ist bestätigt! Datum: {{booking_date}}, Zeit: {{booking_time}}.',
  '["customer_salutation", "customer_last_name", "ticket_number", "booking_date", "booking_time", "product_name", "meeting_point"]'
),
(
  'Buchungserinnerung',
  'booking.reminder.1day',
  'Erinnerung: Morgen Ihr Skikurs!',
  '<h1>Erinnerung an Ihre Buchung</h1><p>Guten Tag {{customer_name}},</p><p>wir möchten Sie an Ihre morgige Buchung erinnern:</p><p><strong>Datum:</strong> {{booking_date}}<br><strong>Zeit:</strong> {{booking_time}}<br><strong>Treffpunkt:</strong> {{meeting_point}}</p><p>Wir freuen uns auf Sie!</p><p>Mit freundlichen Grüssen,<br>Ihr Team der Schneesportschule Malbun</p>',
  'Erinnerung: Morgen {{booking_date}} um {{booking_time}} - Treffpunkt: {{meeting_point}}',
  '["customer_name", "booking_date", "booking_time", "meeting_point"]'
),
(
  'Zahlungsbestätigung',
  'payment.received',
  'Zahlungsbestätigung - {{ticket_number}}',
  '<h1>Zahlung erhalten</h1><p>Guten Tag {{customer_name}},</p><p>vielen Dank! Wir haben Ihre Zahlung erhalten.</p><p><strong>Ticket-Nr:</strong> {{ticket_number}}<br><strong>Betrag:</strong> CHF {{amount}}<br><strong>Zahlungsart:</strong> {{payment_method}}</p><p>Mit freundlichen Grüssen,<br>Ihr Team der Schneesportschule Malbun</p>',
  'Zahlung erhalten: CHF {{amount}} für Buchung {{ticket_number}}.',
  '["customer_name", "ticket_number", "amount", "payment_method"]'
),
(
  'Abwesenheit genehmigt',
  'instructor.absence.approved',
  'Ihre Abwesenheit wurde genehmigt',
  '<h1>Abwesenheit genehmigt</h1><p>Guten Tag {{instructor_name}},</p><p>Ihre Abwesenheitsanfrage wurde genehmigt.</p><p><strong>Zeitraum:</strong> {{start_date}} - {{end_date}}<br><strong>Typ:</strong> {{absence_type}}</p><p>Mit freundlichen Grüssen,<br>Schneesportschule Malbun</p>',
  'Ihre Abwesenheit vom {{start_date}} bis {{end_date}} wurde genehmigt.',
  '["instructor_name", "start_date", "end_date", "absence_type"]'
);