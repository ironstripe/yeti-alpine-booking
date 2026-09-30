# Plan: Multi-appointment private bookings (minimal, additive)

Your message was cut off after "The Scheduler must eventually operate on one c…". This plan assumes the rest reads "…one consolidated appointment per time slot, not one row per participant". Please correct this if you meant something else.

## Current state (verified in code)

- **One booking = one `tickets` row.** Its lessons live in `ticket_items`. Each row already has its own `date`, `time_start`, `time_end` and `instructor_id`.
- **Multi-day private lessons already exist.** `useCreateBooking.ts:462-570` creates one row for every **participant × day × time block**. Rows share a `period_group_id`, and the defaults sit in `ticket_item_period_metadata` (base instructor and times, plus the start and end dates).
- **Per-day changes are supported.** The wizard supports per-day instructor and time overrides (`dayInstructorOverrides`, `dayTimeOverrides`). Changed rows are flagged `is_period_override`. A separate `ticket_item_overrides` table also exists (override_date, start/end time, instructor, price adjustment).
- **The core problem:** a lesson for 3 people on 4 days becomes 12 rows. There is no single "appointment" record, so the Scheduler, instructor confirmations and moves have to keep several rows in sync (`usePeriodModification.ts:94-108` updates by `period_group_id`).

The date/time/instructor-per-appointment goal is therefore mostly met at row level already. What is missing is one record per appointment that the Scheduler can own.

## Proposed model

```text
tickets (booking)
  └─ private_appointments   NEW: one per date + time slot
       date, time_start, time_end, instructor_id, status,
       instructor_confirmation, meeting_point, period_group_id
       └─ ticket_items      existing: one per participant (billing and attendance)
            + appointment_id (NEW, nullable)
```

- **Appointment:** where scheduling happens (move, resize, reassign, confirm).
- **ticket_items:** stay where pricing, invoices, attendance and cancellations happen. Nothing is removed or renamed.

## Stages

**Stage 1: schema, additive only.**
- Create `private_appointments` with FKs to `tickets` and `instructors`.
- Add a nullable `ticket_items.appointment_id` and an index.
- Follow grants in the P0.2 style: no anon access, office/admin full access, and teachers can SELECT only their own appointments via `get_instructor_for_user`.
- Rollback: drop the column and the table. No existing data is touched.

**Stage 2: backfill in dry-run mode first.**
- Group existing future private items by (ticket_id, date, time_start, time_end, instructor_id). Create one appointment per group and link its items.
- First, a report query lists any conflicts (the same slot but differing instructor or status) for your review. Past bookings are left alone.

**Stage 3: write path.**
- `useCreateBooking` creates appointments first, then the participant items linked to them.
- Triggers or an RPC keep the item fields (date, time, instructor) mirrored from the appointment, so every existing reader keeps working.

**Stage 4: Scheduler reads appointments.**
- `useSchedulerData` renders one block per appointment when `appointment_id` is set, and falls back to today's logic otherwise.
- Drag, reassign and period changes update the appointment. The mirroring trigger updates its items.

**Stage 5 (later):**
- Instructor confirmations and notifications move to appointment level.
- `ticket_item_period_metadata` and `ticket_item_overrides` get reviewed for retirement.

## Compatibility

- Group courses, lunch items, invoices, pricing and cancellations are unchanged.
- Existing rows without `appointment_id` behave as before.
- High-season rules and the no-past-dates rule still apply per appointment date.

## Tests

- Backfill dry run: row counts, and the conflict list comes back empty or is reviewed.
- Create a 3-person × 4-day booking with one day changed. Expect 4 appointments, 12 items, correct prices and the invoice total unchanged.
- Scheduler: moving one day moves only that appointment and its 3 items.
- Teacher login sees only their own appointments. anon gets 401.

## Decisions needed

1. Confirm the missing end of your message (the "one c…" part).
2. Should two participants in the same slot but with different instructors count as two appointments? Recommended: yes.
3. Is backfill limited to future bookings only? Recommended: yes.
4. Is per-participant pricing per appointment kept as it is today? Recommended: yes.
