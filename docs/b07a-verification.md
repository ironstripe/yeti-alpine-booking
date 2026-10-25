# B07a – atomic multi-item office booking: verification (checkpoint 2026-10-25)

Base: HEAD `bdad341` (L1 final). Final commit: assigned after this turn.
Status: **B07a server implemented and verified on an isolated local database with the full pending chain installed together.**
Nothing installed, deployed, published or sent. No live business writes. UI lock `multiItemBlocked` unchanged (lifted only with B07b).

## Changed / new files
- `supabase/pending/b07a_office_multi_create.sql` (new, NOT installed):
  - body patch of `bc_2627_staff_group_book` (fails closed unless the B09 body is installed): when the transaction-local marker `b07a.ticket` is set, lines go onto that ticket instead of a new ticket/submission row; otherwise byte-identical behaviour.
  - table `b07a_office_submissions(submission_key, payload_digest, ticket_id, result, created_by)`, service-only, RLS on, no policies.
  - `b07a_office_multi(p, actor, mode 'quote'|'create')`, service-only, office/admin/super_admin actor check.
- `supabase/rollback/b07a_office_multi_create_rollback.sql` (new, executable).
- `supabase/pending/pa_tariff_l1.sql`: two demonstrated fixes (below).
- `supabase/rollback/pa_tariff_l1_rollback.sql`: now executable (restores pre-L1 bodies, then drops L1 objects; refuses while B07a is installed).
- `supabase/functions/office-booking/index.ts` (new staff endpoint, `requireRole(["office","admin"])`), `supabase/functions/_shared/officeBookingContract.ts`, `supabase/functions/office-booking/contract.test.ts`; `scripts/check-edge-functions.sh` default list includes `office-booking`.
- Tests: `tests/b07aMultiCreate.integration.mjs`, `tests/paTariffL1Rollback.integration.mjs`.

## Contract (`office-booking`, actions `quote` / `create`)
```text
{ submission_key, customer_id, notes?, finalization?, group_discount?: {percent, reason},
  participants: [ {ref, participant_id} | {ref, guest:{first_name, last_name?, birth_date, sport?, level?}} ],
  items: [ {kind:'private', product_id, participants:[ref], discount_override?,
            appointments:[{date, time_start, time_end, instructor_id | assign_later:true, meeting_point?, participants?:[ref]}]},
           {kind:'group', lines:[{participant: ref, course_id, product_id, dates, block?, sport?, meeting_point?,
            lunch_dates?, vegetarian?, lunch_product_id?, expected_unit_price?}]} ],
  create only: confirmation_requested (boolean), acknowledged_quote_digest (md5) }
quote  -> {quote:{lines[], private[], total, tariff_revisions, discount_rule_revision, day_context_digest, quote_digest}}
create -> {ticket_id, ticket_number, total, appointment_ids, participant_ids{ref:uuid}, quote_digest, confirmation_requested, replayed?}
errors -> invalid{field, ref, item, index} | conflict | quote_changed{quote} | submission_mismatch | tariff_unavailable | forbidden | not_found
```
Rules implemented:
- One ticket, all items or none: guests, ticket, appointments, participants, pricing rows, group lines/enrollments/instance counts, lunch lines, payment (paid now), comments, B05 intent, B11 event and the submission row are one subtransaction.
- Each person once per cart (ref); the same saved person under two refs, or a guest that resolves to a saved person already in the cart, is rejected. Guest resolution = the private single-item rule (customer + name + birth date, else one new row).
- Private: per item one `pa_price_request` call (product rules, office channel); every other cart slot (other items) plus the booked participant/day context is passed as price-0 minutes, so the same-day discount is order-independent. Per-slot people allowed (subset of the item). Manual override per item replaces automatic (explicit 0 included). Guests: cart minutes only, no history (same as the single quote).
- Group: all group lines in ONE `bc_2627_staff_group_book` call (same tiers, B09 season lunch, course/instance locks, B10 checks). One group discount for all group lines (mixed group discounts are not expressible; fail closed).
- Quote = the same code path executed and rolled back (no separate preview resolver). Create recomputes under the locks and requires the identical digest (lines, total, revisions, day context), else `quote_changed` with the fresh quote and nothing written.
- Lock order: submission key, tariff + discount revisions (SHARE), teacher slots, participant days, counted appointments (SHARE), courses/instances (inside group booking), new ticket. No provider/e-mail call inside.
- Same person overlapping in the cart (private/private or private/group) is rejected; adjacency is fine. Teacher overlap inside the cart and with stored bookings is a conflict.
- Replay: same key + same payload (digest excludes only `acknowledged_quote_digest`) returns the stored result with the first confirmation choice; same key + other payload = `submission_mismatch`.
- B10: `participant_count` = distinct people of the whole ticket. B11: one `created` event for all private lessons; `ticket_total_after_create` = whole booking total. B02: due date via `staff_booking_finalize`.
- Single-item contracts unchanged: `pa_create_booking(_finalized)`, `b05_office_create`, `bc_2627_staff_group_book` without marker, B03a/L1 edit/move.

