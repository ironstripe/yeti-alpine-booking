# Plan: Multi-date private appointments (revised)

The canonical unit is one real private appointment. It has one price and exactly one billing line (`ticket_items`, `participant_id = null`). Participants are listed in an explicit mapping. There is no split of the price across participant rows. The customer booking stays one ticket.

## What changes from the previously built step (not published)

The last step already created `private_appointments` and `ticket_items.appointment_id`. It also wrote one priced `ticket_items` row per participant from the browser, which this plan replaces:

| Item | Status | Change |
|---|---|---|
| One billing row per participant, each at full price | Built last step | Replaced by one line per appointment plus a participant mapping |
| Browser writes tickets, appointments and rows directly | Built last step | Moved to a staff-authorized Edge Function (a server-side step that checks the caller's role) |
| Price from the first date and base time only (`useCreateBooking.ts:119-129, 183`) | Existing code | Priced per appointment on the server |
| `update_private_appointment` has no availability check; the legacy move warning can be overridden | Existing code | Server rejects conflicts; the override path is removed |
| Whole period updates all rows, including past ones | Existing code | Only future editable appointments change; protected ones are listed |

## Rules
- **Price.** Calculated once per appointment from its own date (high season), start and end time (off-peak/peak) and participant count, using the existing tariff tables. The ticket total is the sum of appointment lines, plus lunch, minus discount. The price is never multiplied by participants.
- **Free slots only.** A slot is free only when the instructor has none of the following in it:
  - a booking row (private, group or office shift);
  - an appointment;
  - an absence;
  - a recurring block.

  This applies to creation and to every move. There is no bypass.
- **Protected appointment.** An appointment is protected if any of these is true:
  - its local business date (Europe/Zurich) is before today;
  - its status is `completed`;
  - its ticket has an invoice with `issued_at IS NOT NULL` or a status other than draft/cancelled/void.

  Protected appointments are never changed by period or single-day actions. Historic corrections need a separate, audited process, which is out of scope here.
- **Confirmations.** Only appointments whose instructor, date or time actually changed get `instructor_confirmation = pending`.

## Architecture

```text
Scheduler / Wizard (persistent draft)
        |  invoke (staff session)
        v
Edge Function private-appointments  (requireRole office/admin)
        |  one RPC call
        v
DB function, one transaction:
  lock instructor+day -> availability check -> protection check
  -> write ticket / appointments / billing lines / participant mapping
  -> reset affected confirmations -> ticket_history audit row
  -> insert channel-neutral event in notification_queue (status pending)
        |
(after commit) existing queue workers deliver email/WhatsApp — never in the transaction
```

- **Edge Function** `private-appointments` has actions `create_booking`, `move_appointment` and `modify_period`. It validates input and calls `requireRole(['office','admin'])` from `_shared/staffAuth.ts`. It passes the verified caller id to the database function.
- **Database functions** are `SECURITY DEFINER` and executable **only by service_role**. Only the Edge Function can call them. The browser gets no new grants, anonymous access is unchanged, and existing RLS stays as it is.
- The **notification event** is a row in `notification_queue`, for example `{type:'private_appointment_changed', appointment_ids, change_kind}`. Delivery stays in the existing asynchronous workers.

## Data model (additive)
- **New table `private_appointment_participants`** (appointment_id, participant_id, attendance, created_at). It has a unique constraint on (appointment_id, participant_id). RLS: office/admin manage; teachers read their own appointments. There is no anon access.
- **New columns on `private_appointments`:** `price numeric`, `ticket_id uuid` and `status` values `scheduled|completed|cancelled`.
- **Billing line:** `ticket_items` with `appointment_id` set, `participant_id = null` and `unit_price = line_total = appointment price`. Existing columns carry date, time and instructor, so today's Scheduler and instructor views keep working. Phase 1 confirms that `participant_id` is nullable today; if not, it adds a nullable change as the only compatibility change.
- **Legacy data** (historic or ambiguous per-participant rows) stays read-only and untouched.

## Compatibility with existing readers (verified)
- **Invoice issuing.** It does not read `ticket_items`; it uses ticket totals. No change.
- **Reports** (`useReportsData.ts:599-615`). They sum `unit_price` per row, so one line per appointment gives the exact amount. No change.
- **Booking detail** (`BookingDetail.tsx:229`). Amounts are correct. Participant names are missing for a line with no participant. Minimal contained change: when `appointment_id` is set, show names from the mapping.
- **Instructor portal attendance.** It reads per-participant rows today. For appointment lines it reads and writes attendance on the mapping. This is a contained change in the attendance hook.

## Persistent draft and user experience
- **Draft.** One planning draft is kept in session storage and a shared state provider. It holds appointments (date, start, end, instructor) plus customer and participants. It survives Scheduler navigation, going back in the Wizard and conflict errors. It is cleared only when a booking is created or the user presses "Verwerfen" (discard).
- **Scheduler.** A visible toggle "Mehrere Termine auswählen", with Ctrl/Cmd+Click still working. Only free slots can be selected. The tray lists the appointments and only allows removal.
- **Wizard planning step.** Edits date, time and teacher per appointment, with a live availability check. A server conflict marks the affected row and keeps the draft.
- **Different teachers on different days** is a normal period plan. A participant split is proposed only for simultaneous overlaps.

## Migration and backfill
1. Additive schema: the new table, new columns and functions. There are no drops.
2. Dry-run and reconciliation report (read-only). It lists future private rows and classifies each one as unambiguous (one date+time+instructor+ticket group) or ambiguous. It shows totals before and after.
3. Backfill only future unambiguous groups: one appointment, one billing line at the reconciled price, and a participant mapping. Old per-participant rows are set to price 0 with an `appointment_id` and kept, so nothing is deleted. The ticket total must match before and after, or that group is skipped. The previous dry run found 0 future private rows, so this is expected to be a no-op.
4. Rollback (documented in `supabase/rollback/`):
   - switch the frontend and the Edge Function back to the previous release;
   - leave the new tables and columns unused;
   - reverse the backfill from the recorded before-values.

   There are no drops and no anon grants.

## Build phases (max four)
1. **Schema and reconciliation.** Additive migration, dry-run report, rollback file, and the pricing SQL with parity tests against `calculatePrivateLessonPrice`.
2. **Server boundary.** Database functions (create, move, modify_period) with locking, availability, protection, confirmation reset, audit and event. The `private-appointments` Edge Function with role checks. Negative tests.
3. **Creation user experience.** Persistent draft, the "Mehrere Termine auswählen" toggle, a remove-only tray, the Wizard planning editor, and `useCreateBooking` using the Edge Function for this path.
4. **Operations and readers.** Scheduler moves and period actions through the Edge Function, with the override removed and the protected-exclusion dialog added. Booking detail names and portal attendance from the mapping. Future-only backfill after review.

## Tests
- 3 participants × 4 days, 2 teachers, one day at a different time: 4 appointments, 4 lines, 12 mapping rows, each price from its own slot, and the ticket total equals the sum.
- Booking an occupied slot, or a race between two staff members: rejected, nothing written, and the draft is kept.
- Moving onto a busy slot or into an absence: rejected, with no override.
- Whole period where day 1 is past and day 2 has an issued invoice: only days 3–4 change, the dialog lists the 2 protected days, and only the changed days reset confirmation.
- Anon, a user with no role, or a teacher calling the Edge Function: 401/403. Direct RPC by an authenticated user: permission denied.
- Legacy single private lesson and group course: unchanged.
