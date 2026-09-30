# Consolidated plan: multi-date private lessons on canonical appointments

This one plan covers the whole scheduling request: goal, constraints 1–9, pricing, protection, guests, payroll, the server boundary, the multi-select screens, migration and rollback, and the build phases. Phase 1 is live but not published. Nothing below gets built until you approve it.

## 1. Goal
One private booking (one `ticket`) can hold several future lessons on different days. Each lesson has its own date, start and end time, and instructor. Each real lesson exists exactly once as a `private_appointments` row. That row is what the Scheduler, pricing, confirmation, payroll and notifications all work from. Tickets, invoices, group courses, checkout, payments, office shifts and legacy single private lessons stay as they are.

## 2. Non-negotiable rules (as agreed)
1. Existing booking flows stay the same unless the new path strictly needs a change.
2. A booking is one ticket. Several `ticket_items` never mean several bookings.
3. A real lesson exists once, even with several participants. Participants are stored in `private_appointment_participants`.
4. Each lesson is priced once, from its real date, time and participant count. The group price is never multiplied by the number of people. The ticket total is exactly the sum of the lesson lines.
5. New bookings may only use free slots. Moving a lesson requires a fully free target slot. There is no way to override a conflict.
6. Whole-period actions change only future lessons that can still be edited. Protected lessons are listed as exclusions. Historical correction is a separate future process.
7. A Scheduler change resets only the confirmations it affects. It records an audit entry and one channel-neutral communication event. Email, WhatsApp or voice delivery happens later, outside the transaction, and scheduling rules are not repeated per channel.
8. All visible text is German, using the existing React/Tailwind/shadcn patterns.
9. All staff changes go through the existing staff-authorized server step (`requireRole` office/admin). There is no new public access and no weaker access rules.

## 3. Data model (Phase 1, live)
- `private_appointments`: one row per real lesson. It holds ticket_id, date, times, instructor_id, status (scheduled/booked/completed/cancelled), price, instructor_confirmation, confirmed_at/by, meeting_point, period_group_id.
- `private_appointment_participants`: appointment + participant (required), attendance present/absent.
- `ticket_items.appointment_id`: exactly one commercial line per lesson (participant_id null, unit_price = the lesson price).
- `private_appointment_backfill_log`: server-only record of state before any backfill, used for rollback.
- Server-only helpers: `pa_business_today`, `pa_price`, `pa_is_protected`, `pa_slot_conflicts`, `pa_slot_is_free`, `pa_reconcile_report`.
- Guard trigger `trg_pa_ticket_item_guard`: a linked line must match its lesson and can only be confirmed through a confirmed lesson.

## 4. Pricing
`pa_price` is the only price used when saving. It follows the rate for each whole hour, adds 20 per extra person per hour, and counts 1–4 people (fewer or more are clamped to that range). Zero or invalid lengths cost 0. The app's price function is used only for preview. The live SQL test checks that `pa_price` matches the current rates.

## 5. Protection
A lesson is protected when its local business date is before today, OR its status is completed, OR the ticket's invoice is issued (issued_at set, or status other than draft/cancelled/void). Protected lessons are never changed and are reported back as `{id, reasons[]}`.

## 6. Guests
When a booking is created, each wizard guest is saved as a real `customer_participants` record in the same transaction. Each guest gets a `guest_key` from the client, so one key always gives exactly one participant. A resubmit with the same submission key creates nothing new. A guest whose name and birth date match an existing participant of the same customer is linked to that participant instead of duplicated.

## 7. Payroll and confirmation
Hours count once per lesson line, and only when the instructor confirmed that lesson. Confirmation happens only through `set-booking-confirmation`, which checks the instructor's own session and is extended for lessons. Moving a lesson or changing its instructor resets its confirmation to pending. Attendance is recorded per participant and never creates hours. A confirmed lesson counts even if every participant was absent (24h rule).

