# B07b verification — wizard multi-item cart + release prerequisites (2026-10-25)

Status: implemented in code and tested locally only. Nothing installed, deployed, published or sent.
Switches stay OFF: `PRODUCT_PRIVATE_TARIFFS_LIVE = false`, `OFFICE_MULTI_ITEM_LIVE = false`.
No live business writes. The only live access was one read-only product query (below).

## What changed

| File | Change |
|---|---|
| `src/lib/officeCartRequest.ts` (new) | Pure mapping: whole cart (active unsaved item taken from live wizard fields, stored items unchanged) → one `office-booking` request. One stable ref per person across all items (saved id or guest), actual dates/times/teachers per lesson, explicit "Später zuweisen" only, group lines + B09 season lunch product via `buildStaffGroupLines`, explicit manual discount (incl. 0) per private item and as `group_discount` only when > 0. No prices. Fails closed with a German message per position. One submission key per cart (first item id), kept until success. |
| `src/lib/officeBookingApi.ts` (new) | `office-booking` quote/create client, German errors, `unknown` only for create without a definite answer. Switch `OFFICE_MULTI_ITEM_LIVE` (also requires `privateTariffsLive()`); DEV-only `localStorage yeti.officeMultiPreview=1`. |
| `src/components/bookings/wizard/OfficeCartQuote.tsx` (new) | Combined summary: every private lesson (gross/net, day discount "für X von Y Person(en)", manual incl. 0), every group/lunch line, already-booked same-day context, total, errors, "Preis neu berechnen". Only server numbers. |
| `Step4Summary.tsx` | `multiItemBlocked` stays unless the switch is on; then submit requires a fresh combined quote, sends `acknowledged_quote_digest` of exactly the shown quote + `confirmation_requested` (mail OFF kept from the wizard state). `quote_changed` → acknowledged quote dropped, fresh quote shown, new click required. Success → one ticket, one B05 `process` call, key cleared. Single-item paths unchanged. |
| `src/components/PriceAckDialogHost.tsx` (new), `App.tsx`, `privateAppointmentsApi.ts` | L1 `window.confirm` replaced by an accessible AlertDialog (focus starts on "Abbrechen – nichts ändern"; Escape/close = declined). No host mounted = declined (fail closed). |
| `useCreateBooking.ts` | On the tariff path no "any private product" fallback; the concrete product must be chosen. `buildFinalization` exported (same B02 finalization in the cart request). |
| `BookingWizardContext.tsx` | `extractCartItemFromState` / `applyCartItemToState` exported (no behaviour change). |
| `supabase/functions/private-appointments/index.ts` | Create without `quote_revision`/`discount_rule_revision`/`day_context_digest` → `400 invalid field=client_outdated`, nothing saved. Old screens show "Ungültige Angaben. Es wurde nichts gespeichert."; new screens say "Seite neu laden". Must be deployed only together with the B07 SQL (see manifest). |
| `supabase/pending/b07_private_activation_guard.sql` (new) | `private_tariff_required_coverage` (decided windows as data, no money) + `private_tariff_activation_ok(uuid)` (service-only) + `prevent_bc_draft_activation`: BC private product activates only with a tariff revision and exactly one rule per decided window; group branch byte-identical to 0004. |
| `supabase/pending/b07_private_2627_activation.PROPOSED.sql` (new, not run) | Targeted: asserts exactly the two Winter 26/27 private products, refuses if any already has a tariff revision, seeds both via the reviewed seed, activates them. Touches nothing else. |
| tests | `tests/officeCartRequest.test.ts`, `tests/b07bActivationCart.integration.mjs`, `tests/b07bMultiCartBrowser.py`, `tests/combinedChain.ts` (+ opt-in combined mode in the B04/B05/B06 suites), fixture `tests/fixtures/b07b_captured_cart.json`. |

## Read-only product check (live, one SELECT)
`3646f155-…` Privatunterricht Ski, `0e8e8669-…` Privatunterricht Snowboard: type private, season `f185b448-…`, inactive, each has Booking-Corner tariff sources. There is no `online_bookable` column in the database; public website visibility is not touched by any file here.

