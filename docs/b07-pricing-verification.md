# B07 L1 — move / period_update / B03a edit of tariff-priced lessons (checkpoint 4)

Base: `fbf40eb`. Status: **implemented in code + pending SQL, tested only on a private local test database.** Nothing was installed, deployed or published; `PRODUCT_PRIVATE_TARIFFS_LIVE` stays OFF. B07a (atomic multi-item) and B07b (UI) are still open.

## What changed
- New `supabase/pending/pa_tariff_l1.sql`. It needs `pa_edit_booking.sql` and `product_private_tariff_rules.sql` installed first, and replaces `pa_apply_slot`, `pa_tariff_transition_guard`, `pa_edit_booking`, `pa_move_appointment` and `pa_period_update`. The old signatures stay as wrappers. New overloads take `p_ack jsonb`. New helpers: `pa_lock_days`, `pa_l1_requote`, `pa_l1_write_pricing`, `pa_l1_line_net`. All are service-role only.
- `product_private_tariff_rules.sql`, edited in place (still uninstalled):
  - `private_appointment_pricing` gains `priced_date/time_start/time_end`, `participant_ids`, `discount_reason` and `updated_at`;
  - create writes them;
  - `pa_private_day_context` gets a 3-arg form with `p_exclude`; the 2-arg form delegates to it.
- **When a lesson is requoted:** only when its date/time changes (move or period change) or its participant set changes (edit).
  - It uses the same `pa_price_request` (office channel) with the lesson's stored discount intent. A manual override, including explicit 0, is re-applied and replaces the automatic discount. Otherwise the automatic discount applies, with the same-person/same-day context: other valid bookings plus the other changed lessons' NEW state, overlapping intervals united, and the changed lessons' old state excluded.
  - Teacher-only changes, notes, meeting point and unchanged saves never reprice and never touch the total.
- **Acknowledgement:**
  - Move and period change: if gross or discount changes, the server answers `quote_changed` with the quote (lines old → new, totals, `quote_digest`). The client asks once (`withPriceAck`, German confirm text) and re-sends `acknowledged_quote_digest`. Same-price moves need no acknowledgement.
  - Edit: still needs `acknowledged_price` + `acknowledged_total`, plus `acknowledged_quote_digest` when tariff-priced lessons are requoted. The digest covers tariff revision, discount-rule revision and day context, so any change after the quote → `quote_changed`, nothing written.
- **Total:** only the net delta of the changed lines is applied. Other lessons, other bookings, invoices and payments are never repriced. The history event (`moved` / `period_updated` / `edited`) carries a `pricing` record with before/after values plus old/new totals.
- **Locks:** global order is teacher slot < (participant, date) day lock (same key as create) < ticket < appointment rows. Legacy (non-tariff) moves and edits now take the day locks too; their `pa_price` pricing is unchanged. Move and period update re-check participants and date under the lock; a change in between → `conflict` / `stale`.
- **Guard:** still installed. A price, time or participant write on a tariff-priced lesson is accepted only if it matches the server-written pricing row, which only the service role can write. Raw table writes still fail with YT001.
- **Protection:** past, completed and invoiced lessons are still refused (`pa_is_protected`).
- **Edge function and client:**
  - Edge contract: optional md5 `acknowledged_quote_digest` on move, period_update and edit. `p_ack` is sent only when present. If the server doesn't have L1 → 503 `unavailable`, nothing written.
  - Client: `src/lib/privateMoveQuote.ts`, `withPriceAck` in `privateAppointmentsApi.ts`, digest passed in `buildEditRequest`.

## Tests run (local private test database built from the production schema; synthetic data)
- New `tests/paTariffL1.integration.mjs`, 17/17:
  - grants;
  - teacher-only move keeps everything;
  - 10–12 → 12–14 refused without or with a wrong ack, nothing written; with ack: 150, pricing row and history before/after;
  - same-price date move without ack;
  - move onto Anna's other-booking day → 171 on the moved line only, the other booking byte-identical; moving away → 190, the other booking still unchanged;
  - stale ack after a new same-day booking (→ 135 quoted) and after a tariff revision (→ 160) → `quote_changed`, nothing written;
  - manual 0 override kept on move;
  - period 2-day 10–12 → 12–14 with one ack → 300; then teacher-only via the 3-arg form → unchanged;
  - edit add Ben → 230: refused without digest, ok with it; pricing participants updated;
  - note-only and no-op edits keep the price;
  - raw writes (price / time / participant insert / participant delete) → YT001;
  - invoiced ticket → `protected`, byte-identical;
  - legacy lesson move unchanged (`pa_price` 240, full recalc);
  - concurrent create waits for an in-flight move onto the same person/day, then `quote_changed`;
  - concurrent edit waits for an in-flight create, then `quote_changed` with a lower fresh quote;
  - concurrent move A + edit B in the same ticket: no deadlock.
