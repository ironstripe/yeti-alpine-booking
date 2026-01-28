-- =====================================================
-- INSTRUCTOR EMAIL NOTIFICATION SYSTEM
-- =====================================================

-- 1. Create the notification queue table
CREATE TABLE public.instructor_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  ticket_item_id UUID REFERENCES public.ticket_items(id) ON DELETE SET NULL,
  group_instance_id UUID REFERENCES public.group_course_instances(id) ON DELETE SET NULL
);

-- Index for efficient queue processing
CREATE INDEX idx_instructor_notification_queue_pending 
ON public.instructor_notification_queue(status, created_at) 
WHERE status = 'pending';

-- Index for duplicate prevention
CREATE INDEX idx_instructor_notification_queue_dedup 
ON public.instructor_notification_queue(ticket_item_id, notification_type, created_at);

-- Enable RLS
ALTER TABLE public.instructor_notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/office can view for debugging
CREATE POLICY "Admin can view notification queue"
  ON public.instructor_notification_queue
  FOR SELECT
  USING (public.is_admin_or_office(auth.uid()));

-- RLS: Admin can manage notification queue
CREATE POLICY "Admin can manage notification queue"
  ON public.instructor_notification_queue
  FOR ALL
  USING (public.is_admin_or_office(auth.uid()));

-- =====================================================
-- 2. Insert email templates for instructor notifications
-- =====================================================

INSERT INTO public.email_templates (name, trigger, subject, body_html, body_text, variables, is_active) VALUES
(
  'Neue Buchung zugewiesen',
  'instructor.lesson.assigned',
  'Neue Buchung: {{product_name}} am {{booking_date}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Dir wurde eine neue Privatstunde zugewiesen:</p>
<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
  <p>📍 Treffpunkt: {{meeting_point}}</p>
</div>
<p>Bitte bestätige die Buchung im Instructor Portal:</p>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Jetzt bestätigen</a></p>',
  'Hallo {{instructor_name}}! Dir wurde eine neue Privatstunde zugewiesen: {{product_name}} am {{booking_date}}, {{booking_time}}. Treffpunkt: {{meeting_point}}. Bitte bestätige im Portal: {{portal_url}}',
  '["instructor_name", "product_name", "booking_date", "booking_time", "meeting_point", "portal_url"]'::jsonb,
  true
),
(
  'Buchung geändert',
  'instructor.lesson.changed',
  'Buchung geändert: {{product_name}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Eine deiner Buchungen wurde geändert:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>❌ Alt: {{old_date}}, {{old_time}}</p>
  <p>✅ Neu: {{new_date}}, {{new_time}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Details im Portal ansehen</a></p>',
  'Hallo {{instructor_name}}! Eine deiner Buchungen wurde geändert: {{product_name}}. Alt: {{old_date}}, {{old_time}}. Neu: {{new_date}}, {{new_time}}. Details: {{portal_url}}',
  '["instructor_name", "product_name", "old_date", "old_time", "new_date", "new_time", "portal_url"]'::jsonb,
  true
),
(
  'Buchung storniert',
  'instructor.lesson.cancelled',
  'Stornierung: {{product_name}} am {{booking_date}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Folgende Buchung wurde leider storniert:</p>
<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
</div>
<p>Die Stunde ist damit frei und kann anderweitig vergeben werden.</p>',
  'Hallo {{instructor_name}}! Folgende Buchung wurde storniert: {{product_name}} am {{booking_date}}, {{booking_time}}. Die Stunde ist damit frei.',
  '["instructor_name", "product_name", "booking_date", "booking_time"]'::jsonb,
  true
),
(
  'Gruppenkurs zugewiesen',
  'instructor.group.assigned',
  'Zuweisung Gruppenkurs: {{course_name}}',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Du wurdest als Gruppenleiter eingeteilt:</p>
<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}</p>
  <p>🕐 {{course_time}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Im Portal ansehen</a></p>',
  'Hallo {{instructor_name}}! Du wurdest als Gruppenleiter eingeteilt: {{course_name}} am {{course_date}}, {{course_time}}. Details: {{portal_url}}',
  '["instructor_name", "course_name", "course_date", "course_time", "portal_url"]'::jsonb,
  true
),
(
  'Erinnerung Bestätigung',
  'instructor.confirmation.reminder',
  '⏰ Erinnerung: Buchung bestätigen!',
  '<h2>Hallo {{instructor_name}}!</h2>
<p>Du hast noch eine unbestätigte Buchung, die bald startet:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px;">Jetzt bestätigen</a></p>',
  'Hallo {{instructor_name}}! Erinnerung: Du hast noch eine unbestätigte Buchung: {{product_name}} am {{booking_date}}, {{booking_time}}. Bitte bestätige: {{portal_url}}',
  '["instructor_name", "product_name", "booking_date", "booking_time", "portal_url"]'::jsonb,
  true
);

-- =====================================================
-- 3. Trigger function for private lesson notifications
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_ticket_item_instructor_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name TEXT;
BEGIN
  -- Skip if no instructor assigned
  IF NEW.instructor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name 
  FROM public.products 
  WHERE id = NEW.product_id;

  -- Case 1: New Assignment (instructor_id was NULL, now has value)
  IF (TG_OP = 'INSERT' AND NEW.instructor_id IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND OLD.instructor_id IS NULL AND NEW.instructor_id IS NOT NULL) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.assigned',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'meeting_point', COALESCE(NEW.meeting_point, 'Nicht angegeben'),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

  -- Case 2: Booking Cancelled
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'storno' AND NEW.status = 'storno' THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.cancelled',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, '')
      )
    );

  -- Case 3: Booking Details Changed (date or time) - same instructor
  ELSIF TG_OP = 'UPDATE' AND 
        OLD.instructor_id = NEW.instructor_id AND
        (OLD.date IS DISTINCT FROM NEW.date OR OLD.time_start IS DISTINCT FROM NEW.time_start OR OLD.time_end IS DISTINCT FROM NEW.time_end) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.changed',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'old_date', to_char(OLD.date, 'DD.MM.YYYY'),
        'old_time', COALESCE(OLD.time_start::text, '') || ' - ' || COALESCE(OLD.time_end::text, ''),
        'new_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'new_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER ticket_item_instructor_notification_trigger