## Tests actually run (all local / intercepted)
- `bun test ./tests/officeCartRequest.test.ts` — 6/6 (active item from live fields; private+private+group with guest, shared refs, actual teachers, lunch product; manual 0 / >0 / automatic; fail-closed cases; assign-later; submission key). Writes the captured request fixture; that request passes the Deno `OfficeBookingRequest` schema.
- `bun tests/b07bActivationCart.integration.mjs` — 12/12 on 30 files installed together (baseline + migrations 0000–0015 + B04, B06, B11, B08, B09×2, B03a, B05, B07-P, L1, B07a, guard): guard blocks without revision; partial coverage blocks; group branch unchanged; no money constants, service-only; PROPOSED script activates exactly the two products, old five Winter 25/26 products (incl. Schulatrif 60) and all BC sources byte-identical; second run refused; captured wizard request persists as one ticket (2 lessons, 1 guest, group+lunch, persons 3, due date, line sum = ticket total = quote total, one B11 event); same key replay → nothing new; changed payload under committed key → `submission_mismatch`; saved-person cross-booking counts the earlier lesson and leaves that ticket unchanged; stale day context → `quote_changed`, nothing saved; guard rollback restores the 0004 body and drops the new objects.
- `python3 tests/b07bMultiCartBrowser.py` — 56 checks, 0 failures, desktop 1280×1800 and mobile 390×900, real Step4Summary + real PriceAckDialogHost, every backend call intercepted: switch OFF keeps the block and makes no call; combined quote lines/discounts/context/total; request carries both items, actual teachers, one ref, no money, B02 finalization; unknown outcome → retry same key; stale → fresh quote visible, no auto resubmit; reconfirm bound to new digest; one success + one B05 call, mail failure shown separately; price dialog shows old → new, Escape declines, accept re-sends with the quote digest. Screenshots in /tmp/browser/b07b.
- Delivery suites with fake transport (incl. B06 PDF): standalone B04 19/19, B06 10/10; combined (`B07_COMBINED_CHAIN=1`) B04 19/19, B05 24/24, B06 10/10. The earlier B05 flake is fixed (see review checkpoint below).
- Single-item summary regression `tests/b07PricingSummaryBrowser.py`: 34 checks, 0 failures (desktop + mobile).
- Regression: `privateMoveQuote`, `multiItemBookingPlan`, `b07DiscountIntent` 13/13; Deno private-appointments + office-booking 18 passed / 3 ignored; `deno check` office-booking, private-appointments; app type check clean.

## Usable scope after the coordinated release
Office can save several private lessons (different products, teachers, days) and 26/27 group courses with lunch in one booking, priced by the server, with the same-day discount across items and already booked lessons.

## Not supported / remaining limits
- Per-lesson participant subsets: the server accepts them, but the wizard has no per-lesson people choice; every lesson of an item uses that item's people.
- Participant-specific private bookings, split private group proposals, non-26/27 group courses and private lunch are refused in a multi-item cart (message per position).
- One office discount choice applies to all positions (private override; group discount only when > 0). Mixed group discounts stay refused by the server.
- Participant ownership in step 4 is pre-checked for the active item only; the server rejects foreign participants of other items.
- Group+private through the real step-1 UI was not driven (needs a real 26/27 course plan from the scheduler data); group/lunch mapping is covered by `officeCartRequest.test.ts` and the SQL suite.
- Not run: hosted backend, deployed functions.

## Blockers before switching on
Coordinated install/deploy/publish per `docs/b01-b11-install-manifest.md` (deployment manifest section), then switches ON in the same release.

## Review checkpoint 991688d9 — fixes and evidence (2026-10-25)

Still local only; switches OFF; nothing installed, deployed, published or sent. Synthetic fixtures (hotel 157ee0e5…, teachers 0edc80ff…, 837361c9…) were not read or changed.