- **Regressions:** b07CrossBookingDiscount 12/12, b07DiscountPricing 13/13, productPrivateTariffRules 13/13, paEditBooking 17/17, b11CreatedTotal 5/5, publicPrivateTariffProjection 12/12, paAssignLater 16/16.
- **With L1 installed and a legacy create:** paEditBooking 17/17 and paAssignLater 16/16, both via temporary copies.
- **Unit and contract tests:** bun `privateMoveQuote.test.ts` 5/5, `canonicalPrivateEdit.test.ts` 9/9; Deno contract schema tests 6/6; `deno check` on `private-appointments/index.ts` clean.
- **Not run:** browser test of the confirm dialog, hosted backend, deployed function, `pa_tariff_l1_rollback.sql`, and the B04/B05/B06/B09 pending files together with L1 in one database.

## Remaining limits (technical)
- Sibling lessons of the same ticket are context only. Moving one lesson away can leave a sibling's earlier same-day discount in place (never retroactively changed; manual correction stays the existing workflow).
- The move/period confirmation is a plain browser confirm with the server's numbers; B07b should replace it with the summary-style dialog.
- Guests matched by name still get no day-context credit (stable ids only).
- With the B07 SQL installed but the old client, creates fail (`invalid quote_revision`). Moves and edits from the old client still work and ask for the price acknowledgement: the old client sees `quote_changed` and cannot confirm, so nothing is saved. Coordinated release only; see `docs/b01-b11-install-manifest.md`.
- Rollback restores need the production bodies re-created as `CREATE OR REPLACE` (the baseline file uses `CREATE`).

---

# B07-P3 — cross-booking same-participant/same-day discount (checkpoint 3)

Base: `1f4e112` (HEAD at start). Final SHA is assigned by the platform after this turn; it is not available inside the turn.
Status: **implemented in code + pending SQL, tested locally only.** Not installed, not deployed, not published; `PRODUCT_PRIVATE_TARIFFS_LIVE` stays OFF.
B07 is **not done**: L1 move/edit resolver transition, B07a atomic multi-item and B07b UI remain open.

## Decision applied (Ivo, 2026-10-25)
"Rabatt gilt für 4 std. pro teilnehmer am gleichen tag." A new booking counts the same participant's already booked private lessons on the same date; only the NEW lesson shares are discounted. Earlier bookings, invoices and payments are never repriced; corrections stay the existing manual workflow (no automatic credits/refunds).

## Model (extends `supabase/pending/product_private_tariff_rules.sql` in place; same resolver, no second engine)
- `pa_private_day_context(participant_ids uuid[], dates date[])` (service-only, STABLE): one entry per canonical appointment with its counted participants, plus an md5 `digest`. Counts only `private_appointments.status IN (scheduled, booked, completed)`, ticket status not `draft/cancelled/storno/expired`, linked billing line not `cancelled`. Group courses/lunch are never private appointments, so never counted. Indexed via `idx_pap_participant` + date filter; returns no PII beyond the supplied ids.
- `pa_price_request(..., p_context jsonb)` (new 5-arg overload; the 4-arg form delegates with empty context): context slots carry price 0 → they add minutes but are never priced, discounted or returned.
- `pa_same_day_discount`: day minutes are now the **union** of a person's intervals (overlaps/duplicate rows cannot inflate eligibility; adjacent blocks still add up: 10–12 + 14–16 = 240).
- `pa_create_quote`: optional `customer_id` + `participant_ids` (must all belong to that customer, no duplicates, ≤ persons). Returns `day_context_digest`, `existing_appointments`.
- `pa_create_booking`: requires `day_context_digest`. After participant resolution it takes sorted advisory locks per (participant, date), locks the counted appointments `FOR SHARE` (blocks a concurrent cancellation until commit), re-reads the context; mismatch → `quote_changed` / `reason: day_context`, everything (incl. guests) rolled back. Replay by submission key is checked first and returns the first result unchanged. History event `created` adds `existing_same_day_appointments`.
- Identity: only stable participant ids count. A guest that the create matches to an existing person by name/birth date gets **no** history credit (the quote could not have known it) — this keeps quote and create identical and avoids inventing identity matches.
- Frontend: summary sends payer + saved participant ids, shows "bereits gebuchte Privatlektion(en) mitgezählt", create sends the shown digest; on `quote_changed` the quote is refetched and the office must submit again. Edge contract accepts the new optional fields (hex digest).

