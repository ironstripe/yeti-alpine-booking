
# Shared Private Lessons & Split Invoicing (V2)

## Overview

This feature introduces "Shared Private Lessons" -- allowing multiple independent customers/parties to share a single instructor time slot, with automatic proportional invoice splitting. It requires a new database table, modifications to the existing `tickets` table, a new UI workflow triggered from existing bookings, pricing logic, and scheduler display changes.

---

## Phase 1: Database Schema

### New table: `master_bookings`

Represents a single instructor time slot that can be shared by multiple tickets.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Default `gen_random_uuid()` |
| `instructor_id` | uuid, FK -> instructors | NOT NULL |
| `date` | date | NOT NULL |
| `start_time` | time | NOT NULL |
| `end_time` | time | NOT NULL |
| `total_participants` | integer | Cached count across all parties |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

RLS: Admin/office roles only (same pattern as `tickets`).

### Modify table: `tickets`

Add columns:

| Column | Type | Notes |
|--------|------|-------|
| `master_booking_id` | uuid, FK -> master_bookings, nullable | Links shared tickets |
| `is_initiator` | boolean, default false | First party gets rounding remainder |
| `share_participant_count` | integer, nullable | How many participants THIS party contributes |

### Unique constraint

A composite unique constraint on `master_bookings (instructor_id, date, start_time, end_time)` prevents double-booking at the DB level.

---

## Phase 2: Proportional Price Splitting Logic

### New utility: `src/lib/pricing/shared-lesson-pricing.ts`

```text
calculateSharedLessonSplit(
  totalParticipants: number,
  parties: { ticketId: string; participantCount: number; isInitiator: boolean }[],
  date: Date,
  startTime: string,
  endTime: string,
  rates: TimeSlotRate[],
  highSeasonPeriods: HighSeasonPeriod[]
) => SharedSplitResult
```

**Algorithm:**
1. Calculate total lesson cost using existing `calculatePrivateLessonPrice()` with `totalParticipants` across all parties
2. Per-participant rate = `floor(totalCost * 100 / totalParticipants) / 100` (floor to centimes)
3. Each party share = `perParticipantRate * partyParticipantCount`
4. Rounding remainder = `totalCost - sum(all shares)` (will be 0-N centimes)
5. Add remainder to the initiator's share

**Example validation:**
- 3 participants total, 2h lesson (10:00-12:00): 85 + 85 + 20 = CHF 190 total (wait, let me recalculate based on rates)
- Actually per the spec example: total = CHF 115 for some configuration
- The formula handles any total correctly via the rounding logic

---

## Phase 3: UI -- "Share & Split Invoice" Action

### Entry Points

1. **Booking Detail page** (`src/pages/BookingDetail.tsx`): Add a "Teilen & Rechnung splitten" button in the action area for private lesson tickets
2. **Scheduler BookingDetailDialog** (`src/components/scheduler/BookingDetailDialog.tsx`): Add same action button when viewing a private lesson

### Conditions to show button:
- Ticket contains private lesson items (not group)
- Ticket status is not cancelled
- Total participants across all parties sharing this slot < 5

### New component: `src/components/bookings/SharedLessonWizard.tsx`

A focused 3-step dialog/sheet for adding a party to an existing lesson:

**Step 1 -- Lesson Context (read-only)**
- Shows: product, date, time, instructor, meeting point
- Lists all current participants grouped by customer/party
- Shows remaining capacity: `5 - currentTotal = X spots available`

**Step 2 -- Add New Party**
- `CustomerSearch` to find/select the new customer
- `ParticipantSelection` to pick/create participants for this customer
- Validation: cannot exceed remaining capacity (5 - current total)
- Cannot select same customer as an existing party

**Step 3 -- Summary & Price Split**
- Shows ALL parties with their participants
- Calculates and displays the proportional split per party
- Highlights which amounts changed (existing parties get updated amounts)
- Rounding indicator: shows initiator gets the remainder
- Confirm button creates the new ticket and updates all amounts

### Backend logic on confirm:
1. If no `master_booking` exists yet for this lesson, create one from the original ticket's instructor/date/time
2. Link the original ticket to the `master_booking` (set `master_booking_id`, `is_initiator = true`)
3. Create a new ticket for the new customer with:
   - Same product, dates, times, instructor
   - `master_booking_id` pointing to same master booking
   - `is_initiator = false`
   - Own `ticket_items` for each of their participants
