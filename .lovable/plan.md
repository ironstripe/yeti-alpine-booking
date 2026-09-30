# Plan: Private appointments — enforce constraints 2–6

This plan corrects what was built in the last step against your constraints 2–6. Your message stops at "Past, completed, or invoi…" in constraint 6. The plan reads it as: past, completed or invoiced appointments are never changed by period actions. Please send any further constraints.

## Already built (last step, not published)
- **Appointments table.** A new `private_appointments` table holds one row per real lesson; participant rows link to it.
- **Scheduler selection.** Slots of different instructors can be selected together. Two picks at the same time on the same day are refused.
- **Booking hand-off.** Per-day instructors reach the booking form. A participant split is proposed only for truly simultaneous instructors.
- **Scheduler display.** The Scheduler shows one block per appointment. A single-day move updates the appointment and all its participant rows through `update_private_appointment`.

## Verified gaps against your constraints

| # | Constraint | Current code | Gap |
|---|---|---|---|
| 2/3 | One ticket; one operational appointment per lesson | Met by the last step | none |
| 4 | Price once per appointment, exact total | `useCreateBooking.ts:119-129` prices **only the first date at the base time**, for all days. `:183` total = that price × days, so per-day time changes and multiple blocks per day are ignored. Each participant row stores the **full** lesson price (`:554`), so every screen that sums rows multiplies the price by participant count (BookingDetail, TicketItemEditCard, reports and useUpdateBooking all read `unit_price`). | **violated** |
| 5 | Free slots only, no overwrite bypass | The Scheduler selection blocks overlaps in the browser only. Creation does not re-check on the server. `update_private_appointment` checks nothing about conflicts. Legacy drag/reassign shows a conflict **warning** that can be confirmed. | **violated** |
| 6 | Period actions change future editable appointments only | `usePeriodModification.ts` "whole period" updates **every** row with that `period_group_id`, including past ones, and now also every appointment | **violated** |

## Changes

**1. Exact pricing per appointment (constraint 4).**
- Price each appointment on its own: its date (high season), its start and end time (off-peak/peak), and its participant count. This uses the existing `calculatePrivateLessonPrice`.
- Ticket total = the sum of appointment prices, plus lunch, minus discount.
- The price is stored on the appointment (new column `price`, additive).
- Each participant row gets an **exact share**: the price divided by the number of participants, in cents, with the remainder on the first row. The row prices then add up exactly to the appointment price, so every existing screen that sums rows (booking detail, reports, invoices) shows the right amount without being rewritten.
- A move or reassignment that changes date or time re-prices that one appointment and re-splits its rows. The ticket total is recalculated in the same server step.

**2. Free slots only, enforced on the server (constraint 5).**
- A new check, `private_slot_is_free(instructor, date, start, end, exclude_appointment)`. A slot is free only when it has none of the following for that instructor:
  - an active booking row (private, group or office shift);
  - an absence;
  - a recurring block;
  - another appointment.
- Creation moves into one server function, `create_private_appointment_booking`. It locks each instructor and date, checks every appointment, and then writes the ticket, appointments and rows in one transaction. Any conflict rejects the whole booking with the conflicting day named.
- `update_private_appointment` runs the same check (excluding itself) and rejects conflicts. The warning dialog's "trotzdem" (proceed anyway) path is removed for private lessons, for both the new and the legacy rows.

**3. Period actions only touch future editable appointments (constraint 6).**
- "Whole period" and "single day" act only on appointments that are dated today or later, not cancelled or completed, not marked attended, and not on an issued invoice.
- The server step skips any other appointment and reports how many were skipped. The dialog shows "X vergangene/abgerechnete Termine bleiben unverändert".
- The period's stored default times and instructor change only for the future part.

**4. Unchanged**
Group courses, checkout, payments, invoice issuing, office shifts and legacy single private lessons, apart from the removed overwrite for private moves.

## Technical details
- Migration, additive only:
  - `private_appointments.price numeric`;
  - functions `private_slot_is_free`, `create_private_appointment_booking(payload jsonb)`, `update_private_appointment` (replaced) and `modify_private_period(period_group_id, time/instructor, notify)`.
  - All are `SECURITY INVOKER` with an office/admin check. There are no anon grants.
  - Per-instructor-day advisory locks prevent two parallel bookings from taking the same slot.
- The price is calculated on the server in SQL from `private_lesson_rates` and `high_season_periods`, mirroring `calculatePrivateLessonPrice`. A shared test fixture compares both for the same inputs.
- `useCreateBooking` calls the new function for multi-date private bookings. The legacy paths stay as they are.

## Tests
- 3 participants × 4 days, 2 instructors, one day at a different time: 4 appointments, and each price matches its own time. The ticket total equals the sum. The rows add up to the total exactly, with no multiplication by 3.
- Book onto an occupied slot, including one taken between selecting and saving: rejected, and nothing is written.
- Move onto a busy slot or into an absence: rejected, with no override button.
- "Whole period" on a booking whose day 1 is past and day 2 is invoiced: only days 3–4 change, and the dialog reports 2 skipped.
- A single private lesson and a group course: rows and totals are identical to before.

## Decisions needed
1. **Constraint 6 and anything after it:** please send the full text.
2. **Price per participant row:** exact split, as proposed above? Or keep the full price on the first row and 0 on the others?
3. **What counts as "invoiced":** an appointment whose ticket has an issued, non-cancelled invoice. Is that right?