## Tests (local throwaway PostgreSQL from production baseline; no live data)
- New `tests/b07CrossBookingDiscount.integration.mjs` 12/12: grants; separate 2h + new 2h → 19.00 on the new line only, ticket 1 byte-identical (ticket, lines, appointments, pricing, history, payments, invoices); different dates / different people not summed; cancelled appointment, cancelled line, draft and cancelled ticket not counted (and counted again when confirmed); shared 230 with Anna 2h elsewhere → 11.50 off, 218.50, order-invariant, one context slot per shared appointment; manual 5 % and explicit 0 replace cross-booking automatic, reason required; overlapping existing lessons counted as union (3h, not 5h); duplicate joins impossible by constraint; stale quote after another booking or a cancellation → `quote_changed`, no rows; stale attempt rolls back new guests; replay unchanged after context change; competing creates: second blocks, then `quote_changed`, first never mutated; foreign/duplicate ids rejected, name-matched guest gets no credit.
- Updated helpers (compute current digest) in `b07DiscountPricing.integration.mjs` 13/13 and `productPrivateTariffRules.integration.mjs` 13/13.
- Regressions: paEditBooking 17/17, b11CreatedTotal 5/5, b05Intent 7/0, birthDateGuard 5/5, staffFinalize 14/14. Rollback file executed after install: new functions removed.
- Edge contract (Deno) offline schema tests pass. Bun `src tests`: all pass except the pre-existing Deno-only load error; typecheck clean.
- Browser `b07PricingSummaryBrowser.py` (intercepted, 1280 + 390): 0 failures; create carries the shown digest; guest-only booking sends no participant ids and shows no note. **Not browser-tested:** a saved participant with real earlier lessons (covered only in SQL tests).

## Limits (technical, not business questions)
- (Superseded by L1 above: moves/edits now take the same day locks; tariff-priced lessons are requoted instead of refused.)
- Cancelling an earlier lesson after a discounted later booking committed does not reprice the later booking (decided: no retroactive mutation).
- Guests matched by name are not credited (see Identity). If Office wants credit, the person must be selected as saved participant.
- `attendance = 'absent'` on a booked lesson still counts (booked planning hours, existing semantics).

## Release / rollback
Unchanged order (each step needs approval): install pending file → seed reviewed rules → deploy `private-appointments` + `product-private-tariff-rules` → switch ON + publish. Rollback file now also drops `pa_private_day_context` and the 5-arg `pa_price_request`; stored prices/discounts/history are never recalculated.

## Next handoff
- L1: done in checkpoint 4 (see top).
- B07a: one service-only transaction for mixed cart items; call `pa_price_request` once over all proposed private slots with per-slot participant ids **plus** `pa_private_day_context` for all known ids/dates; same revision + digest binding and lock order (key → teacher slots → participant/day).
- B07b: lift the multi-item gate only after B07a; one combined server quote.

---

# B07-P2 — authoritative quote + same-day discount + manual override (checkpoint 2)

Base: `b0095b0` (HEAD at start of this checkpoint; final commit SHA is assigned by the platform after this turn).
Status: **implemented in code + pending SQL, tested locally only.** Not installed, not deployed, not published; switches OFF.
B07a (atomic multi-item) and B07b (multi-item UI) remain **incomplete**.

