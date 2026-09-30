# Revised complete plan: multi-date private lessons (checked against the live state)

Your message was cut off after "legacy". This plan covers every point up to there, plus legacy handling, rollback and tests. Phases 1 and 2 are already built and tested on the server, and nothing is published. Phases 3 and 4 still need building.

## 1. Bookings vs. lines
A booking stays one `tickets` row. Several `ticket_items` never mean several bookings. The problem being fixed is operational duplication, not having several lines. Each real lesson exists exactly once as a `private_appointments` row. That row is what the Scheduler, pricing, confirmation, payroll and notifications all read.

## 2. Pricing (the "one line per participant per lesson" option is rejected)
- Each lesson gets exactly one billing line: `ticket_items.appointment_id` set, `participant_id` null, `unit_price` = `pa_price(date, start, end, people)`, and `line_total` (calculated by the database) equal to the lesson price.
- Participants are stored in `private_appointment_participants`, never as priced lines.
- Rule checked on the server (Phase 2 test):
  - the sum of the lines for a lesson equals `private_appointments.price`;
  - the sum of the lines for a booking equals `tickets.total_amount`, recalculated by `pa_recalc_ticket_total` on every change.
- Invoices and reports that read lines stay unchanged. The Phase 3 read check confirms this.
- The current browser loop that writes one line per participant, per day and per block (`useCreateBooking.ts` ~462-570, 702) is removed for private lessons in Phase 3. It is not kept anywhere.

## 3. Availability is a hard block
- `pa_slot_conflicts` / `pa_slot_is_free` check existing bookings, lessons, absences and recurring blocks.
- Create and move check every target on the server before anything is written. A clash always refuses the change (409). It is never just a warning.
- In the browser, a clash on one slot keeps all the other planned lessons in the draft (Phase 3).

## 4. Protected lessons
- `pa_is_protected`: a lesson is protected when its local date is before today, OR it is completed, OR the booking has an issued invoice (`issued_at` set, or status other than draft/cancelled/void).
- "Whole period" means future lessons that can still be edited. Protected lessons are returned in `excluded[{id,reasons}]` and are never changed.
- Historical corrections are a separate process and not part of this work.

## 5. Current database (checked)
- `private_appointments`: created in the Stage 1 migration and extended in Phase 1 and Phase 2.
  - Fields: ticket_id (required, FK), date, time_start, time_end, instructor_id, status (CHECK: scheduled/booked/completed/cancelled), price, instructor_confirmation, confirmed_at, confirmed_by, meeting_point, period_group_id, submission_key, timestamps.
  - Indexes: the ticket FK, and a partial index on `submission_key`.
- `private_appointment_participants`: appointment_id (FK), participant_id (required, FK), attendance (present/absent/null), attendance_by, attendance_at. Each appointment/participant pair can appear only once.
- `ticket_items.appointment_id`: optional FK. The guard trigger `trg_pa_ticket_item_guard` requires a linked line to match its lesson (date, times, instructor, confirmation).
- `private_appointment_backfill_log`: server-only.
- Access: office/admin manage, teachers see only their own lessons, and there is no public access. All `pa_*` functions can only be run by the server.
- Readers and writers today:
  - browser writes: `useCreateBooking.ts` (direct insert) and `usePeriodModification.ts` (calls `update_private_appointment`, which nobody is allowed to run, so it already fails);
  - server writes: the `private-appointments` step and `set-booking-confirmation`.
- Stored today: 0 lessons. This is the only model, and no duplicate is added.

## 6. Atomic Scheduler change (Phase 2, built)
Each create, move or period change runs as one transaction:
1. lock the rows;
2. check free slots and protection again;
3. write the lesson, its line and the booking total;
4. reset only the confirmations whose time, date or instructor changed (`confirmation_reset_at/reason`);
5. write one `ticket_history` row (`PRIVATE_APPOINTMENT_CHANGED`);
6. write one `notification_queue` event (`private_appointment_changed`, channel-neutral).

Sending (email, WhatsApp or voice) is done by a separate worker that reads the events (Phase 4).

