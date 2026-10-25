# Public private prices – R1 release package (prepared, NOT installed)

Status 2026-10-25: code + local verification only. No hosted SQL, no data save, no Edge deploy, no publish, no
Onepager change. Queued after the six R1 fixes (they are unchanged).

## Hosted before-state (read-only, verified)
- `public_private_tariff_projection`: absent.
- Deployed `get-website-products`: older than the repo; anonymous call → 401 (API key required, Onepager proxy holds it).
- `public_private_tariff_display`: 2 rows (Ski 3646f155…, Snowboard 0e8e8669…), revision 1, source_date 2026-10-18,
  updated_by = verified_by = ivo@ivo.ch (admin, super_admin) at 2026-10-18 15:49:24Z, `md5(windows::text)` =
  `5f6ce3cfba2f2a2615a5fc00d79b31a6`, 11 windows incl. 09–11/11–13/13–15 = 160 as "standard", discount 10 / 4 "lessons".
  With these rows the projection fails closed (`office_only`) → no prices; reproduced locally.
- Tariff rules rev 1 (9 per product) and discount rule (10 %, 240 min, same participant/day, rev 1) correct.

Before-image (stored here because the table has no history): exact window list = literal in
`supabase/rollback/public_private_prices_r1_display_update_rollback.sql` (hash verified equal to the above).

## Package, install order
1. **Schema:** `supabase/pending/public_private_tariff_projection.sql` → next tracked migration after R1
   (R1 = 0030–0032, this = **0033**). Read-only, service_role only; refuses install before 0024/0013.
   Install via the migration tool (the tracked directory is read-only in the sandbox).
2. **Data (one transaction):** `supabase/pending/public_private_prices_r1_display_update.sql`,
   `-v staff_actor=<uuid> -v verify=true`. Exactly the two products; guards before-image (rev 1, hash,
   source_date); saves through `save_public_private_tariff_display(…, expected_revision 1, …)`; window amounts
   derived from `pa_product_quote(…, p_office=false)` for 1/2 persons; discount from the canonical rule;
   asserts products unchanged and projection `ok` after save. Prints the before-image as NOTICE. No products,
   rules, discount, `pa_*`, B07 or historical writes.
3. **Edge:** deploy only `get-website-products` (imports `_shared/productOffering.ts`,
   `_shared/publicPrivateTariffDisplay.ts`, `_shared/intakeAuth.ts`; no other consumer needs redeploying).
   Groups/offerings/catalog count and `online_bookable: false` unchanged (contract test).
4. Onepager: no change; the proxy passes the catalog through (60 s TTL).

Rollback order: redeploy previous `get-website-products` → run rollback script (restores the 2026-10-18 list via
the save path, new revision) → projection function may stay (read-only) or `supabase/rollback/public_private_tariff_projection_rollback.sql`.

## Actor / verification requirement (blocker to resolve before step 2)
The save stores `staff_actor` as `updated_by` and, with `verify=true`, as `verified_by`. The previous rows were
saved with Ivo's account. Lovable must not use a person's identity it does not hold. Truthful options:
- **A (recommended):** Ivo explicitly confirms in chat that his account `ivo@ivo.ch` is the actor for this
  privileged save (he approved the windows); the source note states the approval date and that it replaces rev 1.
  It is then a privileged service run on his documented authority, not a UI action, and is reported as such.
- **B:** Ivo (or another staff user) signs in and saves through the staff endpoint `public-private-tariff-display`
  (staff JWT, `requireRole`); there is no UI for it yet, so a request must be sent from his signed-in session.
- Alternatively run with `verify=false` first (any authorised staff actor) and have the verifier perform option B.
No new accounts or credentials are needed or created.

## Local verification
`tests/publicPrivatePricesR1.integration.mjs` – baseline + 0000–0027 + R1 pending + projection, fixtures = live
rules/before-image: **12/12** (old list fails closed; service-only; non-staff and changed revision refused without
writes; unverified save not public; verified: exactly six windows 75/75/75/190/150/190 (Stand Tarif-Revision 1, vor Korrektur; seit 2026-10-25 22:43 UTC live: 75/75/75/190/150/170), extras 20/20/20/40/40/40,
no 85/160, both sports, discount 10 %/240 min; `pa_product_quote` parity 1/2 persons; products and group unchanged;
changed tariff config reflected without code/metadata change; rollback restores hash `5f6ce3cf…`).
`get-website-products` envelope tests + `publicPrivateTariffDisplay` 4/4; `websiteCatalogContract` PASS.
Not tested: hosted backend, deployed function, Onepager rendering.
