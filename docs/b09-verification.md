# B09 – Season-aware lunch product (HB032–035)

Status: **implemented in preview + local technical checks passed. NOT installed, NOT deployed, NOT published, no independent E2E.**
Base SHA: `ad64355940a92cfcbe87ebbde7a34c1b35df3024` · Preview commit after edits: `9f45c42b1979b7f62844599a2dc4f6dcddab3690` (the platform may add later auto-commits; the B09 files are listed below).

## Verified cause (read-only, aggregates only)
- Live `products(type='lunch')`: two active CHF 30 rows, one in *Winter 25/26* (2025-12-20..2026-04-06), one in *Winter 26/27* (2026-12-01..2027-04-15). No lunch `ticket_items` exist yet.
- `src/hooks/useLunchProduct.ts` required exactly one active lunch product globally → always `null` → lunch never priceable/saveable.
- Installed `bc_2627_staff_group_book` uses the same global singleton (`lunch_product` error); pending `group_lunch_full_day.sql` is not installed (function body lacks `lunch_full_day`).

## Rule implemented (UI preview and server identical)
Booked course → `group_courses.product_id` → `products.season_id` → `seasons`; every lunch date inside that season; exactly one active `products(type='lunch', same season_id)` at CHF 30. Missing season, date outside season, none, several or other price ⇒ explicit error. Never today's season, labels, first row or global singleton. Server resolves per line from the trusted course and rejects a client `lunch_product_id` that differs (`lunch_product_mismatch`). Unchanged: CHF 30/person/day, full-day only, one lunch per person/date (not per AM/PM), subset/vegetarian, removal/clear, full→half-day clearing, tier semantics, no-lunch path.

## Files
- `src/hooks/useLunchProduct.ts` – `pickSeasonLunch`, `resolveLunchProduct`, `fetchLunchProduct(ctx)`, `useLunchProduct(ctx)`, `useLunchProducts(ctxs)`; query key `["lunch-product","season",productId,sortedDates]`.
- `src/lib/staffGroupPayload.ts` – optional per-line lookup; adds `lunch_product_id` per lunch line (number argument kept for compatibility).
- `src/lib/staffGroupBookingApi.ts` – type field + German messages `lunch_season`, `lunch_product_mismatch`.
- `src/hooks/useCreateBooking.ts` – staff path resolves per booked context; legacy path resolves for its booked product instead of a global filter.
- `Step2ProductAllocation.tsx`, `ParticipantBookingCard.tsx`, `PriceBreakdown.tsx` – pass booked product + dates (per-participant contexts in mixed mode).
- Pending SQL: `drizzle/migrations/0021_group_lunch_season.sql` (body patch, fails closed unless `group_lunch_full_day.sql` is installed), `group_lunch_season_rollback.sql`. No table/grant/signature/data change.
- Tests: `tests/lunchSeason.test.ts`, `tests/lunchSeasonBrowser.py`, B09 cases in `tests/staffGroupBooking.integration.mjs` (fixture lunch moved to the 26/27 season + second active 25/26 row), mock update in `tests/priceBreakdownGroup.test.tsx`.

## Checks actually run
- `staffGroupBooking.integration.mjs` on throwaway local PostgreSQL with production baseline + pending chain incl. B09: **39/39** (two active seasons → correct row; 2 people × 2 days = 4 items, CHF 120, correct people/dates, no AM/PM double charge; forged/other-season id; same-season duplicate; missing; date outside season; no-lunch with lunch config unavailable; rollback restores previous body, booked lines unchanged, re-apply works; existing lunch/half-day/price/repeat/concurrency/roles regressions).
- Bun: 38 tests across lunchSeason, staffGroupPlan (removal/full→half fix), priceBreakdownGroup, groupLunch, summaryEffectivePlan, birthDate (B08).
- Browser (real hook in running app, REST intercepted): switching course season re-resolves without stale cache; mismatch/duplicate/missing ⇒ none; no global lunch query issued. Existing `groupLunchBrowser.py` desktop/mobile passed. Preview build OK.
- Not run: PostgREST layer for B09, full wizard click-through, Saturday course with lunch (server only books `Winter 26/27` courses; Saturday follows the same full-day rule but was not exercised), B05 intent / B08 trigger suites (they don't load the B09 patch; unaffected files).

## Release sequence (pending, needs authorization)
1. Install `group_lunch_full_day.sql` (prerequisite) → 2. `group_lunch_season.sql` → 3. publish frontend. No function deployment needed (`staff-group-booking` passes lines through). Order is safe: old frontend omits `lunch_product_id`, server still resolves by season.

## Rollback (consumer first)
1. Revert frontend files. 2. Run `group_lunch_season_rollback.sql` (restores global lookup body). Booked lunch lines, products, prices and history stay untouched; no data deletion.

## HB032–035 retest handoff
- HB032: 26/27 full-day course, 2 participants, 2 lunch days → summary 4 × CHF 30 = CHF 120; saved ticket has 4 lunch lines with the 26/27 lunch product.
- HB033: per-participant mode, subset of days + vegetarian for one person → exact lines only for chosen people/dates.
- HB034: switch full-day → half-day with lunch selected → removal prompt, save after clearing; switch back to full-day shows CHF 30 again.
- HB035: booking without lunch saves normally; with lunch in a configuration lacking a unique 26/27 lunch product → clear German error, nothing saved.

## Open business inconsistency (no policy invented)
The *Winter 25/26* lunch product is still active although that season ended 2026-04-06. Harmless now (the rule ignores it for 26/27 bookings), but e.g. a 25/26 legacy booking edited later would resolve to it. Whether to deactivate it is Ivo's decision; nothing was changed.