AFTER INSERT OR UPDATE ON public.ticket_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_ticket_item_instructor_notification();

-- =====================================================
-- 4. Trigger function for group course assignments
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_group_instance_instructor_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_name TEXT;
BEGIN
  -- Get course name once
  SELECT name INTO v_course_name 
  FROM public.group_courses 
  WHERE id = NEW.course_id;

  -- Notify main instructor when newly assigned
  IF NEW.instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.instructor_id IS DISTINCT FROM NEW.instructor_id AND OLD.instructor_id IS NULL)) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', COALESCE(v_course_name, 'Gruppenkurs'),
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', COALESCE(NEW.start_time::text, '') || ' - ' || COALESCE(NEW.end_time::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  -- Notify assistant instructor when newly assigned
  IF NEW.assistant_instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assistant_instructor_id IS DISTINCT FROM NEW.assistant_instructor_id AND OLD.assistant_instructor_id IS NULL)) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.assistant_instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', COALESCE(v_course_name, 'Gruppenkurs') || ' (Hilfskraft)',
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', COALESCE(NEW.start_time::text, '') || ' - ' || COALESCE(NEW.end_time::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER group_instance_instructor_notification_trigger
AFTER INSERT OR UPDATE ON public.group_course_instances
FOR EACH ROW
EXECUTE FUNCTION public.handle_group_instance_instructor_notification();

-- =====================================================
-- 5. Daily reminder function for pending confirmations
-- =====================================================

CREATE OR REPLACE FUNCTION public.queue_confirmation_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_record RECORD;
  v_product_name TEXT;
BEGIN
  FOR v_record IN
    SELECT ti.id, ti.instructor_id, ti.product_id, ti.date, ti.time_start, ti.time_end
    FROM public.ticket_items ti
    WHERE ti.instructor_confirmation = 'pending'
      AND ti.instructor_id IS NOT NULL
      AND ti.status NOT IN ('storno', 'cancelled')
      AND ti.date >= CURRENT_DATE
      AND ti.date <= CURRENT_DATE + INTERVAL '1 day'
      -- Avoid duplicate reminders within 20 hours
      AND NOT EXISTS (
        SELECT 1 FROM public.instructor_notification_queue nq
        WHERE nq.ticket_item_id = ti.id
          AND nq.notification_type = 'instructor.confirmation.reminder'
          AND nq.created_at > NOW() - INTERVAL '20 hours'
      )
  LOOP
    SELECT name INTO v_product_name 
    FROM public.products 
    WHERE id = v_record.product_id;

    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      v_record.instructor_id,
      'instructor.confirmation.reminder',
      v_record.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(v_record.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(v_record.time_start::text, '') || ' - ' || COALESCE(v_record.time_end::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;