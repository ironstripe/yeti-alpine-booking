# Issues #15 / #22 / #36 – containment status (2026-10-03)

Containment only. Nothing here is deployed, published or applied to Cloud data.

## #22 – Edge function checks
- Root cause: from the repo root Deno picks up `package.json` and resolves `npm:` imports
  against the frontend `node_modules` (no jpeg-js/fflate, supabase-js 2.89 without `./cors`).
- Fix (tooling only): `deno check --node-modules-dir=none` — proven equivalent to the earlier
  isolated-copy check, so no temp directory is needed. Runtime imports/config unchanged.
- `bun run check:functions [name ...]` checks the five #22 functions by default, exits non-zero
  on any real type/import failure (verified with an injected type error), calls no live service.
- `bun run test:functions:offline` runs Deno tests offline and explicitly excludes
  `private-appointments/contract.test.ts` (live network) and `_shared/payment-domain.test.ts`
  (bun test file, covered by `bun test`).
- Limitation: a passing static check does not prove the deployed runtime behaves identically.

## #15 – done (containment)
- `get-products` fails closed (503) on season query error, no current season and overlapping
  seasons; never falls back to all active products; returns only `is_active` AND
  `show_on_website` products of that one season. Output shape unchanged.
- Staff booking (`useCreateBooking`): `src/lib/groupBookingPreflight.ts` validates EVERY group
  line (shared booking and each group participant in participant-specific / mixed family
  bookings) before any write: linked active product, season covering all dates, finite price > 0.
  Generic-group-product and CHF-0 fallbacks removed. Products with 26/27 tariff evidence
  (`bc_product_tariff_sources`) or in season "Winter 26/27" are rejected with a German error;
  no `price_per_day` / `product.price` fallback for them.

## #15 – remaining
- The browser still writes ticket, items, payments in several steps; a late failure can still
  leave a partial booking. Needs a server-side atomic booking RPC using `quote_bc_2627_product`.
- Generic atomic group booking (server RPC) can proceed now; it is not blocked by Carving.
- Carving *activation* is blocked by missing business values: operating dates/slots (Wed/Sun 2h)
  and tariff binding to source IDs. Not invented.
- Preflight (2026-10-03 fix): course must be `is_active === true`; linked product type must be
  `group`/`group_toddler`; dates must be real ISO calendar dates without duplicates; product price is
  used as day price only for `pricing_type = fixed` (tiered/flat/hourly never → fail closed).
- `get-products` always excludes `office_shift`, like `get-website-products`.

## #36 – done (containment)
- `confirm-booking` refuses `payment_method=online` with 503 `payment_provider_unavailable`
  right after validation, before client creation, any read, finalization or payment write.
  A caller-supplied `payment_reference` is never treated as proof. Invoice flow unchanged.
  PR2 not merged; no verified payments fabricated.

## #36 – remaining
- Online payment needs provider integration with server-side verification (then remove the gate).
  Invoice-only booking does **not** need a provider; what is missing there is invoice delivery,
  which is not implemented in current main.
- Website course-option list, 26/27 reservation, finalize (enrollments + exactly one invoice).
- **Outstanding dependency – capacity policy (undecided):** Ivo's prior business rule says group courses are always
  bookable (soft capacity); #36 asks for hard capacity blocking. Neither policy has been adopted.
- **Outstanding dependency – Robin write access.** OnePager: Robin repo permissions checked: push=false, pull=true → no OnePager change possible.