## Decisions applied (ivo-brain DECISIONS, 2026-10-25)
- Exact double lessons 10–12 = 190, 14–16 = 190, 12–14 = 150; exceptions 09–11 / 13–15 = 160 (configured `office_only`, no public expansion); 75/h off-peak; 85/h single-hour office exception in 10–12 / 14–16; +20/h, +40/double per extra person. Values exist only in the PROPOSED seed and test fixtures.
- Automatic 10 % when the same participant has >= 240 planned clock minutes on the same date (two doubles = 240, not 230). Never pooled across people or dates.
- Shared lesson: equal share per actual participant for the discount only; e.g. 230 shared, Anna eligible, Ben not → 11.50 off → 218.50. Order-invariant. One appointment + one billing line.
- Explicit manual discount REPLACES the automatic one for the affected lines (never added). Default 0 = automatic; explicit 0 = `discount_override:{percent:0,reason}`; clearing returns to automatic. Reuses the existing wizard discount field + reason; legacy non-zero `discount_percent` is treated as explicit.

## Model (pending `supabase/pending/product_private_tariff_rules.sql`, extended in place)
- `private_lesson_discount_rule` (singleton: percent, threshold_minutes, scope, shared_allocation, auto-bumped revision, provenance). Missing → `tariff_unavailable/discount_rule_not_configured` (fail closed).
- `pa_same_day_discount` (pure), `pa_discount_intent`, `pa_price_request` (single price+discount source), used by `pa_create_quote` and `pa_create_booking`.
- Create requires `quote_revision` **and** `discount_rule_revision` (both `FOR SHARE`); mismatch → `quote_changed`, nothing written.
- Line storage: `unit_price` = product tariff; `discount_percent` = discount_amount/price·100 (amount rounded to 0.01 per line); `discount_reason` = automatic text or manual reason. `private_appointment_pricing` stores provenance (revisions, gross, source none/automatic/manual, amount, persons, eligible). History event `created` adds `discount_source`, `discount_total`.
- Precision: line_total stays the existing generated column. For non-terminating shares (e.g. 3 people) line_total can carry a sub-rappen residue (< 1e-15 CHF); displays round to 0.01. Rounding to 0.05 is not applied (existing policy unchanged).

## Eligibility scope (reported, not invented)
Only slots of the same request count. Single-item create gives every person every slot, so all-or-none within one booking; partial eligibility (Anna/Ben) arises in B07a per-slot participants and is already supported by `pa_price_request`.
**Open case for Ivo:** Anna books 10–12 Monday (ticket 1), later 14–16 Monday (ticket 2). Today: no discount on either; ticket 1 is never repriced. Whether ticket 2 should get the discount is undecided.

## L1 controlled transition (move/edit)
Appointments with a `private_appointment_pricing` row: `pa_apply_slot` keeps the stored price on teacher-only changes; date/time moves, participant insert/delete and line price/discount writes raise SQLSTATE `YT001` (whole transaction rolled back) → Edge 409 `tariff_transition_required` with German message. Notes, meeting point, confirmation, status, teacher stay editable. Legacy appointments keep the old `pa_price` behaviour; unchanged-save no-op and issued-invoice protection untouched. Next: switch move/period_update/B03a edit to `pa_price_request` (requote + acknowledgement), then remove the guard.

## L2 frontend
Summary (`PrivateServerQuote`) shows only the server quote: per-lesson price, automatic or manual discount, replaced automatic amount, total; submit disabled while quoting/failed; create binds to the shown revisions, never re-quotes silently. `privateTariffsLive()` = `PRODUCT_PRIVATE_TARIFFS_LIVE` (false) or, on the local dev server only, localStorage `yeti.privateTariffPreview=1` (for intercepted tests). Switch OFF → old request unchanged.

## Files (this checkpoint)
`supabase/pending/product_private_tariff_rules.sql`, `..._seed.PROPOSED.sql`, `supabase/rollback/product_private_tariff_rules_rollback.sql`, `supabase/functions/_shared/privateAppointmentsContract.ts`, `supabase/functions/private-appointments/index.ts` + `contract.test.ts`, `src/lib/serverPrivateSlots.ts` (new), `src/components/bookings/wizard/PrivateServerQuote.tsx` (new), `Step4Summary.tsx`, `DiscountSection.tsx`, `src/hooks/useCreateBooking.ts`, `src/contexts/BookingWizardContext.tsx`, `src/lib/privateAppointmentsApi.ts`, `src/lib/privateTariffRules.ts`; tests `tests/b07DiscountPricing.integration.mjs`, `tests/b07PricingSummaryBrowser.py`, `tests/b07TariffEditorBrowser.py`, `tests/b07DiscountIntent.test.ts`, updated `tests/productPrivateTariffRules.integration.mjs`.

