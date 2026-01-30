-- Add customer notification email templates for booking changes

-- Template 1: Booking date/time changed notification
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active) VALUES
(
  'Buchungsänderung - Privatstunde',
  'customer.booking.changed',
  'Änderung Ihrer Buchung: {{product_name}}',
  '<h1>Hallo {{customer_name}}!</h1>
<p>Ihre Buchung wurde geändert:</p>
<table style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">Kurs:</td>
    <td style="padding: 8px 0;"><strong>{{product_name}}</strong></td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">❌ Bisheriger Termin:</td>
    <td style="padding: 8px 0;">{{old_date}}, {{old_time}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">✅ Neuer Termin:</td>
    <td style="padding: 8px 0;"><strong>{{new_date}}, {{new_time}}</strong></td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">👤 Lehrer:</td>
    <td style="padding: 8px 0;">{{instructor_name}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">📍 Treffpunkt:</td>
    <td style="padding: 8px 0;">{{meeting_point}}</td>
  </tr>
</table>
<p>Falls Sie Fragen haben, kontaktieren Sie uns gerne.</p>
<p>Wir freuen uns auf Sie!</p>',
  'Hallo {{customer_name}}! Ihre Buchung wurde geändert: {{product_name}}. Bisheriger Termin: {{old_date}}, {{old_time}}. Neuer Termin: {{new_date}}, {{new_time}}. Lehrer: {{instructor_name}}. Treffpunkt: {{meeting_point}}.',
  '["customer_name", "product_name", "old_date", "old_time", "new_date", "new_time", "instructor_name", "meeting_point"]'::jsonb,
  true
);

-- Template 2: Instructor changed notification
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active) VALUES
(
  'Lehrerwechsel - Privatstunde',
  'customer.instructor.changed',
  'Lehrerwechsel für Ihre Buchung: {{product_name}}',
  '<h1>Hallo {{customer_name}}!</h1>
<p>Für Ihre Buchung gibt es einen Lehrerwechsel:</p>
<table style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">Kurs:</td>
    <td style="padding: 8px 0;"><strong>{{product_name}}</strong></td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">📅 Datum:</td>
    <td style="padding: 8px 0;">{{booking_date}}, {{booking_time}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">❌ Bisheriger Lehrer:</td>
    <td style="padding: 8px 0;">{{old_instructor_name}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">✅ Neuer Lehrer:</td>
    <td style="padding: 8px 0;"><strong>{{new_instructor_name}}</strong></td>
  </tr>
  <tr>
    <td style="padding: 8px 16px 8px 0; color: #666;">📍 Treffpunkt:</td>
    <td style="padding: 8px 0;">{{meeting_point}}</td>
  </tr>
</table>
<p>Alle anderen Details bleiben unverändert.</p>
<p>Wir freuen uns auf Sie!</p>',
  'Hallo {{customer_name}}! Lehrerwechsel für Ihre Buchung: {{product_name}} am {{booking_date}}, {{booking_time}}. Bisheriger Lehrer: {{old_instructor_name}}. Neuer Lehrer: {{new_instructor_name}}. Treffpunkt: {{meeting_point}}.',
  '["customer_name", "product_name", "booking_date", "booking_time", "old_instructor_name", "new_instructor_name", "meeting_point"]'::jsonb,
  true
);