## 7. Screens (Phase 3, German)
- A visible "Mehrere Termine auswählen" toggle, plus Ctrl/Cmd+Click, in the Scheduler and in the wizard's mini-scheduler.
- A saved planning draft (sessionStorage) that survives day/view changes, going back in the wizard, and a clash on one slot.
- The Scheduler tray only summarises and removes selections. Date, time and instructor are edited in the wizard's planning step.
- Different instructors on different dates are a normal period plan and never split the participants.

## 8. Server boundary (no direct database calls from the browser)
Everything goes through the existing staff-authorized Edge Function pattern (`requireRole(["office","admin"])`). There are no new access rights and no changes that touch the P0.2 security work.

| Action | Payload | 200 | 409 | 423 | 400/401/403/404 |
|---|---|---|---|---|---|
| `create` | submission_key, customer_id, product_id, appointments[{date,time_start,time_end,instructor_id,meeting_point?}], participants[{participant_id} or {guest_key,first_name,last_name?,birth_date,sport?}] | {ticket_id, ticket_number, appointment_ids, total}; a repeat returns the same result | {conflicts[{index,date,kind,ref_id}]} | n/a | invalid / auth / not_found |
| `move` | appointment_id, date, time_start, time_end, instructor_id | {appointment, price, confirmation_reset} | {conflicts} | {excluded} | same |
| `period_update` | period_group_id, changes{time_start?,time_end?,instructor_id?} | {updated_ids, excluded} | {conflicts}, nothing written | in excluded | same |

Confirmation uses `set-booking-confirmation` with `{appointmentId, action, reason?}`, and only the assigned instructor can use it.

## 9. Legacy records, backfill, rollback
- Dry run first: `pa_reconcile_report`. For each booking it shows the line totals before and after, plus a skip reason.
- Backfill only lessons that are future, unambiguous, scheduled and not invoiced. Any total mismatch means no change.
- Before-values are saved in the backfill log.
- Historic, ambiguous or invoiced legacy rows stay read-only as they are.
- Today: 4 legacy bookings, all past, so nothing to backfill.
- Undo scripts:
  - `supabase/rollback/private_appointments_phase1_rollback.sql`
  - `supabase/rollback/private_appointments_phase2_rollback.sql`

  Both refuse to run once data exists. Phase 3 is undone by restoring the previous app version while the server step stays in place.

## 10. Remaining phases and exact files
**Phase 3 – browser on the server step + screens**
- Change: `src/hooks/useCreateBooking.ts`. The private path calls `private-appointments` `create`, and the per-participant loop for private lessons is removed.
- Change: `src/hooks/usePeriodModification.ts`. It calls `move` / `period_update` and shows `excluded` and `conflicts`.
- New: `src/hooks/usePlanningDraft.ts` (saved draft), `src/components/scheduler/MultiSelectToggle.tsx`, `src/components/scheduler/PlanningTray.tsx`.
- Change: the wizard planning step (`BookingWizardContext.tsx` + planning step component). It edits date, time and instructor per day, and guests get a `guest_key`.
- Change: the Scheduler's lesson blocks read `private_appointments` + participants (one block per lesson).
- Read check: booking detail, invoice and payroll (`useInstructorDetail.ts`) read one line per lesson correctly.

**Phase 4 – backfill and delivery**
- Review the dry-run report. Backfill runs only after your explicit OK.
- New: a delivery worker that reads `private_appointment_changed` events. It is channel-neutral, and email comes first.

## 11. Tests
- Existing and passing:
  - Phase 1 SQL test (includes 21 live price checks);
  - Phase 2 SQL test (create, repeat, clash, move, protection, period, audit/event, confirmation);
  - contract test (401, public key refused, browser calls refused).
- Phase 3: an end-to-end run with an office login covering:
  - picking 3 slots across days and instructors, then navigating, going back, and hitting a clash on one slot;
  - booking, with the total equal to the sum of the lessons;
  - moving a lesson onto a busy slot, which must be refused;
  - a period change with one past lesson, which must be listed and left unchanged.
- Security linter: no new findings.

## Open questions
- Your message was cut off after "legacy". Is anything missing beyond section 9?
- The Phase 3 end-to-end check needs an office test login, and the role tests also need a teacher login and one without a role.
