# Phase 2 only: `private-appointments` server step and atomic operations

Scope: the server step, database transactions, the instructor confirmation extension, the audit record, the notification event, and contract tests. Not included: Scheduler, Wizard or other screens, the browser hooks, running a backfill, and publishing. Phase 1 objects are reused unchanged.

## What gets built
1. **One office/admin server step**, `private-appointments`. It checks the caller with the existing `requireRole(["office","admin"])`, validates input, then calls one database transaction per action.
2. **Transactional database functions.** They run only for the server (service role only, no browser access). Each one:
   - locks the lessons and ticket involved;
   - checks for a free slot (`pa_slot_is_free`) and for protection (`pa_is_protected`);
   - writes the lesson, its single commercial line (`pa_price`) and the recalculated ticket total;
   - resets only the confirmations it affects;
   - writes one `ticket_history` audit row and one channel-neutral `notification_queue` event (status `pending`).

   Sending the notification is not part of Phase 2.
3. **Instructor confirmation for lessons** in `set-booking-confirmation`. A new input `appointmentId` accepts or declines a lesson, but only by the instructor assigned to it. It sets the lesson and its linked line together, which the Phase 1 guard requires. The current `ticketItemId` input is unchanged.

## Contract (`POST /private-appointments`, body `{action, ...}`)
| Action | Required payload | Success 200 | Conflict 409 | Protected 423 | Auth |
|---|---|---|---|---|---|
| `create` | `submission_key`, `customer_id`, `appointments[{date,time_start,time_end,instructor_id}]` (at least 1, all future), `participants[{participant_id} or {guest_key,first_name,last_name,birth_date}]` (at least 1) | `{ticket_id, ticket_number, appointment_ids[], total}`; a repeat of the same `submission_key` returns the same result and writes nothing | `{conflicts:[{index,date,kind,ref_id}]}`, nothing written | n/a | 401 no/invalid session, 403 not office/admin |
| `move` | `appointment_id`, `date`, `time_start`, `time_end`, `instructor_id` | `{appointment, price, confirmation_reset:boolean}` | `{conflicts:[{date,kind,ref_id}]}` | `{excluded:[{id,reasons[]}]}` | same |
| `period_update` | `period_group_id`, `changes{time_start?,time_end?,instructor_id?}` | `{updated_ids[], excluded:[{id,reasons[]}]}` (only future, editable lessons) | `{conflicts:[{appointment_id,date,kind,ref_id}]}`, all or nothing | shown in `excluded` | same |

- 400 means the input failed validation, with field errors.
- 404 is a generic "not found".
- 500 never passes database error text back to the caller.
- A wizard guest becomes a `customer_participants` record exactly once per `guest_key`. If the name and birth date match an existing participant of the same customer, that participant is reused instead.

## Exact files
New:
- `supabase/migrations/<ts>_pa_phase2_tx.sql` (the timestamp is set by the tool; a header comment gives the logical name). It adds:
  - `pa_create_booking(jsonb)`, `pa_move_appointment(...)`, `pa_period_update(...)`, `pa_confirm_appointment(p_appointment uuid, p_instructor uuid, p_action text, p_reason text)`
  - a `submission_key` column on `private_appointments`, plus a unique index per ticket (additive)
  - EXECUTE granted to service_role only, and taken away from PUBLIC, anon and authenticated
- `supabase/functions/private-appointments/index.ts`
- `supabase/functions/_shared/privateAppointmentsContract.ts` (input schema and response shapes)
- `supabase/functions/private-appointments/contract.test.ts`
- `supabase/tests/private_appointments_phase2_test.sql` (one transaction that ends by rolling everything back, like Phase 1)
- `supabase/rollback/private_appointments_phase2_rollback.sql` (removes the new functions, index and column; refuses to run if any lesson uses `submission_key`)

Changed:
- `supabase/functions/set-booking-confirmation/index.ts`: adds the `appointmentId` branch only.
- `AGENTS.md`: one rule, "private-lesson changes go only through the `private-appointments` step".

## Acceptance tests
SQL test (as service role, everything rolled back):
1. `create` with 3 days and 3 instructors, 3 participants (1 guest): gives 3 lessons, 3 lines each at `pa_price` for 3 people, a ticket total equal to the sum, 3 mappings and 1 new participant.
2. The same `submission_key` again: nothing new is written.
3. `create` where one day conflicts: `conflicts[index]` is returned and 0 rows are written.
4. `move` to a free slot: the lesson and its line move together, the price is recalculated, and the confirmation goes back to pending if the time, date or instructor changed.
5. `move` to an occupied slot: a conflict is returned and nothing changes. `move` of a protected lesson: `excluded` with the reasons.
6. `period_update` with 1 past and 2 future lessons: 2 updated and 1 excluded as `past`. If one future day conflicts: none updated.
7. Every successful change writes exactly one `ticket_history` row and one `notification_queue` event. Failed changes write neither.
8. `pa_confirm_appointment`: the assigned instructor can confirm, and the lesson and line both become confirmed. Another instructor is refused.
9. Row counts are unchanged after the rollback.

Contract test (Deno, against the deployed step, synthetic data only):
- 401 without a session, 401 with the public key only, and 403 for a teacher or a signed-in user without a role.
- 400 for invalid input, and every response matches its documented shape.
- A direct call from the browser (anon or authenticated) to any `pa_*` function is refused.

`set-booking-confirmation`:
- The existing ticket-line path is unchanged (regression).
- The new lesson path only works for the assigned instructor.

Access and linter:
- No new grants for anon or signed-in users.
- The security linter shows no new findings.

## Not included
- The browser hooks (`useCreateBooking`, `usePeriodModification`) keep writing directly until the screens phase. The new step exists alongside them.
- No backfill, no notification sending, no publish.

## Open points
- The office end-to-end check needs an office test login. The contract tests use test sessions with office, teacher and no role.
- The notification event type will be named `private_appointment_changed`, with the payload `{appointment_ids, change, actor}`. Tell me if you want a different name.
