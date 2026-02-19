

# Add Logged-In User to Booking Audit Trail

## Problem

The `ticket_history` table already has a `created_by_user_id` column, but all 4 database triggers never populate it -- every history entry has `NULL` for the user. The timeline UI also never resolves user IDs to names/emails, so even if the column were filled, it wouldn't display.

## Solution

### Part 1: Update Database Triggers to Capture `auth.uid()`

All 4 trigger functions need one small change: add `created_by_user_id = auth.uid()` to their INSERT statements. Since these triggers fire in the context of an authenticated Supabase request, `auth.uid()` returns the logged-in user's ID.

A single migration will replace all 4 functions:

| Trigger Function | Event |
|---|---|
| `log_ticket_created` | Booking created |
| `log_ticket_status_changed` | Status changed |
| `log_ticket_item_instructor_changed` | Instructor changed |
| `log_booking_cancelled` | Cancellation recorded |

Each INSERT changes from:
```sql
INSERT INTO ticket_history (ticket_id, event_type, details)
```
to:
```sql
INSERT INTO ticket_history (ticket_id, event_type, details, created_by_user_id)
VALUES (..., auth.uid())
```

### Part 2: Resolve User IDs to Emails in the Timeline

Update `useTicketHistory.ts` to:
1. Collect all non-null `created_by_user_id` values from history entries
2. Look up the corresponding instructor records (the `instructors` table links to auth users and has emails)
3. Pass the resolved email as `actorName` into each `TimelineEntry`

Since there's no `profiles` table, we'll use a lightweight approach: query `instructors` by matching email from `auth.users`. However, since we can't query `auth.users` from the client, we'll instead store the user email directly in the `details` JSONB when the trigger fires. This is more reliable.

**Revised approach**: Add `actor_email` to the trigger's `details` JSONB by looking it up in `auth.users`:

```sql
INSERT INTO ticket_history (ticket_id, event_type, created_by_user_id, details)
VALUES (
  NEW.id,
  'BOOKING_CREATED',
  auth.uid(),
  jsonb_build_object(
    'ticket_number', NEW.ticket_number,
    'total_amount', NEW.total_amount,
    'customer_id', NEW.customer_id,
    'actor_email', (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);
```

Then in the frontend, simply read `details.actor_email` as the actor name -- no extra queries needed.

### Part 3: Display Actor in Timeline UI

Update `useTicketHistory.ts`:
- In the `useUnifiedTimeline` mapping for history events, set `actorName` from `e.details.actor_email` instead of `null`

This means every timeline entry will show e.g. "Buchung erstellt" with "ivo@ivo.ch" as the actor.

## Files Summary

| File | Action |
|---|---|
| New migration SQL | Update 4 trigger functions to include `auth.uid()` and `actor_email` |
| `src/hooks/useTicketHistory.ts` | Read `details.actor_email` as `actorName` for history events |

## Result

Timeline entries will show:
- "Buchung erstellt" -- ivo@ivo.ch -- 19.02.2026 14:30
- "Status geandert: confirmed -> storno" -- ivo@ivo.ch -- 19.02.2026 15:00
- Existing entries (before this change) will continue showing without a user (graceful fallback)
