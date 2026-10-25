# B01–B11 + B07 coordinated release — prepared package (2026-10-25)

State: prepared in code only. No hosted SQL, no Edge deploy, no publish, no mail, no hosted test bookings.
Both client switches are ON in code (`PRODUCT_PRIVATE_TARIFFS_LIVE`, `OFFICE_MULTI_ITEM_LIVE`). Until the
migrations and functions below are live, the preview fails closed for private/multi bookings
(`unavailable` / `tariff_unavailable` / `client_outdated`); there is no legacy price fallback.

## Backend target
One Lovable Cloud backend serves preview and published app. Live `drizzle.__drizzle_migrations`
(read-only, 2026-10-25): 19 rows, newest `created_at` 1792341631903 (= 0015). The journal is appended,
never replaced: 0016–0028 have `when` 1792946655310 + n·1000 (strictly greater), snapshots chained from
0015's id. `drizzle-kit check`: "Everything's fine".

## Tracked migrations (promoted from supabase/pending, pending copies removed)
| # | file | sha256 (12) |
|---|---|---|
| 0016 | b04_delivery_compatibility (BEGIN/COMMIT removed; migrator wraps) | 0a2768c1b3aa |
| 0017 | b06_invoice_delivery (BEGIN/COMMIT removed) | 33e3aabd457d |
| 0018 | b11_created_total_event | fdff19d61ff3 |
| 0019 | participant_birth_date_guard | ff59ecb202e1 |
| 0020 | group_lunch_full_day | 4eb393b97e74 |
| 0021 | group_lunch_season | a83d896c8e06 |
| 0022 | pa_edit_booking | bd7624ef52a7 |
| 0023 | b05_office_confirmation_intent | 78078da3eb65 |
| 0024 | product_private_tariff_rules | 8727daea7212 |
| 0025 | pa_tariff_l1 | 7e5c6be95af0 |
| 0026 | b07a_office_multi_create | 49c996eaabfa |
| 0027 | b07_private_activation_guard | 8ab00d691174 |
| 0028 | b07_private_2627_activation (data, plain SQL) | 22833c12f787 |

0028 has no psql commands. It names only `3646f155-…` (Ski) and `0e8e8669-…` (Snowboard), season `f185b448-…`.
It fails and rolls back unless: both exist, are private, in that season, and have no tariff revision yet.
It inserts the discount rule (10 %, 240 min) only if absent and saves 9 rules per product (revision 1).
It activates the two products through the guard, and it checks afterwards that all other private
products (the old five, including Schulatrif 60) and all `bc_product_tariff_sources` rows have identical
digests. The generic seed template `supabase/pending/product_private_tariff_rules_seed.PROPOSED.sql` is not part of the release.

Apply route: one `lov_database--migration` call applies every pending journal entry in order (0016→0028)
before its own file. Note: that tool's policy treats seeding as data work. 0028 is a reviewed, assertion-guarded
data step that Ivo explicitly asked to keep in the tracked chain. If the tool refuses it, run the identical
0028 SQL as one transaction through the database query tool, then mark the outcome.

## Edge functions (closure from actual imports, `/tmp/edge_deps.json` method: transitive `./`/`../` imports from each index.ts)
Deploy these 12. Each one has its own code changed, or imports a changed shared module:
1. `get-products` — before 0028 (public exclusion of tariff-priced private products; it is safe before 0024).
2. `issue-invoice` (invoice-service), `confirm-booking` (bookingDelivery, invoice-service), `course-booking`
   (bookingDelivery, courseDelivery, invoice-service, invoicePdf), `retry-course-booking-delivery`,
   `retry-booking-confirmation` (bookingDelivery), `send-invoice`, `staff-booking-confirmation`
   (bookingReadProjection, officeConfirmationContent) — after 0016/0017/0023.
3. `staff-group-booking` (birthDate) — after 0021.
4. `private-appointments` (birthDate, privateAppointmentsContract; `client_outdated`), `product-private-tariff-rules`
   (privateTariffRulesContract) — after 0024/0025.
5. `office-booking` (officeBookingContract) — after 0026.

Not deployed (verified): `create-booking-from-extraction` (imports only staffAuth), `get-booking-request`,
`intake-booking`, `submit-booking-request` (no shared imports); `product-management` (no changed dependency
since its product-delete deploy); `product-private-tariffs` (obsolete matrix endpoint; its table is not
installed); `get-website-products`, `public-private-tariff-display`, `get-public-instructors`,
`instructor-website-publish`, `product-public-offering` (not part of this release; no Onepager change).

## Execution order
0016–0023 → deploy group 2 + 3 + `get-products` → 0024–0027 → deploy group 4 + 5 → 0028 → publish Core
(switches already ON). Keep the time between 0024 and the publish short: screens loaded before the publish get `client_outdated`
("Ungültige Angaben. Es wurde nichts gespeichert."), with no booking and no legacy price.

## Client bundle (local build of this source into /tmp, not published)
`vite build`: OK, entry `assets/index-Q1C0Sn0k.js`, precache 26 entries / 3273 KiB (under the 4 MiB
ceiling). Hash of all built files: `18471c5f…e235`. The published hash will differ when the commit changes.

## Rollback order (consumer first, newest first)
1. Client: set both switches OFF, publish. 2. Products: `UPDATE products SET is_active=false` for the two IDs
(the tariff rows stay as history). 3. `b07_private_activation_guard_rollback` → `b07a_office_multi_create_rollback`
→ `pa_tariff_l1_rollback` → `product_private_tariff_rules_rollback`, then redeploy the previous `private-appointments`/`office-booking`.
4. `pa_edit_booking_rollback`, `group_lunch_season_rollback` (pending dir), `participant_birth_date_guard_rollback`,
`b11_created_total_event_rollback` (pending dir). 5. 0016/0017/0020/0023 are additive with no rollback file; leave them installed.
Rollback SQL is run manually and is not journaled; record each run in the GitHub issue.

## Verification run in this checkpoint (local; synthetic data; production baseline)
- Replay safety: browser `tests/b07bMultiCartBrowser.py` 110/0, desktop+mobile. Committed-but-lost create, then
  replays answered 401/403/404/503/network: each resends the exact original and stays blocked. Then removing the first item (single path), remounting
  and pressing submit creates nothing. A successful replay then gives one ticket. Unit `tests/releaseSafety.test.ts`.
- Combined chain from tracked files incl. exact 0028: activation 12/12, B07a 19/19, L1 rollback 4/4,
  cross-booking 12, discount 13, L1 17, edit 17, B11 5, DOB 5, B05 intent 7, group 39, finalize 14, tariff rules 13,
  projection 12. Delivery with fake transport, combined: B04 19/19, B05 24/24, B06 10/10 (PDF).
- Wizard steps 36/0, pricing summary 34/0, unit 406 pass (the one bun "fail" is the Deno-only b05Content, 3/3 under deno), app type check,
  function checks, drizzle-kit check.
- B04/B05 Deno delivery suites were run with `--no-check`: a newly fetched supabase-js 2.118 type definition
  rejects test-fixture typing (TS2322/TS2589 in the test files only). The function checks are clean.

## Not tested
Hosted backend, deployed functions, the real publish. A group+private cart through the real step-1 screen (this needs real 26/27 course plans).
