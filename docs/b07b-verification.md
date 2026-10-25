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
- `bun tests/b07bActivationCart.integration.mjs` — 11/11 on 30 files installed together (baseline + migrations 0000–0015 + B04, B06, B11, B08, B09×2, B03a, B05, B07-P, L1, B07a, guard): guard blocks without revision; partial coverage blocks; group branch unchanged; no money constants, service-only; PROPOSED script activates exactly the two products, old five Winter 25/26 products (incl. Schulatrif 60) and all BC sources byte-identical; second run refused; captured wizard request persists as one ticket (2 lessons, 1 guest, group+lunch, persons 3, due date, line sum = ticket total = quote total, one B11 event); same key replay → nothing new; changed payload under committed key → `submission_mismatch`; saved-person cross-booking counts the earlier lesson and leaves that ticket unchanged; stale day context → `quote_changed`, nothing saved.
- `python3 tests/b07bMultiCartBrowser.py` — 56 checks, 0 failures, desktop 1280×1800 and mobile 390×900, real Step4Summary + real PriceAckDialogHost, every backend call intercepted: switch OFF keeps the block and makes no call; combined quote lines/discounts/context/total; request carries both items, actual teachers, one ref, no money, B02 finalization; unknown outcome → retry same key; stale → fresh quote visible, no auto resubmit; reconfirm bound to new digest; one success + one B05 call, mail failure shown separately; price dialog shows old → new, Escape declines, accept re-sends with the quote digest. Screenshots in /tmp/browser/b07b.
- Delivery suites with fake transport (incl. B06 PDF): standalone B04 19/19, B06 10/10; combined (`B07_COMBINED_CHAIN=1`) B04 19/19, B05 24/24, B06 10/10. B05 test "unknown/expired/digest mismatch" fails intermittently in BOTH modes (seen 1 of 3 standalone, 1 of 3 combined: `unavailable` instead of `transport_unknown`, a timing race in the fake-timeout path); not caused by the chain, not fixed here.
- Regression: `privateMoveQuote`, `multiItemBookingPlan`, `b07DiscountIntent` 13/13; Deno private-appointments + office-booking 18 passed / 3 ignored; `deno check` office-booking, private-appointments; app type check clean.

## Usable scope after the coordinated release
Office can save several private lessons (different products, teachers, days) and 26/27 group courses with lunch in one booking, priced by the server, with the same-day discount across items and already booked lessons.

## Not supported / remaining limits
- Per-lesson participant subsets: the server accepts them, but the wizard has no per-lesson people choice; every lesson of an item uses that item's people.
- Participant-specific private bookings, split private group proposals, non-26/27 group courses and private lunch are refused in a multi-item cart (message per position).
- One office discount choice applies to all positions (private override; group discount only when > 0). Mixed group discounts stay refused by the server.
- Participant ownership in step 4 is pre-checked for the active item only; the server rejects foreign participants of other items.
- Not run: hosted backend, deployed functions, the real wizard steps 1–3 with a real cart, the remaining B05 flake.

## Blockers before switching on
Coordinated install/deploy/publish per `docs/b01-b11-install-manifest.md` (deployment manifest section), then switches ON in the same release.