## L1 review (demonstrated issues, fixed)
1. **Participant UPDATE guard gap:** the transition trigger on `private_appointment_participants` fired only on INSERT/DELETE, and the office RLS policy allows direct table writes, so `UPDATE … SET participant_id = <other>` re-pointed a tariff-priced lesson without requote. Shown on `bdad341` (test failed: no rejection). Fix: trigger also on `UPDATE OF appointment_id, participant_id`; re-pointing a row of a tariff-priced lesson raises YT001; attendance updates stay allowed.
2. **period_update stale target locks:** slot/day locks were taken from an unlocked read; a concurrent move of one lesson to another date was not detected after locking (only ids/people were re-checked), so the update ran on a date whose slot/day locks it did not hold. Shown on `bdad341` (returned ok). Fix: (id, date, teacher) signature re-checked under lock; mismatch = `stale`, nothing written.
- Checked, no change needed: `pa_move_appointment` locks the target slot from its parameters and re-checks date + people under lock; `pa_edit_booking` rejects any stored date/people change via the per-lesson `expected` state.

## Tests actually run (local PostgreSQL 127.0.0.1:55432, synthetic data only)
Chain installed together for B07a tests (29 files): baseline prelude + production baseline + `drizzle/migrations` 0000–0015 + `b04_delivery_compatibility`, `b06_invoice_delivery`, `b11_created_total_event`, `participant_birth_date_guard`, `group_lunch_full_day`, `group_lunch_season`, `pa_edit_booking`, `b05_office_confirmation_intent`, `product_private_tariff_rules`, `pa_tariff_l1`, `b07a_office_multi_create`.
```text
BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/b07aMultiCreate.integration.mjs      19/19
  grants/forbidden; quote dry run writes nothing; private+private across products (342, order-independent);
  Anna/Ben partial rebate (218.50 + 171 = 389.50); per-slot people; manual 0 vs automatic; cross-booking context,
  earlier booking unchanged; same-person overlap private/private and private/group; group+private (530, lunch B09,
  10 enrollments, no nested group submission); group+group = single-path total; shared draft guest one row, level
  check; final-position errors (group meeting point, hotel partner, future DOB, half-day lunch) roll back every
  table; paid-now payment + intent; stale day context and tariff revision => quote_changed; concurrent + lost-response
  replay, submission_mismatch; multi vs single create day lock; two carts same teacher slot; single group path +
  marker isolation; L1 fix participant UPDATE; L1 fix period stale.
  Same suite with bdad341 pa_tariff_l1.sql: 17/19 (exactly the two L1 fix tests fail) => issues demonstrated.
bun tests/paTariffL1Rollback.integration.mjs   4/4 (L1 rollback refuses while B07a installed; B07a rollback; L1 rollback
  restores bodies/trigger/grants, every row unchanged; afterwards B07-P behaviour: teacher move ok, time move YT001)
Regressions: paTariffL1 17/17, paEditBooking 17/17, b07CrossBookingDiscount 12/12, b07DiscountPricing 13/13,
  productPrivateTariffRules 13/13, b11CreatedTotal 5/5, b05Intent 7/0, birthDateGuard 5/5, paAssignLater 16/0,
  publicPrivateTariffProjection 12/12, staffFinalize 14/14, saturdaySelection 7/7, productDelete 9/9, courseArchive 19/19
deno test --node-modules-dir=none --allow-env --allow-read supabase/functions/office-booking/contract.test.ts   5/5
deno check --node-modules-dir=none office-booking/index.ts private-appointments/index.ts   clean
```
Not run: hosted backend, deployed `office-booking`, browser UI (no UI change), B04/B05/B06 delivery suites against this chain.

## Remaining limits / prerequisites
- Install only in the coordinated B07 release (manifest group 2) after B07b; requires B04+B05 objects (checked before any write) and L1.
- One group discount per cart; mixed group discounts are refused rather than split (splitting would change tier counts).
- A draft guest matched by name/birth date to an existing saved person gets no same-day history (unchanged single-item rule).
- Product mapping: tariffs must be configured per verified 26/27 Ski/Snowboard private product; products without a tariff revision return `tariff_unavailable` (no fabricated rate). See manifest.

## Rollback
`b07a_office_multi_create_rollback.sql` first (export `b07a_office_submissions`), then optionally `pa_tariff_l1_rollback.sql`. Bookings created stay ordinary bookings.