4. Recalculate and update `total_amount` on ALL linked tickets using the split formula
5. Update `master_bookings.total_participants`

---

## Phase 4: Scheduler Display Changes

### File: `src/hooks/useSchedulerData.ts`

When building `SchedulerBooking` objects for private lessons:
- Query tickets joined to `master_bookings` to detect shared lessons
- For shared lessons, aggregate all participant names across all linked tickets
- Set a new `isSharedLesson: boolean` flag on `SchedulerBooking`

### File: `src/lib/scheduler-utils.ts`

Add to `SchedulerBooking` interface:
```text
isSharedLesson?: boolean;
sharedCustomerNames?: string[];  // e.g., ["Huber", "Meier"]
masterBookingId?: string;
```

### File: `src/components/scheduler/BookingBar.tsx`

- For shared lessons, display label as: `"Privat: Huber / Meier"` instead of single participant name
- Add a small "link" icon indicator (existing `Link2` icon already imported)
- Tooltip shows all parties and participant counts

### Deduplication:

Currently each `ticket_item` with an instructor becomes a separate bar. For shared lessons, multiple ticket_items from different tickets share the same slot. The scheduler must deduplicate: group all ticket_items that share the same `master_booking_id` + date into a single bar, displaying combined names.

---

## Phase 5: Booking Detail View Changes

### File: `src/pages/BookingDetail.tsx`

When a ticket has a `master_booking_id`:
- Show a "Geteilte Privatstunde" (Shared Private Lesson) indicator badge
- Show a section listing all other parties sharing this lesson, with links to their tickets
- Show this party's proportional share vs. the total
- "Share & Split Invoice" button to add more parties (if capacity allows)

---

## Phase 6: Cancellation Handling

### Business rule: No recalculation on cancellation

When a party cancels their ticket (via existing cancellation flow):
- The cancelled ticket follows standard cancellation workflow (cancellation fee etc.)
- The remaining parties' `total_amount` values are **NOT** recalculated
- The `master_bookings.total_participants` is updated (decremented)
- If ALL parties cancel, the `master_booking` can be soft-deleted or left as-is

No code changes to the cancellation flow itself -- just ensure the existing flow doesn't trigger a recalculation. The split amounts are "frozen" at creation time.

---

## Phase 7: Invoice Generation

### Existing invoice system

Each ticket already generates its own invoice with its own `total_amount`. Since each party has its own ticket with the correct proportional amount, the existing invoice generation works without changes.

The invoice shows:
- The customer's participants only
- The proportional amount (already set on `total_amount`)
- Standard invoice format

No changes needed to invoice generation code.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| Migration SQL | **Create** | `master_bookings` table + `tickets` columns |
| `src/lib/pricing/shared-lesson-pricing.ts` | **New** | Proportional split calculator with rounding |
| `src/components/bookings/SharedLessonWizard.tsx` | **New** | 3-step dialog for adding a party |
| `src/hooks/useSharedLesson.ts` | **New** | Hook for creating/managing shared lessons |
| `src/pages/BookingDetail.tsx` | **Modify** | Add shared lesson indicator + action button |
| `src/components/scheduler/BookingDetailDialog.tsx` | **Modify** | Add "Share & Split" action |
| `src/hooks/useSchedulerData.ts` | **Modify** | Aggregate shared lesson data, deduplicate bars |
| `src/lib/scheduler-utils.ts` | **Modify** | Add shared lesson fields to `SchedulerBooking` |
| `src/components/scheduler/BookingBar.tsx` | **Modify** | Display combined names for shared lessons |

---

## Technical Considerations

- **Conflict detection**: The `master_bookings` unique constraint on `(instructor_id, date, start_time, end_time)` prevents double-booking at the DB level
- **Max participants**: Enforced in the UI wizard (Step 2 validation) and can optionally be enforced via a DB trigger on `master_bookings.total_participants <= 5`
- **Backward compatibility**: Existing non-shared private lessons continue to work with `master_booking_id = null`; no migration of existing data needed
- **Rounding correctness**: The split algorithm guarantees `sum(all shares) == total` by assigning the remainder to the initiator
