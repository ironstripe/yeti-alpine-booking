# Plan: Multi-date private lessons — Stages 3–4 (selection, wizard, creation, Scheduler)

Your message was cut off again, at "Several `ticket_items` do not autom…". This plan reads that as "…automatically mean several appointments": one appointment per real lesson, with participant rows linked to it.

## Already live
- **New storage for appointments.** A new table, `private_appointments`, holds one row per real lesson, and each booking item can now point to its appointment.
- **Access rules.** Office and admin can manage appointments; a teacher can see only their own.
- **No existing data needed converting.** There are no upcoming private lessons today, so nothing was migrated.

## Verified gaps in the current code
1. **Scheduler selection is locked to one instructor.** `SchedulerSelectionContext` keeps one `teacherId` and rejects slots of another instructor (lines 284, 296, 393). The toolbar sends a single `instructor` in the URL (`SelectionToolbar.tsx:57-70`).
2. **The wizard receives only one instructor.** `prefillFromScheduler(instructorId, appointments)` sets one base instructor for all days.
3. **A different instructor per day wrongly splits participants.** In `applyMiniSchedulerSelection` (`BookingWizardContext.tsx:1113-1117`), if the mini-scheduler selection holds more than one instructor and there is more than one participant, a `privateGroupProposal` is built. That splits the participants into simultaneous groups. This is exactly the behaviour you ruled out.
4. **Creation writes rows per participant × day × block.** There is no appointment record yet (`useCreateBooking.ts:462-570`).

## What gets built

**A. Visible multi-selection mode in the Scheduler.**
- A "Mehrfachauswahl" toggle in the Scheduler toolbar. While it is on, clicking a free slot adds it and clicking again removes it. Ctrl/Cmd+Click keeps working as it does now.
- Slots of **different instructors on different days** are allowed.
- Overlapping slots are still blocked:
  - two slots at the same time on the same day for one booking;
  - a slot on top of an existing booking or absence.
- A persistent side list, "Geplante Termine", shows date, time and instructor for each slot. Each entry can be removed, and its time adjusted, before continuing. Past dates stay blocked.
- "Buchen" hands the full list, with each slot's instructor, to the wizard.

**B. Wizard hand-off and the planning step.**
- The URL and prefill carry `appointments[]` with `{date, startTime, durationMinutes, instructorId}`. The old single-`instructor` URL still works.
- The existing `PeriodDayPlanner` becomes the editable daily plan: one line per appointment. Date, start/end time and instructor can each be changed, and appointments can be added or removed.
- The mini-scheduler uses the same list, so selections made there and in the main Scheduler behave identically.
- **Fix for gap 3:** a participant group split is proposed only when two instructors are selected for **the same date and overlapping time**. A different instructor on another day is a normal period plan, and the participants stay together.

**C. Creation: one coherent booking.**
- Still one `ticket`. For multi-date private bookings, `useCreateBooking` first creates one `private_appointments` row per plan line, then one `ticket_item` per participant linked through `appointment_id`.
- The current fields stay filled on each item (date, times, instructor, `period_group_id`, override flag), so invoices, pricing, confirmations, the instructor portal and reports read exactly what they read today.
- Prices are calculated per participant per appointment, as today.
- Single private lessons, group courses, lunch items, office shifts, checkout and payments do not go through this path and do not change.

**D. Scheduler shows one block per appointment.**
- `useSchedulerData` shows one block per appointment, with a participant count, wherever items carry an `appointment_id`. Items without one render exactly as today.
- Moving, resizing or reassigning such a block updates the appointment and its linked items together in one server-side step, keeping them in sync. The existing "this day vs. whole period" dialog is kept.

## Not changed
Group courses, checkout, payments, invoices, office shifts, legacy single private lessons, RLS on existing tables, Edge Functions and publishing.

## Technical details
- New security-definer RPCs, each with an office/admin check and grants to `authenticated` only:
  - `create_private_appointment_booking_items`, which inserts appointments and items in one transaction;
  - `update_private_appointment(id, date, start, end, instructor)`, which updates the appointment and mirrors the change to its items.
- Selection state gains a per-slot `instructorId`. `teacherId` becomes "last used instructor", used only for defaults.
- Validation on submit: every appointment is in the future and has a start before its end. An instructor must not be double-booked; this is checked against existing bookings, as today, and shown as a warning, not a hard block, consistent with the current availability checks.

## Tests
- Select 4 slots across 4 days with 2 instructors, 3 participants. Expect no group split, 1 ticket, 4 appointments, 12 items, and an invoice total equal to the sum of the per-appointment prices.
- Two instructors at the same time on the same day: the split proposal still appears, as today.
- A single private lesson and a group course booking: rows are identical to before (same columns, no `appointment_id`).
- Scheduler: moving day 2 changes only that appointment and its 3 items; "whole period" updates all of them.
- A teacher login sees only their own appointments.

## Open questions
1. Please confirm the cut-off text in constraint 2, and send the remaining constraints if there are more.
2. Should the side list allow editing the instructor per line, or only the time (with instructor editing in the wizard only)? Recommended: time only in the Scheduler; everything in the wizard.
