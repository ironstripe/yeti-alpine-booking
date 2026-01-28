

# Email Notification System for Instructor Portal

## Overview

This plan implements a robust email notification system for instructors, replacing WhatsApp as the notification channel for MVP. The system will use the **existing `send-notification` Edge Function** with Resend integration, rather than database triggers, for reliability and maintainability.

**Key Design Decision:** Instead of using database triggers with the `resend` extension (which requires complex Vault setup and direct database email sending), we'll leverage the existing Edge Function infrastructure. Database triggers will call `pg_net` to invoke the Edge Function, keeping email logic centralized and consistent with the existing customer notification system.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       INSTRUCTOR NOTIFICATION FLOW                       │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     Database Trigger     ┌──────────────────────┐
  │  ticket_items    │  ───────────────────────▶│ handle_instructor_   │
  │  INSERT/UPDATE   │                          │ notification_trigger │
  └──────────────────┘                          └──────────┬───────────┘
                                                           │
  ┌──────────────────┐     Database Trigger                │
  │ group_course_    │  ───────────────────────▶ (same)    │
  │ instances UPDATE │                                     │
  └──────────────────┘                                     │
                                                           ▼
                                               ┌──────────────────────┐
                                               │ INSERT INTO          │
                                               │ instructor_email_    │
                                               │ notifications queue  │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │ send-instructor-     │
                                               │ notification         │
                                               │ Edge Function         │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │ Resend API           │
                                               │ (email delivery)     │
                                               └──────────────────────┘

  ┌──────────────────┐     pg_cron (8:00 UTC)
  │ Daily Reminder   │  ─────────────────────▶ send_confirmation_reminders()
  │ Job              │                         → queues pending notifications
  └──────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| Database Migration | New email templates, queue table, triggers, cron job |
| `supabase/functions/send-instructor-notification/index.ts` | Dedicated Edge Function for instructor emails |

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/notification-service.ts` | Add instructor notification types |

---

## Database Changes

### 1. New Email Templates

Add templates specifically for instructor notifications:

| Trigger | Name | Subject Pattern |
|---------|------|-----------------|
| `instructor.lesson.assigned` | Neue Buchung zugewiesen | Neue Buchung: {{product_name}} am {{booking_date}} |
| `instructor.lesson.changed` | Buchung geändert | Buchung geändert: {{product_name}} |
| `instructor.lesson.cancelled` | Buchung storniert | Stornierung: {{product_name}} am {{booking_date}} |
| `instructor.group.assigned` | Gruppenkurs zugewiesen | Zuweisung Gruppenkurs: {{course_name}} |
| `instructor.confirmation.reminder` | Erinnerung Bestätigung | Erinnerung: Buchung bestätigen! |

### 2. Notification Queue Table

Create a dedicated queue table for reliable async processing:

```sql
CREATE TABLE public.instructor_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id),
  notification_type TEXT NOT NULL,
  template_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  ticket_item_id UUID REFERENCES public.ticket_items(id),
  group_instance_id UUID REFERENCES public.group_course_instances(id)
);

