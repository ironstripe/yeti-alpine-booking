# Plan: Multi-date private appointments (final revision, Option A)

The canonical unit is one real private appointment. It has one price and exactly one billing line (`ticket_items`, `participant_id = null`, `appointment_id` set). Participants, including Wizard guests, are listed in an explicit mapping. Prices are never split across participants. The customer booking stays one ticket. Nothing is built or published until you approve.

## Rules
- **Price.** Calculated once per appointment from its own date (high season), start and end time (off-peak/peak) and participant count, using `private_lesson_rates` and `high_season_periods`. The ticket total is the sum of appointment lines, plus lunch, minus discount. The price is never multiplied by participants.
- **Free slots only.** A slot is free only when the instructor has none of the following in it:
  - a booking row (private, group or office shift);
  - an appointment;
  - an absence;
  - a recurring block.

  This applies to creation and every move. There is no bypass.
- **Protected appointment.** An appointment is protected if any of these is true:
  - its local business date (Europe/Zurich) is before today;
  - its status is `completed`;
  - its ticket has an invoice with `issued_at IS NOT NULL` or `status NOT IN ('draft','cancelled','void')`.

  Protected appointments are never changed by period or single-day actions. Historic corrections need a separate, audited process, which is out of scope.
- **Confirmations.** Only appointments whose instructor, date or time actually changed are reset to `pending`.
- **Payroll safety.** See the dedicated section below.

## Current state (verified)
- The last step (not published) created `private_appointments` and `ticket_items.appointment_id`. It writes one fully priced row per participant from the browser. This plan replaces that write path.
- Price comes from the first date and base time only (`useCreateBooking.ts:119-129, 183`).
- `update_private_appointment` has no availability check. The legacy move warning can be overridden.
- "Whole period" updates every row, including past ones (`usePeriodModification.ts`).
- Guests get the temporary id `guest-<timestamp>` (`BookingWizardContext.tsx:609-618`) and are saved with `participant_id = null`, so their identity is lost (`useCreateBooking.ts:333, 359, 432, 559, 586, 793, 869`).
- Instructor hours and gross pay are summed per `ticket_items` row where `instructor_confirmation = 'confirmed'` (`useInstructorDetail.ts:106-135`). A 3-person private lesson is therefore counted three times today.
- Invoice issuing does not read `ticket_items`. Reports sum `unit_price` per row (`useReportsData.ts:597-615`).

## Architecture

```text
Scheduler / Wizard (persistent draft)
   | supabase.functions.invoke('private-appointments', {action, ...})
   v
Edge Function private-appointments  -> requireRole(['office','admin'])
   | service-role RPC, verified caller id passed in
   v
DB function (one transaction):
  advisory lock per instructor+day -> availability -> protection
  -> ticket / appointments / billing lines / guest participants / mapping
  -> reset only affected confirmations -> ticket_history audit
  -> notification_queue event (pending, channel-neutral)
   |
(after commit) existing workers deliver; never inside the transaction
```

- The database functions are `SECURITY DEFINER` with `EXECUTE` granted only to `service_role`. The browser gets no new grants, anonymous access is unchanged, and existing RLS is not weakened.

## Data model (additive)

**New table `private_appointment_participants`:**
- columns: appointment_id, participant_id, attendance (`null|present|absent`), attendance_by, attendance_at, created_at;
- `participant_id` is NOT NULL with a foreign key to `customer_participants`;
- unique constraint on (appointment_id, participant_id);
- RLS: office/admin manage; teachers read their own appointments. There is no anon access.

**New columns on `private_appointments`:** `price numeric`, `ticket_id uuid`, `status` (`scheduled|completed|cancelled`) and `confirmed_at`, `confirmed_by`.

**Billing line:** `ticket_items` with `appointment_id` set, `participant_id = null`, and `unit_price` equal to the appointment price. Date, time, instructor and confirmation are mirrored from the appointment by the database functions only. Phase 1 verifies that `participant_id` is nullable today; if not, a nullable change is the only compatibility change.

**Legacy rows** (historic or ambiguous) stay read-only and untouched.

## Guest participants
- In the same create transaction, every Wizard guest becomes a `customer_participants` record under the booking's customer (name, birth date, sport, level). The mapping points to that new id.
- Each guest carries a client-generated `guest_key` (UUID). The server creates exactly one participant per key and reuses it for all appointments. A repeated key with different data is rejected.
- A resubmit with the same `submission_key` creates nothing new.
- A guest whose name and birth date match an existing participant of the same customer is linked to that participant.
- **Fallback, used only if you reject persisting guests:** immutable snapshot fields plus `source` (`participant|guest`) with a CHECK constraint, and uniqueness on (appointment_id, guest_key).