## 8. Server step (Edge Function `private-appointments`, office/admin)
| Action | Payload | Success | Conflict | Protected | Auth |
|---|---|---|---|---|---|
| `create` | customer, submission_key, appointments[{date,start,end,instructor_id}], participants[{participant_id or guest}] | `{ticket_id, appointment_ids, total}` | `409 {conflicts:[{index,date,kind,ref_id}]}` | n/a | `401/403` |
| `move` | appointment_id, date, start, end, instructor_id | `{appointment, confirmation_reset}` | `409 {conflicts}` | `423 {excluded:[{id,reasons}]}` | `401/403` |
| `period_update` | period_group_id, changes | `{updated_ids, excluded:[{id,reasons}]}` | `409` per day | listed in excluded | `401/403` |
| `set_participants` | appointment_id, participants[] | `{appointment, price}` | n/a | `423` | `401/403` |
| `cancel` | appointment_ids[] | `{cancelled_ids, excluded}` | n/a | `423` | `401/403` |

Each action runs as one database transaction: lock, check free slot, write lesson + commercial line + ticket total, reset only the affected confirmations, write the audit entry, then insert a notification event (`notification_queue`). Delivery happens outside the transaction.

## 9. Screens (German)
- Scheduler and the wizard's mini-scheduler: a visible "Mehrere Termine auswählen" toggle, plus Ctrl/Cmd+Click.
- A saved draft that survives Scheduler navigation, going back in the wizard, and conflicts.
- The tray can only remove selections.
- The wizard's planning step edits the date, time and instructor for each day. A different instructor on each day is normal and never splits participants into groups.
- The Scheduler shows one block per lesson, with participants listed inside.

## 10. Existing code that must move (found in this review)
Earlier stages added direct browser writes that break rule 9:
- `useCreateBooking.ts:702` inserts into `private_appointments` directly.
- `usePeriodModification.ts:67/127` calls `update_private_appointment` and writes `private_appointments` directly. Nobody is currently allowed to run `update_private_appointment`, so that path already fails.

There are 0 lessons stored, so no data is affected. In Phase 2 both paths move behind the server step.

## 11. Migration, backfill, rollback
- Only additive changes. The dry run (`pa_reconcile_report`) comes first and shows each ticket's before/after total with a skip reason.
- Backfill only lessons that are future, unambiguous, scheduled and not invoiced. Any mismatch means no change.
- Before-values are recorded in the backfill log. Historic or ambiguous legacy rows stay read-only.
- Today: 4 legacy bookings, all past, so there is nothing to backfill.
- Phase 1 rollback: `supabase/rollback/private_appointments_phase1_rollback.sql`. Each later phase gets its own rollback.

## 12. Build phases (each approved separately)
1. **Done:** schema, helpers, guard, access rules, rollback, SQL test and price tests.
2. **Server step and confirmation:**
   - `supabase/functions/private-appointments/index.ts` + `_shared/privateAppointments.ts`
   - migration `pa_phase2_tx_functions` (transactional create/move/period/cancel, service-role only)
   - `set-booking-confirmation` extended with `confirm_private_appointment`
   - move `useCreateBooking` and `usePeriodModification` onto the server step
   - tests `private-appointments/index.test.ts`, `supabase/tests/private_appointments_phase2_test.sql`
3. **Screens:** multi-select toggle, saved draft, tray, wizard planning step, Scheduler blocks and exclusion notice.
4. **Backfill and notifications:** dry-run report review, then (only if you confirm) backfill of qualifying lessons; delivery worker reads events; payroll view reads lesson lines.

## 13. Acceptance per phase
- Build passes, tests pass, access checks run anonymously and as each role, and counts are compared before and after.
- No publishing without your explicit release confirmation.
- Every check is run once end to end with an office login. We don't have one yet, and that is an open blocker.

## Open questions before any build
- Phase 2 needs an office test login for the end-to-end check.
- Constraint 9 was cut off mid-sentence. Section 8 assumes it means "the existing `requireRole` office/admin Edge Function pattern".
