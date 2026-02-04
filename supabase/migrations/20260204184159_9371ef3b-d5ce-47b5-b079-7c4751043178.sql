-- Add email templates for period booking changes

INSERT INTO email_templates (name, trigger, subject, body_html, body_text, is_active, variables)
VALUES
  (
    'Einzelner Tag geändert (Periode)',
    'private_lesson.single_day_changed',
    'Änderung Ihrer Buchung am {{occurrence_date}}',
    '<p>Guten Tag {{customer_name}},</p>
<p>für Ihre Buchung vom <strong>{{period_start_date}}</strong> bis <strong>{{period_end_date}}</strong> wurde der <strong>{{occurrence_date}}</strong> angepasst:</p>
<ul>
  <li><strong>Neue Uhrzeit:</strong> {{new_time_start}} - {{new_time_end}} Uhr</li>
  <li><strong>Lehrer:</strong> {{instructor_name}}</li>
</ul>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>',
    'Guten Tag {{customer_name}},

für Ihre Buchung vom {{period_start_date}} bis {{period_end_date}} wurde der {{occurrence_date}} angepasst:

Neue Uhrzeit: {{new_time_start}} - {{new_time_end}} Uhr
Lehrer: {{instructor_name}}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.',
    true,
    '["customer_name", "occurrence_date", "period_start_date", "period_end_date", "new_time_start", "new_time_end", "instructor_name"]'::jsonb
  ),
  (
    'Periode geändert (Kunde)',
    'private_lesson.period_changed',
    'Änderung Ihrer Buchung ({{period_start_date}} - {{period_end_date}})',
    '<p>Guten Tag {{customer_name}},</p>
<p>für Ihre gesamte Buchungsperiode vom <strong>{{period_start_date}}</strong> bis <strong>{{period_end_date}}</strong> wurde eine Änderung vorgenommen:</p>
<ul>
  <li><strong>Neue Uhrzeit:</strong> {{new_time_start}} - {{new_time_end}} Uhr</li>
  <li><strong>Lehrer:</strong> {{instructor_name}}</li>
</ul>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>',
    'Guten Tag {{customer_name}},

für Ihre gesamte Buchungsperiode vom {{period_start_date}} bis {{period_end_date}} wurde eine Änderung vorgenommen:

Neue Uhrzeit: {{new_time_start}} - {{new_time_end}} Uhr
Lehrer: {{instructor_name}}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.',
    true,
    '["customer_name", "period_start_date", "period_end_date", "new_time_start", "new_time_end", "instructor_name"]'::jsonb
  );