## Tests run (local only)
- `b07DiscountPricing.integration.mjs` 13/13: grants; decided blocks from config; Anna/Ben 218.50; order invariance; all/none/different dates/240-min doubles; manual lower/higher/0/clear/combined-rejected; create = quote with provenance + history; explicit 0 stored with reason; default single item no discount; rule revision A→B without code, stale → quote_changed, old booking unchanged; product revision; transition guard; legacy move unchanged.
- `productPrivateTariffRules.integration.mjs` 13/13 (one assertion now expects the automatic discount on a 4h day: gross 500 → 466).
- Regressions: paAssignLater 16, paEditBooking 17/17, staffFinalize 14/14, b05Intent 7, b11CreatedTotal 5/5, productPrivateTariffs 12/12, birthDateGuard 5/5.
- Seed + rollback executed on throwaway DB (9 rules, rule rev 1; rollback drops functions, keeps tables).
- Deno contract schema tests 5/5. bun suite 378 pass, 3 skip, 1 pre-existing Deno-only load error.
- Browser (real components, all requests intercepted, 1280 + 390): summary 12/12 checks each width; editor 6/6 each width; B01/B02 checkoutPersistenceBrowser unchanged (0 failures).
- Not run: hosted backend, deployed functions, combined install with B08/B09/B11 pending files in one DB.

## Release order (each step needs explicit approval)
1. Install `product_private_tariff_rules.sql`. 2. Seed reviewed rules per active private product + discount rule; coverage query empty. 3. Deploy `private-appointments` + `product-private-tariff-rules`. 4. Set `PRODUCT_PRIVATE_TARIFFS_LIVE=true` + publish. Move/edit of new bookings stay limited by the guard until L1 is completed.

## Rollback
Switch OFF + republish → previous `private-appointments` → 0007 `pa_create_booking`, 0001 `pa_apply_slot` → rollback file (drops triggers/functions; keeps rule, discount and provenance tables). Stored prices/discounts never recalculated.

## Next handoff
- B07a: one service-only transaction for mixed cart items calling `pa_price_request` once over ALL private slots with per-slot participant ids (aggregates person/day across items); group/lunch lines excluded from hours; same revisions; replay key.
- B07b: lift the multi-item gate in Step4Summary only after B07a; show one combined server quote.

---

# B07-P — product-configured private tariffs (prerequisite checkpoint)

Base: `932562cb7d6c8e05440e6d2c2f38b168c0cf7510` (HEAD at start; final commit SHA is assigned by the platform after this turn).
Status: **implemented in code + pending SQL, tested locally only.** Not installed, not deployed, not published, switch OFF.
B07a (atomic multi-item) and B07b (UI) remain **incomplete**.

## Decisions applied (Ivo, 2026-10-25)
- 75/h outside rush; 85/h rush (10–12, 14–16) only as permitted single-hour office exception.
- 10–12 double lesson = 190 as an **exact block** (not 2×85, no 95/h).
- All values are configuration rows; no price constant exists in runtime code or SQL logic. 190/85/75 appear only in the test fixture and the PROPOSED seed.

## Model
`product_private_tariff_rules` (per product): `exact_block` (exact start+end) or `hourly` (per whole hour inside window), `price_chf` (1 person), `extra_person_chf`, `max_persons`, `max_block_minutes` (hourly only), `office_only`, mandatory `provenance`.
`product_private_tariff_revisions`: revision per product, bumped on every save.

Resolver `pa_product_quote` (single source): exact match wins; otherwise each hour needs exactly one hourly rule; checks max duration, office-only, persons. Errors → `tariff_unavailable` with reason (`not_configured`, `no_rule`, `ambiguous`, `block_not_allowed`, `office_only`, `persons_exceeded`). No fallback to `pa_price`/`private_lesson_rates`, never 0.
- Preview: `pa_create_quote` → `private-appointments` action `quote`.
- Create: `pa_create_booking` (0007 body + resolver) requires `quote_revision`; row lock `FOR SHARE` on the revision; mismatch → `quote_changed` (409), nothing written; tariff failure rolls back guest participants (subtransaction). Replays return the stored result unchanged.
- Save: `save_product_private_tariff_rules` (service-only, revision-checked, replace-all, overlap/duplicate rejection) via new Edge Function `product-private-tariff-rules` (office/admin).

