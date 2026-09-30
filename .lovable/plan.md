# Plan update: guests, backfill, API contracts, payroll safety

All other parts of the revised plan are accepted and unchanged. Phases 1 and 2 (database and server step) are live, and the first part of Phase 3 (screens) is built. Nothing is published.

## 1. Guests from the booking form (decision: saved as real participants)
- Every guest becomes a real participant record of the customer, created in the same database step as the booking (`pa_create_booking`). Name, birth date and sport are stored.
- Each guest is identified by its `guest_key`, the wizard's temporary guest id. Within one booking a `guest_key` creates exactly one participant. Sending the same booking again (same `submission_key`) creates nothing new.
- If the customer already has a participant with the same first name, last name and birth date, that participant is used instead of creating a duplicate.
- The participant link (`private_appointment_participants.participant_id`) is required and must point to an existing participant. There is no empty participant and no ambiguous guest.
- Scheduler, booking detail, attendance and notifications read names through this link, so every person stays identifiable.
- The fallback of storing a frozen guest copy is not needed, because saving guests as real participants does not conflict with anything that exists today.

## 2. Backfill (Phase 4, runs only after your OK)
- **Allowed only for:** bookings that are future, unambiguous (one slot = one date, time and instructor), not completed, not cancelled and not invoiced.
- **Never touched:** a booking with an invoice that has been issued (`issued_at` set) or has a status other than draft/cancelled/void.
- **Dry run:** `pa_reconcile_report` shows, per booking, `item_total_before`, `item_total_after`, `ticket_total`, the planned action and a skip reason. Skip reasons: past, not_scheduled, invoiced, ambiguous_slot, has_overrides, total_mismatch. If the before total differs from the booking total, or the after total differs from the sum of the lesson prices, nothing changes.
- **Values stored for undo** in `private_appointment_backfill_log`, per run and per changed row:
  - already present: run_id, ticket_id, ticket_item_id, old_unit_price, old_appointment_id, old_ticket_total, action;
  - added in Phase 4: `old_row jsonb`, a full copy of the original billing line (participant, date, times, instructor, confirmation, period, override flag), so that merged per-person lines can be recreated exactly.
- **Undo:** per `run_id`, recreate the lines from `old_row`, remove the links and the created lessons, and restore `old_ticket_total`.

## 3. API contracts: `private-appointments` (POST, office/admin only)

| Situation | HTTP | Body |
|---|---|---|
| No login / only the public key | 401 | `{error:"unauthorized"}` |
| Instructor or no role | 403 | `{error:"forbidden"}` |
| Invalid input | 400 | `{error:"invalid", field, index}` |
| Unknown id | 404 | `{error:"not_found"}` |
| Slot not free | 409 | `{error:"conflict", conflicts:[{index, appointment_id?, date, kind, ref_id}]}`, nothing written |
| Protected | 423 | `{error:"protected", excluded:[{id, reasons:["past"\|"completed"\|"invoiced"]}]}` |

Actions:
- **`create`**
  - Payload: `submission_key`, `customer_id`, `product_id`, `notes?`, `appointments[{date, time_start, time_end, instructor_id, meeting_point?}]` (1-60), `participants[{participant_id} | {guest_key, first_name, last_name?, birth_date, sport?}]` (1-4).
  - Success (200): `{ticket_id, ticket_number, appointment_ids, total, replayed?}`.
- **`move`**
  - Payload: `appointment_id`, `date`, `time_start`, `time_end`, `instructor_id`.
  - Success (200): `{price, confirmation_reset}`.
- **`period_update`**
  - Payload: `period_group_id`, `changes{time_start?, time_end?, instructor_id?}` (at least one).
  - Success (200): `{updated_ids, excluded}`. Protected lessons are only listed, and a clash on any day changes nothing (409).

`set-booking-confirmation` with `{appointmentId, action: "confirm"|"decline", reason?}`:
- 200 when the caller is the assigned instructor;
- 403 for another instructor;
- 400 when a decline has no reason.