| # | Finding (demonstrated) | Fix |
|---|---|---|
| 1 | `checkoutFirstCourseDate` read only the active item: earlier inactive Ski 21.12. + later active Snowboard 11.01. gave due date 04.01. instead of 14.12. | `src/lib/checkoutDueDate.ts`: one calculation over the effective cart (active item from live fields, others from stored items). Used by display, `buildFinalization` → request; single-item path unchanged. Explicit date and paid-now unchanged. Test asserts display = finalization = request = 2026-12-14; SQL suite persists that date. |
| 2 | Key was `cartItems[0].id`: removing/reordering the first item after an unknown outcome gave a new key, and a single remaining item switched to the single-item path. | `officeCartRequest.ts` attempt lifecycle: one draft key per tab session (not tied to items); before create the exact request is frozen (`yeti.office.submit.pending`, write-ahead). Unknown → frozen; every other submit (changed cart, single path, remount) is blocked; only "Ursprüngliche Anfrage prüfen" replays the frozen original unchanged under its key (server returns the first result, or saves the original once). Success consumes the key; a definite rejection releases the block. Edited cart is kept; replay never sends the edited cart and never omits discarded items. |
| 3a | Real wizard: the 26/27 products (Ski 55 min, Snowboard 60 min) were unreachable — step 1 chose a product by duration (`duration_minutes == hours*60`). | `src/lib/privateProductSelect.ts`: on the tariff path exactly one active current-season private product per sport, any duration; none/several → no product + visible notice. Legacy path unchanged. |
| 3b | Real wizard: a person newly entered in step 1 (local, unsaved) made the combined quote fail "Teilnehmer nicht mehr vorhanden". | `buildOfficeCart` / `OfficeCartQuote` use the shared `participantPool` (saved + new people), as the single-item path does. |
| 4 | B05 flake: the previous test renames the intents table and waited a fixed 300 ms for PostgREST's async schema reload; the next test then saw the table missing → `unavailable`. Fixture timing only. | Test polls until the schema cache reflects each rename. Unknown-vs-unavailable assertions unchanged. |
| 5 | `get-products` filters `is_active AND show_on_website AND season covering today`. Both 26/27 products have `show_on_website = true` and `price 75 fixed`: activation would have added them from 1.12.2026 with a misleading flat price. | `get-products/logic.ts`: private products with a tariff revision are never listed; table not installed → none excluded; other error → 503. `get-website-products` filters only `season_id` + `show_on_website` (never `is_active`) and always returns `online_bookable: false`: activation does not change its output (both products are already listed there, Ski with 1 public offering schedule, both with 1 display row). No `online_bookable` column exists; public booking requests remain office review only. |

Tests run for this checkpoint:
- `bun test tests/officeCartRequest.test.ts tests/checkoutDueDate.test.ts tests/privateProductSelect.test.ts` — 26/26 (cart due date, attempt lifecycle incl. removal/mail change/remount/replay, local participant, product choice).
- `bun test tests/staffGroupPlan.test.ts` 15/15; `deno test supabase/functions/get-products/logic.test.ts` 7/7.
- `python3 tests/b07bWizardStepsBrowser.py` — 36 checks, 0 failures, desktop 1280×1800 + mobile 390×900: real BookingWizard page steps 1→2→3 from a scheduler hand-off; new participant via UI; Ski item with teacher, second Snowboard item 14–16 "Später zuweisen" left active/unsaved; payer via search; summary request carries both concrete products, one shared person, due date 14.12.; mail OFF; back to step 1 (both positions, active Snowboard kept) and forward (same request + key, mail OFF kept); one create bound to the shown digest, one B05 call; no single-item create, no table writes.
- `python3 tests/b07bMultiCartBrowser.py` — 70 checks, 0 failures: stale quote → no write; reconfirm → unknown; first item removed (single path) + mail ON + remount → submit stays blocked, no new office or single create; replay sends exactly the original (key, 2 items, digest, mail OFF), one result, one B05 call, edited cart kept, key consumed.
- `tests/checkoutPersistenceBrowser.py` and `tests/b07PricingSummaryBrowser.py` (B02 / single-item regression) — 0 failures.
- `bun tests/b07bActivationCart.integration.mjs` — 12/12 with the regenerated captured request.
- B05 delivery 6 consecutive runs: standalone 24/24 ×3, combined chain 24/24 ×3.
- `bun run check:functions`, app type check — clean.
