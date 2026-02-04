

# Phase 5: Period Booking Email Templates and Notification Logic

## Overview

Implement automated email notifications for period booking changes. The system must notify customers of changes and affected instructors when assignments change.

## Current State Analysis

The `usePeriodModification` hook already has:
- `sendCustomerNotification()` - **but it passes `ticketItemId` instead of `recipientEmail`**
- `queueInstructorNotifications()` - uses the existing queue system (working correctly)

The existing `useSendBookingChangeNotification` hook shows the correct pattern for fetching customer data and invoking the edge function.

---

## Changes Required

### 1. Database Migration: Create Email Templates

**File**: `supabase/migrations/YYYYMMDD_add_period_change_email_templates.sql`

Add three new templates to `email_templates` table:

| Trigger | Name | Purpose |
|---------|------|---------|
| `private_lesson.single_day_changed` | Einzelner Tag geändert (Kunde) | Customer notification for single-day override |
| `private_lesson.period_changed` | Periode geändert (Kunde) | Customer notification for entire period change |
| `instructor.period_assignment_changed` | Zuweisung geändert (Lehrer) | Instructor assignment change notification |

**Template Content (German):**

```sql
INSERT INTO email_templates (name, trigger, subject, body_html, is_active)
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
    true
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
    true
  ),
  (
    'Perioden-Zuweisung geändert (Lehrer)',
    'instructor.period_assignment_changed',
    '{{action_text}}: Privatstunde am {{booking_date}}',
    '<p>Hallo {{instructor_name}},</p>
    <p>{{action_description}}</p>
    <ul>
      <li><strong>Datum:</strong> {{booking_date}}</li>
      <li><strong>Uhrzeit:</strong> {{time_start}} - {{time_end}} Uhr</li>
      <li><strong>Kunde:</strong> {{customer_name}}</li>
    </ul>
    {{#if is_assigned}}<p><a href="{{portal_url}}" class="button">Buchung bestätigen</a></p>{{/if}}',
    true
  );
```

---

### 2. Update `usePeriodModification.ts`

**File**: `src/hooks/usePeriodModification.ts`

Replace the current `sendCustomerNotification` helper with proper data fetching:

```typescript
async function sendCustomerNotification(params: PeriodModificationParams) {
  try {
    // 1. Fetch ticket item with related customer and instructor data
    const { data: ticketItem, error } = await supabase
      .from("ticket_items")
      .select(`
        id,
        date,
        time_start,
        time_end,
        instructor:instructors(id, first_name, last_name),
        ticket:tickets(
          customer:customers(first_name, last_name, email)
        )
      `)
      .eq("id", params.ticketItemId)
      .single();

    if (error || !ticketItem?.ticket?.customer?.email) {
      console.warn("No customer email found for notification");
      return;
    }

    const customer = ticketItem.ticket.customer;
    const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    // 2. Get new instructor name if changed
    let instructorName = "Nicht zugewiesen";
    if (params.newInstructorId) {
      const { data: newInstructor } = await supabase
        .from("instructors")
        .select("first_name, last_name")
        .eq("id", params.newInstructorId)
        .single();
      if (newInstructor) {
        instructorName = `${newInstructor.first_name} ${newInstructor.last_name}`;
      }
    } else if (ticketItem.instructor) {
      instructorName = `${ticketItem.instructor.first_name} ${ticketItem.instructor.last_name}`;
    }

    // 3. Format dates for German locale
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return "";
      return new Date(dateStr).toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric"
      });
    };

    const formatTime = (time?: string) => time?.slice(0, 5) || "";

    // 4. Determine template and build data
    const templateTrigger = params.scope === "single_day"
      ? "private_lesson.single_day_changed"
      : "private_lesson.period_changed";

    const templateData = {
      customer_name: customerName,
      occurrence_date: formatDate(params.occurrenceDate),
      period_start_date: formatDate(params.periodStartDate),
      period_end_date: formatDate(params.periodEndDate),
      new_time_start: formatTime(params.newTimeStart),
      new_time_end: formatTime(params.newTimeEnd),
      instructor_name: instructorName,
    };

    // 5. Invoke edge function with correct parameters
    await supabase.functions.invoke("send-notification", {
      body: {
        type: templateTrigger,
        recipientEmail: customer.email,
        recipientName: customerName,
        data: templateData,
      },
    });

  } catch (error) {
    console.error("Failed to send customer notification:", error);
    toast.warning("Änderung gespeichert, aber Benachrichtigung fehlgeschlagen");
  }
}
```

---

### 3. Update Instructor Notification Queue Types

The `queueInstructorNotifications` function already uses `instructor_notification_queue`. Verify the existing `send-instructor-notification` edge function handles these notification types:
- `cancelled` - Instructor removed from booking
- `assigned` - Instructor assigned to booking

If not already supported, add handling for period-specific context in the instructor notification edge function.

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/YYYYMMDD_add_period_change_email_templates.sql` | Create | Add 3 new email templates |
| `src/hooks/usePeriodModification.ts` | Edit | Fix `sendCustomerNotification` to fetch data and pass correct params |

---

## Template Variables Summary

**Customer Templates:**
- `{{customer_name}}` - Customer full name
- `{{occurrence_date}}` - The specific day changed (single_day only)
- `{{period_start_date}}` - Period start (DD.MM.YYYY)
- `{{period_end_date}}` - Period end (DD.MM.YYYY)
- `{{new_time_start}}` / `{{new_time_end}}` - New times (HH:MM)
- `{{instructor_name}}` - Assigned instructor name

**Instructor Templates (existing queue):**
- Uses existing `instructor.lesson.assigned` and `instructor.lesson.cancelled` templates

---

## Test Scenarios

1. **Single day, time change only** - Customer email with single_day template
2. **Single day, instructor change** - Customer email + instructor queue entries
3. **Entire period, time change** - Customer email with period template
4. **Entire period, instructor change** - Customer email + instructor queue entries
5. **User opts out** - No emails sent, database update still occurs