## 4. Payroll: only confirmed instructor hours count
- A lesson is confirmed only through `set-booking-confirmation` → `pa_confirm_appointment`, by the assigned instructor.
- The guard trigger `trg_pa_ticket_item_guard` refuses a linked billing line that says confirmed while its lesson is not, and refuses any change to its date, times or instructor that doesn't match the lesson.
- A move or instructor change sets the confirmation back to open.
- Hours come from the single billing line per lesson where `instructor_confirmation = 'confirmed'`, so a 3-person lesson counts once.
- Attendance lives only on the participant link and never creates or removes hours.
- Office staff cannot confirm on the instructor's behalf.

## 5. Files and tests per phase

**Phase 1 (done)**
- Migrations:
  - `20260930075110_…` pa_phase1a_schema
  - `20260930075211_…` pa_phase1b_functions
  - `20260930075532_…` pa_phase1c_fix_is_protected
  - `20260930075712_…` pa_phase1d_tighten_grants
- Tests: `supabase/tests/private_appointments_phase1_test.sql` (21 price checks, protection, conflicts, guard, reconcile report) and `privatePricingParity.test.ts`.
- Undo: `supabase/rollback/private_appointments_phase1_rollback.sql`.

**Phase 2 (done)**
- Migrations: `20260930093435_…` pa_phase2_tx and `20260930093732_…` pa_phase2_fix_line_total.
- Server steps: `supabase/functions/private-appointments/index.ts`, `supabase/functions/_shared/privateAppointmentsContract.ts`, `supabase/functions/set-booking-confirmation/index.ts`.
- Tests: `supabase/tests/private_appointments_phase2_test.sql` and `supabase/functions/private-appointments/contract.test.ts`.
- Undo: `supabase/rollback/private_appointments_phase2_rollback.sql`.

**Phase 3 (partly built)**
- Built:
  - `src/lib/privateAppointmentsApi.ts`
  - `src/hooks/useCreateBooking.ts` (server path)
  - `src/hooks/usePeriodModification.ts`
  - `src/contexts/SchedulerSelectionContext.tsx` (saved draft)
  - `src/components/scheduler/MultiSelectToggle.tsx`
  - `src/components/scheduler/EmptySlot.tsx`
  - `src/components/scheduler/SchedulerGrid.tsx`
- Still to build:
  - per-lesson date, time and instructor editing in the wizard planning step;
  - Scheduler blocks read one block per lesson with participant names;
  - booking detail, attendance and payroll (`useInstructorDetail.ts`) read through the participant link.
- New test: `src/lib/privateAppointmentsApi.test.ts` (error mapping for 409/423 into German messages).
- End-to-end check with an office login: a 3-day booking with a guest, a move onto a busy slot that must be refused, and a period change that includes a past lesson.

**Phase 4 (open)**
- Migration pa_phase4_backfill: `old_row` column, `pa_backfill_run(p_run uuid)`, `pa_backfill_rollback(p_run uuid)`, all server-only.
- Delivery worker: `supabase/functions/private-appointment-notify/index.ts`, which reads `private_appointment_changed` events. Email comes first, and the events stay channel-neutral.
- Tests: `supabase/tests/private_appointments_phase4_test.sql` (skip reasons, mismatch = no change, invoiced booking untouched, exact undo) and `supabase/functions/private-appointment-notify/notify.test.ts`.
- Undo: `supabase/rollback/private_appointments_phase4_rollback.sql`.


## Phase 3 correction (2026-09-30, client-only)
- Canonical plan: when `state.appointments` exists for a private booking it is the single list of real lessons (date, start, duration, per-block instructorId). selectedDates/timeSelections/overrides are derived display state only.
- `Geplante Termine` card is the only editor (initially expanded); client validation 09:00–16:00, end > start, no same-day overlap regardless of instructor; invalid edits keep the draft.
- `paCreate` payload is built 1:1 from the canonical list. Different instructors on different dates stay one booking; simultaneous selections are rejected (no participant split). Old manual flow unchanged when no plan exists.
- Final confirmation is read-only; price preview sums every canonical block; final persistence and pricing remain server-authoritative.
- Scheduler draft `yeti.scheduler.planningDraft.v1` is cleared only after a successful `paCreate` (or explicit Abbrechen/Escape).
- Out of scope: migrations, Edge Functions, security, group, payments, publishing.
