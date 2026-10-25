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
- L1 Move/period update/B03a edits still price via `pa_price` (global rates). Must be switched to the resolver before release so a moved new booking is not repriced by the old model.
- L2 Wizard summary still shows the client legacy calculation; the switch may only go ON once the summary displays the server quote (B07b).
- Q1 Extra-person amount under the new model (per hour for hourly, per block for 10–12) — not decided; seed requires explicit values.
- Q2 Price of a 14–16 double lesson — not confirmed; stays unavailable (rush hourly rule limited to 60 min).
- Q3 Coverage: every active private product (incl. "Private Lektion Ski/Snowboard 2h" at price 0, "Privatstunde 75/85") needs reviewed rules; no migration from public display data.
- Shared-lesson 10% allocation and manual-discount stacking remain open, unchanged.

## Release order (each step needs explicit approval)
1. Install `product_private_tariff_rules.sql` (requires 0007). From that moment old clients without `quote_revision` get a clear `invalid quote_revision` — so step 2 must be ready.
2. Seed reviewed rules for every active private product; verify coverage query (no active private product without rules).
3. Deploy `private-appointments` + `product-private-tariff-rules`.
4. Resolve L1/L2, then set `PRODUCT_PRIVATE_TARIFFS_LIVE=true` and publish.

## Rollback (consumer first, data preserved)
Switch OFF + republish → redeploy previous `private-appointments` → re-run 0007 `pa_create_booking` block → run rollback file (drops functions only; rule tables kept as evidence). Bookings created meanwhile keep their stored prices; nothing is recalculated.