-- Index for efficient queue processing
CREATE INDEX idx_instructor_notification_queue_pending 
ON instructor_notification_queue(status, created_at) 
WHERE status = 'pending';
```

### 3. Database Trigger Function for Private Lessons

```sql
CREATE OR REPLACE FUNCTION public.handle_ticket_item_instructor_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_name TEXT;
  v_notification_type TEXT;
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
        'product_name', v_product_name,
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', NEW.time_start::text || ' - ' || NEW.time_end::text,
        'meeting_point', COALESCE(NEW.meeting_point, 'Nicht angegeben'),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

  -- Case 2: Booking Cancelled
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'storno' AND NEW.status = 'storno' THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.cancelled',
      NEW.id,
      jsonb_build_object(
        'product_name', v_product_name,
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', NEW.time_start::text || ' - ' || NEW.time_end::text
      )
    );

  -- Case 3: Booking Details Changed (date or time)
  ELSIF TG_OP = 'UPDATE' AND 
        (OLD.date <> NEW.date OR OLD.time_start <> NEW.time_start OR OLD.time_end <> NEW.time_end) AND
        OLD.instructor_id = NEW.instructor_id THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.changed',
      NEW.id,
      jsonb_build_object(
        'product_name', v_product_name,
        'old_date', to_char(OLD.date, 'DD.MM.YYYY'),
        'old_time', OLD.time_start::text || ' - ' || OLD.time_end::text,
        'new_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'new_time', NEW.time_start::text || ' - ' || NEW.time_end::text,
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_item_instructor_notification_trigger
AFTER INSERT OR UPDATE ON public.ticket_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_ticket_item_instructor_notification();
```

### 4. Database Trigger for Group Course Assignments

```sql
CREATE OR REPLACE FUNCTION public.handle_group_instance_instructor_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_course_name TEXT;
BEGIN
  -- Only trigger when instructor_id is newly set
  IF NEW.instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.instructor_id IS NULL)) THEN
    
    SELECT name INTO v_course_name 
    FROM public.group_courses 
    WHERE id = NEW.course_id;

    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', v_course_name,
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', NEW.start_time::text || ' - ' || NEW.end_time::text,
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  -- Also notify assistant instructor
  IF NEW.assistant_instructor_id IS NOT NULL AND 
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assistant_instructor_id IS NULL)) THEN
    
    IF v_course_name IS NULL THEN
      SELECT name INTO v_course_name 
      FROM public.group_courses 
      WHERE id = NEW.course_id;
    END IF;

    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, group_instance_id, template_data
    ) VALUES (
      NEW.assistant_instructor_id,
      'instructor.group.assigned',
      NEW.id,
      jsonb_build_object(
        'course_name', v_course_name || ' (Hilfskraft)',
        'course_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'course_time', NEW.start_time::text || ' - ' || NEW.end_time::text,
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER group_instance_instructor_notification_trigger
AFTER INSERT OR UPDATE ON public.group_course_instances
FOR EACH ROW
EXECUTE FUNCTION public.handle_group_instance_instructor_notification();
```

### 5. Daily Reminder Function (pg_cron)

```sql
CREATE OR REPLACE FUNCTION public.queue_confirmation_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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
        'product_name', v_product_name,
        'booking_date', to_char(v_record.date, 'DD.MM.YYYY'),
        'booking_time', v_record.time_start::text || ' - ' || v_record.time_end::text,
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Schedule the cron job (8:00 AM CET = 7:00 AM UTC in winter, 6:00 AM UTC in summer)
-- Using 7:00 AM UTC as a reasonable compromise
SELECT cron.schedule(
  'daily-instructor-confirmation-reminders',
  '0 7 * * *',
  'SELECT public.queue_confirmation_reminders()'
);
```

---

## Edge Function: send-instructor-notification

A dedicated Edge Function to process the notification queue:

```typescript
// supabase/functions/send-instructor-notification/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BATCH_SIZE = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmailWithResend(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Schneesportschule Malbun <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Failed to send email");
  }
  return result.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch pending notifications
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("instructor_notification_queue")
      .select(`
        id,
        instructor_id,
        notification_type,
        template_data,
        instructors!inner (email, first_name, last_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!pendingNotifications?.length) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending notifications" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get email templates
    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .eq("is_active", true);

    const templateMap = new Map(templates?.map(t => [t.trigger, t]) || []);

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        const template = templateMap.get(notification.notification_type);
        if (!template) {
          throw new Error(`No template for ${notification.notification_type}`);
        }

        const instructor = notification.instructors;
        const data = {
          ...notification.template_data,
          instructor_name: `${instructor.first_name} ${instructor.last_name}`,
        };

        // Replace template variables
        let subject = template.subject;
        let body = template.body_html;
        for (const [key, value] of Object.entries(data)) {
          const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
          subject = subject.replace(regex, String(value ?? ""));
          body = body.replace(regex, String(value ?? ""));
        }

        // Wrap in email layout
        const fullHtml = `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px; border-bottom: 2px solid #1e3a5f;">
                <h2>⛷️ Schneesportschule Malbun</h2>
              </div>
              ${body}
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
                <p>Schneesportschule Malbun</p>
              </div>
            </body>
          </html>
        `;

        await sendEmailWithResend(instructor.email, subject, fullHtml);

        // Mark as sent
        await supabase
          .from("instructor_notification_queue")
          .update({ status: "sent", processed_at: new Date().toISOString() })
          .eq("id", notification.id);

        processed++;
      } catch (err) {
        // Mark as failed
        await supabase
          .from("instructor_notification_queue")
          .update({ 
            status: "failed", 
            processed_at: new Date().toISOString(),
            error_message: err.message 
          })
          .eq("id", notification.id);

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## Email Template Content

### instructor.lesson.assigned

**Subject:** Neue Buchung: {{product_name}} am {{booking_date}}

**Body:**
```html
<h2>Hallo {{instructor_name}}!</h2>
<p>Dir wurde eine neue Privatstunde zugewiesen:</p>
<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
  <p>📍 Treffpunkt: {{meeting_point}}</p>
</div>
<p>Bitte bestätige die Buchung im Instructor Portal:</p>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px;">Jetzt bestätigen</a></p>
```

### instructor.lesson.changed

**Subject:** Buchung geändert: {{product_name}}

**Body:**
```html
<h2>Hallo {{instructor_name}}!</h2>
<p>Eine deiner Buchungen wurde geändert:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>❌ Alt: {{old_date}}, {{old_time}}</p>
  <p>✅ Neu: {{new_date}}, {{new_time}}</p>
</div>
<p><a href="{{portal_url}}">Details im Portal ansehen</a></p>
```

### instructor.lesson.cancelled

**Subject:** Stornierung: {{product_name}} am {{booking_date}}

**Body:**
```html
<h2>Hallo {{instructor_name}}!</h2>
<p>Folgende Buchung wurde leider storniert:</p>
<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
</div>
<p>Die Stunde ist damit frei und kann anderweitig vergeben werden.</p>
```

### instructor.group.assigned

**Subject:** Zuweisung Gruppenkurs: {{course_name}}

**Body:**
```html
<h2>Hallo {{instructor_name}}!</h2>
<p>Du wurdest als Gruppenleiter eingeteilt:</p>
<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p><strong>{{course_name}}</strong></p>
  <p>📅 {{course_date}}</p>
  <p>🕐 {{course_time}}</p>
</div>
<p><a href="{{portal_url}}">Im Portal ansehen</a></p>
```

### instructor.confirmation.reminder

**Subject:** ⏰ Erinnerung: Buchung bestätigen!

**Body:**
```html
<h2>Hallo {{instructor_name}}!</h2>
<p>Du hast noch eine unbestätigte Buchung, die bald startet:</p>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
  <p><strong>{{product_name}}</strong></p>
  <p>📅 {{booking_date}}</p>
  <p>🕐 {{booking_time}}</p>
</div>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px;">Jetzt bestätigen</a></p>
```

---

## Processing the Queue

The queue can be processed in two ways:

### Option A: Cron Job (Recommended for MVP)
Schedule another cron job to process the queue every 5 minutes:

```sql
SELECT cron.schedule(
  'process-instructor-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pgrlrsrjwyixndmrzhct.supabase.co/functions/v1/send-instructor-notification',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBncmxyc3Jqd3lpeG5kbXJ6aGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NjkzNzksImV4cCI6MjA4MjM0NTM3OX0.k3IFKQA9yWV-0TOIl_L5o5G-z9OEmRHXEx3Uq_pbEh8"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Option B: Webhook Trigger (More Real-time)
Use `pg_net` to call the Edge Function immediately when a notification is queued.

---

## RLS Policies for Queue Table

```sql
ALTER TABLE public.instructor_notification_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access (Edge Functions)
CREATE POLICY "Service role can manage queue"
  ON public.instructor_notification_queue
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin/office can view for debugging
CREATE POLICY "Admin can view notification queue"
  ON public.instructor_notification_queue
  FOR SELECT
  USING (public.is_admin_or_office(auth.uid()));
```

---

## Testing Checklist

1. **New Private Lesson Assignment**
   - Assign instructor to a `ticket_item` with `instructor_id = NULL`
   - Verify row appears in `instructor_notification_queue` with type `instructor.lesson.assigned`
   - Run Edge Function → verify email delivered

2. **Booking Cancellation**
   - Update `ticket_item.status` to `'storno'`
   - Verify queue entry with type `instructor.lesson.cancelled`

3. **Booking Time Changed**
   - Update `ticket_item.time_start` or `date`
   - Verify queue entry with type `instructor.lesson.changed`

4. **Group Course Assignment**
   - Assign instructor to `group_course_instances`
   - Verify queue entry with type `instructor.group.assigned`

5. **Daily Reminder**
   - Create pending booking for tomorrow
   - Run `SELECT queue_confirmation_reminders()`
   - Verify queue entry with type `instructor.confirmation.reminder`

6. **Cron Job Verification**
   - Check `SELECT * FROM cron.job;`
   - Verify both jobs are scheduled

7. **Duplicate Prevention**
   - Run reminder function twice
   - Verify no duplicate entries within 20 hours

---

## Dependencies & Prerequisites

- **pg_cron extension**: Must be enabled in Supabase dashboard
- **pg_net extension**: Already available for HTTP calls
- **RESEND_API_KEY**: Already configured as a secret
- **Email templates**: Must be inserted into `email_templates` table

