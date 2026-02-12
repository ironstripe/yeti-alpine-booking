

# Booking Audit Trail & Internal Comments

## Overview

Add a `ticket_history` table with automated logging triggers, and build a unified "Verlauf & Kommentare" (History & Comments) tab on the booking detail page that merges system events with manual comments in chronological order.

## Task 1: Backend - Database Schema & Triggers

### 1a. Create `ticket_history` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | default `gen_random_uuid()` |
| ticket_id | uuid (FK to tickets) | NOT NULL |
| created_at | timestamptz | default `now()` |
| created_by_user_id | uuid | nullable (NULL for system/trigger events) |
| event_type | text | e.g. BOOKING_CREATED, STATUS_CHANGED, INSTRUCTOR_CHANGED, BOOKING_CANCELLED, PAYMENT_RECORDED, ITEM_ADDED, ITEM_REMOVED |
| details | jsonb | stores old/new values |

RLS: same pattern as `ticket_comments` -- authenticated users can SELECT all, INSERT all, no UPDATE/DELETE needed (system-generated, immutable).

### 1b. Trigger: Log ticket creation

A trigger on `tickets` AFTER INSERT that writes a `BOOKING_CREATED` event with `total_amount` and `ticket_number`.

### 1c. Trigger: Log ticket status changes

A trigger on `tickets` AFTER UPDATE that fires when `status` changes, logging `STATUS_CHANGED` with `{ old_status, new_status }`.

### 1d. Trigger: Log instructor changes on ticket_items

A trigger on `ticket_items` AFTER UPDATE that fires when `instructor_id` changes, logging `INSTRUCTOR_CHANGED` with `{ ticket_item_id, old_instructor_id, new_instructor_id }`.

### 1e. Trigger: Log cancellations

A trigger on `booking_cancellations` AFTER INSERT that logs `BOOKING_CANCELLED` with `{ cancellation_type, cancellation_fee, reason }`.

## Task 2: Frontend - Hook for Unified History

### New file: `src/hooks/useTicketHistory.ts`

- `useTicketHistory(ticketId)` -- fetches from `ticket_history` table ordered by `created_at`
- `useUnifiedTimeline(ticketId)` -- fetches both `ticket_comments` and `ticket_history`, merges into a single chronologically sorted array with a discriminator field (`source: 'comment' | 'event'`)

## Task 3: Frontend - "Verlauf & Kommentare" Component

### New file: `src/components/bookings/TicketTimeline.tsx`

- Renders the unified timeline list
- Visual differentiation: user avatar/initials for comments, system icon (gear/bell) for events
- Each entry shows: who, what, when
- Event type labels in German (e.g. "Buchung erstellt", "Status geandert", "Lehrer geandert", "Stornierung")
- Comment input area at the top with "Kommentar hinzufugen" button using existing `useCreateTicketComment`

## Task 4: Integrate into BookingDetail Page

### Modified file: `src/pages/BookingDetail.tsx`

Replace the existing "Kommunikationsverlauf" (email log) card with a tabbed layout or add a new card section titled "Verlauf & Kommentare" that contains the `TicketTimeline` component. The email log section stays but moves into the same area or remains separate.

The new section will be placed in the main content column (left side, 2/3 width) below the existing booking details card.

## Technical Details

### Trigger functions (SQL)

```text
-- ticket_created trigger
Writes ticket_id, event_type='BOOKING_CREATED', details={ticket_number, total_amount, customer_id}

-- ticket_status_changed trigger  
Fires ON UPDATE OF status on tickets
Writes event_type='STATUS_CHANGED', details={old_status, new_status}

-- ticket_item_instructor_changed trigger
Fires ON UPDATE OF instructor_id on ticket_items
Writes event_type='INSTRUCTOR_CHANGED', details={ticket_item_id, old_instructor_id, new_instructor_id}

-- booking_cancelled trigger
Fires ON INSERT on booking_cancellations
Writes event_type='BOOKING_CANCELLED', details={cancellation_type, fee, reason}
```

### Unified timeline merge logic

Both sources are fetched, mapped to a common shape `{ id, timestamp, source, type, content/details, actorName }`, sorted by timestamp ascending, and rendered.

### Files created
- `src/hooks/useTicketHistory.ts`
- `src/components/bookings/TicketTimeline.tsx`

### Files modified
- `src/pages/BookingDetail.tsx` (add the timeline section)

