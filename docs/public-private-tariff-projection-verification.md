# Public private-tariff projection — verification

Base HEAD: `cad08d7` (after the B07-P3 cross-booking checkpoint). Final SHA is assigned by the platform after this turn.
Status: **implemented in code + pending SQL, tested locally/offline only.** Nothing installed, seeded, deployed or published; no feature flag changed; no live prices touched. The live projection is **not** working yet: the production schema has neither the product tariff rules nor this function.

## What changed
Public standard prices are no longer a second set of money values. `get-website-products` calls the new service-only `public_private_tariff_projection(product, season)`:
- **Which windows are public:** Office-verified rows in `public_private_tariff_display`, only entries with `classification = 'standard'` and `window_kind = 'exact'`.
- **What they cost:** `pa_product_quote(..., p_office => false)` for 1 person (gross, `base_persons = 1`, before discount). Extra person = resolver price for 2 people minus the price for 1 person. No constant.
- **Discount:** from the configured `private_lesson_discount_rule` (percent, `threshold_minutes`, unit `minutes`, scope). This metadata is copied for display only; the calculation stays in the B07 resolver.
- **Never published:** the stored display `amount_chf`, `extra_person_chf` and discount fields.
- **Fail closed:** any resolver error (office-only, no rule, ambiguous, not configured, missing discount rule), a non-positive price or zero standard windows makes the whole product omit the fields. There is no partial list and no legacy fallback. The function also refuses to install before the resolver exists.

## Contract (unchanged v1 envelope, per private product)
```json
"public_private_time_tariffs": {"version":1,"purpose":"display_information_only","currency":"CHF","base_persons":1,
  "windows":[{"start":"09:00","end":"10:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"}, ...]},
"public_private_tariff_rules": {"version":1,"extra_person_basis":"per_window",
  "discount":{"percent":10,"threshold":240,"unit":"minutes","scope":"same_participant_same_day"},"affects_operational_pricing":false}
```
- When the tariffs are verified and seeded: the six windows `09-10, 12-13, 13-14` (75, +20) and `10-12` (190, +40), `12-14` (150, +40), `14-16` (190, +40).
- Fields are omitted when the projection function is missing (PGRST202/42883), the product is unverified, or the resolver fails. Any other RPC error returns 503, as before.
- Group products, `price_tiers`, `private_rates` (the legacy BC field, unchanged), `online_bookable: false`, the API key and CORS are unchanged.

## Files
- `supabase/pending/public_private_tariff_projection.sql` (new, not installed) and `supabase/rollback/public_private_tariff_projection_rollback.sql`
- `supabase/pending/public_private_tariff_display_windows.PROPOSED.sql` (new, not executed): replaces the window list with the six standard windows and fills the required legacy amount fields from the resolver at seed time. It saves **unverified**, so Office must verify again. The old seed listed `09-11`, `11-13` and `13-15` as standard; under the new projection those would make the product fail closed.
- `supabase/functions/_shared/publicPrivateTariffDisplay.ts`: `publicPrivateResolvedProjection` added; the old `publicPrivateProjection` is kept for compatibility but no longer used by the endpoint.
- `supabase/functions/get-website-products/index.ts`: reads the projection RPC instead of the display table.
- Tests: `tests/publicPrivateTariffProjection.integration.mjs` (new); `supabase/functions/get-website-products/private-display.test.ts` rewritten.
- `AGENTS.md`: the public display rule was updated.

## Tests actually run (synthetic only)
- `publicPrivateTariffProjection.integration.mjs` 12/12, on a throwaway PostgreSQL from the production baseline + pending 0013 + `product_private_tariff_rules.sql` + projection:
  - Staged-install refusal; grants are service-only; no display row fails closed.
  - The PROPOSED window seed refuses when tariffs are missing, then writes six unverified windows with threshold 240 minutes. The projection stays hidden until verification.
  - Six windows give gross 75/75/75/190/150/190 and extras 20/20/20/40/40/40; discount 10 %/240.
  - Office exceptions: `09-11` and `13-15` quote 160 and the rush single hour quotes 85 at office level, and none appears publicly.
  - The `pa_create_quote` gross and extra amounts equal the public values for all six windows.
  - Changing the product config to 200/+45 changes the public value without a code edit, and the other product is unchanged. Changing the discount percent is reflected.
  - Stored legacy amounts (999) and the old 4-lesson threshold are ignored.
  - An exception listed as standard fails closed with `office_only`. Gap window → `no_rule`, removed rules → `not_configured`, missing discount rule fails closed, group product → `not_verified`.
- Deno offline `get-website-products/` + `_shared/publicPrivateTariffDisplay.test.ts`: 4/4 pass. The endpoint was exercised against an intercepted localhost service with these modes:
  - resolved, with product-specific config changes;
  - not_verified, resolver_error, missing function, a leaked exception window and a zero price: the fields are omitted;
  - permission error: 503.
  - Groups are never projected and keep their price and tiers. The legacy display table and the tariff tables are never read.
- Regressions: `publicPrivateTariffDisplay.integration.mjs` 14/14, `b07CrossBookingDiscount.integration.mjs` 12/12.
- Not run: the hosted backend, a deployed function, or a Onepager render.

## Minimum release prerequisites (each needs explicit approval, in this order)
1. Install `product_private_tariff_rules.sql` (B07 pricing, including the discount rule and cross-booking). Installing alone does not activate office pricing; `PRODUCT_PRIVATE_TARIFFS_LIVE` stays false.
2. Run the reviewed tariff seed (`product_private_tariff_rules_seed.PROPOSED.sql`) for both private products, plus the discount rule row.
3. Install `public_private_tariff_projection.sql`.
4. Run `public_private_tariff_display_windows.PROPOSED.sql`, then have Office verify both products.
5. Deploy `get-website-products`. If deployed earlier, the private fields are simply omitted (fail closed), and verified legacy display values that are visible today disappear until steps 1–4 are done.

Steps 1–3 do not enable office tariff booking, the move/edit transition or B07a/B07b. Those stay behind their own switch and release.

## Rollback
Redeploy the previous `get-website-products` first, then run the rollback file (drops only the read-only function). The window seed changed display metadata only; restore it from the revision history or by saving the previous list. No booking, price or history data is affected.

## Remaining dependencies / limits
- Live projection depends on the B07 pricing install and seed, which are pending.
- `private_rates` still publishes the BC draft value (120 min = 170). That is outside this patch; it is the legacy field the Onepager may still read.