## Payroll safety
- **Payroll-eligible hours** come only from appointment billing lines where the appointment has `instructor_confirmation = 'confirmed'`, its status is not `cancelled`, and it is past or `completed`. That is one line per appointment, so hours are counted once regardless of participant count.
- **Only the instructor confirms.** Confirmation is set only by the existing `set-booking-confirmation` Edge Function (the instructor's own session, extended for appointments) through the database function `confirm_private_appointment`. That function sets the appointment and mirrors it onto its line.
- **A guard trigger** on `ticket_items` rejects any direct change of `instructor_confirmation`, `instructor_id`, `date` or times on a row with `appointment_id` unless it matches the appointment. This blocks office and browser bypasses.
- **Any move or instructor change** through the Edge Function resets confirmation to `pending` and clears `confirmed_at`. Earlier confirmed hours therefore never carry over to a new time or instructor.
- **Attendance** is recorded on the mapping only by the assigned instructor or office. It does not create or confirm hours.
- **The instructor hours summary** (`useInstructorDetail.ts`) keeps its per-row logic. With one line per appointment it becomes correct automatically. Legacy multi-participant rows are unchanged, and they are listed as a known historic over-count in the reconciliation report.
- **Product decision:** if every participant is absent, a confirmed appointment still counts (the lesson was held; this matches the 24h cancellation rule). Say if you want otherwise.

## Edge Function contract: `private-appointments` (POST, JSON)

All responses use the shape `{ ok, code, ... }`.

**Authorization results**
- no or invalid session: `401 {ok:false, code:"unauthenticated"}`;
- no office/admin role: `403 {ok:false, code:"forbidden"}`;
- invalid payload: `400 {ok:false, code:"invalid_input", fields:{...}}`.

**Shared results**
- Conflict: `409 {ok:false, code:"slot_conflict", conflicts:[{appointment_ref|appointment_id, date, time_start, time_end, instructor_id, reason:"booking|appointment|absence|recurring_block"}]}`. Nothing is written.
- Protected: `409 {ok:false, code:"protected", excluded:[{appointment_id, date, reason:"past|completed|invoiced"}]}` for a single-target action. For `modify_period`, protected items are reported in `excluded` inside a 200 response.

**1. `create_booking`**
- Payload:
  - `submission_key` (UUID) and `customer_id`;
  - `participants[]`: either `{participant_id}` or `{guest_key, first_name, last_name?, birth_date, sport?, level_id?}`;
  - `appointments[]`: `{ref, date, time_start, time_end, instructor_id}`;
  - optional `meeting_point`, `lunch`, `discount_percent` + `discount_reason`, `payment_method`, `billing_partner_id`, `notes`.
- Success: `200 {ok:true, code:"created", ticket_id, ticket_number, total_amount, appointments:[{ref, appointment_id, price}], guest_participants:[{guest_key, participant_id}]}`.
- A replayed `submission_key` returns the same body with `code:"already_created"`.
- Also returns conflict (per `ref` and day) and `422 {code:"past_date"}`.

**2. `move_appointment`**
- Payload: `{appointment_id, date, time_start, time_end, instructor_id}`.
- Success: `200 {ok:true, code:"moved", appointment_id, price, ticket_total, confirmation_reset:boolean}`.
- Also returns conflict or protected.

**3. `modify_period`**
- Payload: `{period_group_id, changes:{time_start?, time_end?, instructor_id?}, scope:"future_editable"}`.
- Success: `200 {ok:true, code:"modified", updated:[{appointment_id, date, price, confirmation_reset}], excluded:[{appointment_id, date, reason}], ticket_total}`.
- A conflict on any target day means nothing is changed (all-or-nothing).

## Migration, backfill and rollback
1. **Additive schema.** No drops.
2. **Dry run (read-only)** `private_appointments_reconcile(dry_run => true)`. For each candidate ticket it returns: ticket_id, `ticket_items` total before, total after (simulated), `ticket.total_amount`, the planned action, and `skip_reason`. Possible skip reasons:
   - `past`;
   - `not_scheduled`;
   - `invoiced` (issued or non-draft/non-cancelled/non-void);
   - `ambiguous_slot` (differing instructor, time or status within one date+time group);
   - `total_mismatch` (after ≠ before);
   - `has_overrides`.
3. **Backfill** covers only tickets that are future, scheduled, not invoiced, unambiguous, and exactly equal before and after. Any mismatch means no change for that ticket. For each group it creates one appointment, one billing line and the mapping. Old per-participant rows are set to price 0 and linked, never deleted. Issued invoices are never touched. The previous dry run found 0 future private rows, so this is expected to be a no-op.
4. **Before-values** are stored in the new table `private_appointment_backfill_log`:
   - ticket_id, ticket_item_id;
   - the old unit_price, appointment_id and total_amount;
   - run_id, created_at.
5. **Rollback** (`supabase/rollback/private_appointments_rollback.sql`):
   - restore old `unit_price`, `appointment_id = null` and `total_amount` from the log for a given run_id;
   - remove the backfill-created appointments, lines and mappings of that run;
   - switch the frontend and Edge Function back to the previous release.

   There are no table drops and no anon grants.

## Build phases and files

**Phase 1: Schema and reconciliation**
- Migration: `supabase/migrations/<ts>_private_appointments_phase1_schema.sql`. It adds the mapping table, the new appointment columns, the backfill log, grants, RLS and the `ticket_items` guard trigger.
- Database functions (same migration): `private_price(date, time, time, int)`, `private_appointment_is_protected(uuid)`, `private_slot_is_free(uuid, date, time, time, uuid)`, and `private_appointments_reconcile(boolean)`.
- Rollback: `supabase/rollback/private_appointments_rollback.sql`.
- Tests:
  - `supabase/functions/private-appointments/pricing_parity.test.ts`, comparing the SQL price with `calculatePrivateLessonPrice`;
  - `supabase/tests/private_appointments_phase1.sql`, covering protection, free-slot checks and the guard trigger.

**Phase 2: Server boundary**
- Migration: `supabase/migrations/<ts>_private_appointments_phase2_functions.sql`. It adds `pa_create_booking(jsonb, uuid)`, `pa_move_appointment(jsonb, uuid)`, `pa_modify_period(jsonb, uuid)` and `confirm_private_appointment(uuid, uuid, text)`, all service_role only. It replaces `update_private_appointment` with a version that refuses and points to the Edge Function.
- Edge Function: `supabase/functions/private-appointments/index.ts`, plus a `set-booking-confirmation/index.ts` extension for appointment lines.
- Tests:
  - `supabase/functions/private-appointments/contract.test.ts`, covering 401/403/400/409 and success shapes;
  - `supabase/functions/private-appointments/transaction.test.ts`, covering guests, idempotency, a parallel-booking race and no partial writes.

**Phase 3: Creation user experience**
- Files:
  - `src/contexts/PrivatePlanningDraftContext.tsx` (new; session storage);
  - `src/contexts/SchedulerSelectionContext.tsx`;
  - `src/components/scheduler/SelectionToolbar.tsx` ("Mehrere Termine auswählen" toggle, remove-only tray);
  - `src/components/bookings/wizard/PeriodDayPlanner.tsx` (edit date, time and teacher);
  - `src/contexts/BookingWizardContext.tsx` (stable `guest_key`);
  - `src/hooks/useCreateBooking.ts` (this path invokes the Edge Function).
- Tests: `src/contexts/__tests__/PrivatePlanningDraft.test.tsx`, covering the draft surviving navigation, Wizard back and a conflict.

**Phase 4: Operations and readers**
- Files:
  - `src/hooks/usePeriodModification.ts` and `src/components/scheduler/PeriodModificationDialog.tsx` (Edge Function, override removed, protected list);
  - `src/hooks/useSchedulerData.ts`;
  - `src/pages/BookingDetail.tsx` (names from the mapping);
  - `src/hooks/useUpdateAttendance.ts` and `src/hooks/useInstructorPortalData.ts` (mapping attendance).
- Migration: `supabase/migrations/<ts>_private_appointments_phase4_backfill.sql`. It is applied only after you review the dry-run report.
- Tests:
  - `supabase/functions/private-appointments/period.test.ts`, covering protected exclusions and all-or-nothing conflicts;
  - `supabase/functions/private-appointments/payroll.test.ts`, covering confirmed-only hours, reset on move, the trigger blocking direct edits, and one line counting hours once.

## Acceptance tests
- 3 participants × 4 days, 2 teachers, one day at a different time: 4 appointments, 4 lines, 12 mapping rows, and each price from its own slot. The total equals the sum.
- 1 existing participant + 2 same-named guests × 3 days: 2 new participant records and 9 mapping rows, and all names are visible. A replay creates nothing. A repeated `guest_key` with different data is rejected.
- An occupied slot or a race between two staff members: 409 with the day named, nothing written, and the draft kept.
- A move onto a busy slot or into an absence: 409, with no override.
- A period where day 1 is past and day 2 is invoiced: only days 3–4 change, `excluded` lists 2, and only the changed days reset confirmation.
- Payroll: an unconfirmed appointment gives 0 eligible hours. A confirmed 2h appointment with 3 participants gives 2h. A move after confirmation returns it to pending. A direct UPDATE of confirmation is rejected.
- Anon, a user with no role, or a teacher calling the Edge Function: 401/403. Direct RPC by an authenticated user: permission denied.
- Legacy single private lesson and group course: rows, totals and hours unchanged.
