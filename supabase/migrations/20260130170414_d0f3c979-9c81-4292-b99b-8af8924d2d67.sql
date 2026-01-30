-- Email template for global group course changes (date/time/instructor/meeting point)
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Änderung - Alle Teilnehmer',
  'customer.group_course.changed',
  'Änderung: {{course_name}} am {{old_date}}',
  '<h2>Hallo {{customer_name}}!</h2>
<p>Der Gruppenkurs <strong>{{course_name}}</strong> wurde geändert:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>❌ Bisheriger Termin: {{old_date}}, {{old_time}}</p>
  <p>✅ Neuer Termin: {{new_date}}, {{new_time}}</p>
  <p>👤 Lehrer: {{instructor_name}}</p>
  <p>📍 Treffpunkt: {{meeting_point}}</p>
</div>
<p>Diese Änderung betrifft alle Teilnehmer des Kurses.</p>
<p>Wir freuen uns auf Sie!</p>',
  'Hallo {{customer_name}}! Der Gruppenkurs {{course_name}} wurde geändert. Bisheriger Termin: {{old_date}}, {{old_time}}. Neuer Termin: {{new_date}}, {{new_time}}. Lehrer: {{instructor_name}}.',
  '["customer_name", "course_name", "old_date", "old_time", "new_date", "new_time", "instructor_name", "meeting_point"]'::jsonb,
  true
);

-- Email template for group course cancellation
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Abgesagt - Alle Teilnehmer',
  'customer.group_course.cancelled',
  'Absage: {{course_name}} am {{course_date}}',
  '<h2>Hallo {{customer_name}}!</h2>
<p>Wir müssen Ihnen leider mitteilen, dass der folgende Gruppenkurs abgesagt wurde:</p>
<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}, {{course_time}}</p>
  <p>👤 Teilnehmer: {{participant_name}}</p>
</div>
<p><strong>Grund:</strong> {{cancellation_reason}}</p>
<p>Wir werden Sie bezüglich einer Gutschrift oder Rückerstattung kontaktieren.</p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>',
  'Hallo {{customer_name}}! Der Gruppenkurs {{course_name}} am {{course_date}} wurde leider abgesagt. Grund: {{cancellation_reason}}. Wir kontaktieren Sie bezüglich Gutschrift/Rückerstattung.',
  '["customer_name", "participant_name", "course_name", "course_date", "course_time", "cancellation_reason"]'::jsonb,
  true
);

-- Email template for individual unenrollment confirmation
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Abmeldung - Bestätigung',
  'customer.group_course.unenrolled',
  'Abmeldung bestätigt: {{course_name}}',
  '<h2>Hallo {{customer_name}}!</h2>
<p>Die Abmeldung von <strong>{{participant_name}}</strong> wurde bestätigt:</p>
<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}, {{course_time}}</p>
  <p>👤 Teilnehmer: {{participant_name}}</p>
</div>
<p>Falls Sie Fragen haben, kontaktieren Sie uns gerne.</p>',
  'Hallo {{customer_name}}! Die Abmeldung von {{participant_name}} vom Gruppenkurs {{course_name}} am {{course_date}} wurde bestätigt.',
  '["customer_name", "participant_name", "course_name", "course_date", "course_time"]'::jsonb,
  true
);

-- Email template for new enrollment confirmation
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Anmeldung - Bestätigung',
  'customer.group_course.enrolled',
  'Anmeldung bestätigt: {{course_name}}',
  '<h2>Hallo {{customer_name}}!</h2>
<p>Die Anmeldung von <strong>{{participant_name}}</strong> wurde bestätigt:</p>
<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}, {{course_time}}</p>
  <p>👤 Teilnehmer: {{participant_name}}</p>
  <p>👤 Lehrer: {{instructor_name}}</p>
  <p>📍 Treffpunkt: {{meeting_point}}</p>
</div>
<p>Wir freuen uns auf Sie!</p>',
  'Hallo {{customer_name}}! Die Anmeldung von {{participant_name}} zum Gruppenkurs {{course_name}} am {{course_date}} wurde bestätigt. Treffpunkt: {{meeting_point}}.',
  '["customer_name", "participant_name", "course_name", "course_date", "course_time", "instructor_name", "meeting_point"]'::jsonb,
  true
);

-- Email template for instructor: participant count changed
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Teilnehmerzahl geändert - Lehrer',
  'instructor.group_course.enrollment_changed',
  'Teilnehmerzahl geändert: {{course_name}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Die Teilnehmerzahl für deinen Gruppenkurs hat sich geändert:</p>
<div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}, {{course_time}}</p>
  <p>👥 Teilnehmer: {{participant_count}}/{{max_participants}}</p>
  <p>{{change_type}}: {{participant_name}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Details im Portal ansehen</a></p>',
  'Hallo {{instructor_name}}! Teilnehmerzahl für {{course_name}} am {{course_date}} geändert: {{participant_count}}/{{max_participants}}. {{change_type}}: {{participant_name}}.',
  '["instructor_name", "course_name", "course_date", "course_time", "participant_count", "max_participants", "change_type", "participant_name", "portal_url"]'::jsonb,
  true
);

-- Email template for instructor: group course instance changed
INSERT INTO email_templates (name, trigger, subject, body_html, body_text, variables, is_active)
VALUES (
  'Gruppenkurs Änderung - Lehrer',
  'instructor.group_course.changed',
  'Dein Gruppenkurs wurde geändert: {{course_name}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Dein Gruppenkurs wurde geändert:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>❌ Bisheriger Termin: {{old_date}}, {{old_time}}</p>
  <p>✅ Neuer Termin: {{new_date}}, {{new_time}}</p>
  <p>📍 Treffpunkt: {{meeting_point}}</p>
  <p>👥 Teilnehmer: {{participant_count}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Details im Portal ansehen</a></p>',
  'Hallo {{instructor_name}}! Dein Gruppenkurs {{course_name}} wurde geändert. Bisheriger Termin: {{old_date}}, {{old_time}}. Neuer Termin: {{new_date}}, {{new_time}}.',
  '["instructor_name", "course_name", "old_date", "old_time", "new_date", "new_time", "meeting_point", "participant_count", "portal_url"]'::jsonb,
  true
);