## Changed / added files
- `supabase/pending/product_private_tariff_rules.sql` (new, NOT installed)
- `supabase/pending/product_private_tariff_rules_seed.PROPOSED.sql` (new, NOT installed; requires reviewed product id + extra-person values, no defaults)
- `supabase/rollback/product_private_tariff_rules_rollback.sql` (new)
- `supabase/functions/_shared/privateAppointmentsContract.ts` (`quote` action, `quote_revision`, 422 mapping)
- `supabase/functions/private-appointments/index.ts` (`quote` → `pa_create_quote`)
- `supabase/functions/product-private-tariff-rules/index.ts`, `supabase/functions/_shared/privateTariffRulesContract.ts` (new)
- `src/lib/privateTariffRules.ts`, `src/hooks/usePrivateTariffRules.ts`, `src/components/settings/PrivateTariffRulesEditor.tsx` (new)
- `src/lib/privateAppointmentsApi.ts` (`paCreateQuote`, message for `tariff_unavailable`)
- `src/hooks/useCreateBooking.ts` (quote+revision only when `PRODUCT_PRIVATE_TARIFFS_LIVE`; OFF → unchanged request)
- `src/components/settings/ProductFormModal.tsx` (rules editor behind existing `PRIVATE_TARIFF_EDITOR_ENABLED=false`)
- Tests: `tests/productPrivateTariffRules.integration.mjs`, `tests/privateTariffRules.test.ts`, `supabase/functions/_shared/privateTariffRulesContract.test.ts`

## Tests (local throwaway PostgreSQL 17, baseline + 0001/0002/0003/0005/0006/0007 + B07-P)
- `productPrivateTariffRules.integration.mjs` **13/13**: grants; unconfigured → unavailable, nothing written; save/stale revision; invalid configs atomic; preview A 75 / 85 / exact 190 / 150 and 2-person config surcharge; 14–16 double, 11–13 cross-window, 10:30, 16–17, 5 persons fail closed; public channel `office_only`; real create stores preview prices with assign-later slot and canonical participants; missing/stale `quote_revision`; rollback of guests on tariff failure; editing A changes new quote/create, B and existing booking unchanged; replay after config change; ownership/conflict guards; concurrent save waits for in-flight create.
- `privateTariffRules.test.ts` 5/5; Deno contract test 3/3.
- Regressions: paAssignLater 16/16, staffFinalize 14/14, paEditBooking 17/17, b05Intent 7/7, productPrivateTariffs 12/12; bun privateTariffMatrix/Editor, checkoutDueDate (B02), canonicalPrivateEdit (B03), multiItemBookingPlan 39/39. Preview build OK.
- Not run: browser test of the editor (gated off), hosted/E2E, B04/B06 suites (untouched code).
- `deno check` of whole functions fails on a pre-existing local `@supabase/supabase-js/cors` resolution issue, unrelated to this change.

## Remaining limits / questions
- L1: resolved by `pa_tariff_l1.sql` (checkpoint 4).
- L2 Wizard summary still shows the client legacy calculation; the switch may only go ON once the summary displays the server quote (B07b).
- Q1 Extra-person amount under the new model (per hour for hourly, per block for 10–12) — not decided; seed requires explicit values.
- Q2 Price of a 14–16 double lesson — not confirmed; stays unavailable (rush hourly rule limited to 60 min).
- Q3 Coverage: every active private product (incl. "Private Lektion Ski/Snowboard 2h" at price 0, "Privatstunde 75/85") needs reviewed rules; no migration from public display data.
- Shared-lesson 10% allocation and manual-discount stacking remain open, unchanged.

## Release order (each step needs explicit approval)
1. Install `product_private_tariff_rules.sql` (requires 0007). From that moment old clients without `quote_revision` get a clear `invalid quote_revision` — so step 2 must be ready.
2. Seed reviewed rules for every active private product; verify coverage query (no active private product without rules).
3. Deploy `private-appointments` + `product-private-tariff-rules`.
4. Install `pa_tariff_l1.sql` in the same release, resolve L2 (B07b), then set `PRODUCT_PRIVATE_TARIFFS_LIVE=true` and publish.

## Rollback (consumer first, data preserved)
Switch OFF + republish → redeploy previous `private-appointments` → re-run 0007 `pa_create_booking` block → run rollback file (drops functions only; rule tables kept as evidence). Bookings created meanwhile keep their stored prices; nothing is recalculated.
