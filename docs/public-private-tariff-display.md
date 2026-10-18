# Private public-information tariffs — prepared, not installed

## Boundary and read-only preflight (Ivo, 18 October 2026)

Only public information for private lessons. No changes to booking, quote, payment,
invoice, availability, BC sources or pending `product_private_tariffs` feature.
Baseline inspected: `f89b9484c15d83c55d1a4228df9334021dcf64bb`.

Connected production readback:
- Winter 26/27 `f185b448-e6aa-46b8-94ae-0875a7a6c166`: 01 Dec 2026–15 Apr 2027.
- Ski `3646f155-8a66-53e3-b512-749f3a42c1ae`: private, fixed CHF75, stored duration **55** minutes.
- Snowboard `0e8e8669-d8f4-5b19-8e6d-36ff588fdee1`: private, fixed CHF75, stored duration 60 minutes.
- Four operational hourly rows: 09–10 CHF75, 10–12 CHF85/h,
  12–14 CHF75/h, 14–16 CHF85/h; extra person CHF20/h. No active `pricing_rules`.
- `pa_price` sums these hourly rates, so proposed public double windows differ
  (e.g. 10–12 operational CHF170 vs user-supplied public CHF190). Preserve both.
- BC one-person provenance remains 60=75, 120=170 for both products.
- New display table/functions absent; inspected table comments contain no explicit
  public-display prohibition. This is not proof of final Office tariff approval.

## Verification gate and unresolved business wording

Seed both products as **UNVERIFIED**. No new catalog fields until staff explicitly
saves with `verify:true`. Any save with `verify:false` clears verification.
Office must first verify both disciplines, the Ski 55-minute discrepancy (do not
silently repair it), and discount wording. Ivo's current wording says “4 lessons”;
established operational rule is >=4 lesson **hours** per participant/day. Seed retains
`threshold:4, unit:lessons, scope:same_participant_same_day` as unverified information;
it is never consumed by operational pricing. Staff may correct this typed information
only after Ivo/Office resolves the difference. No high/low season segmentation.

Office-only 60-minute exceptions use `window_kind:within` for the allowed 10–12 or
14–16 envelope, not an invented exact one-hour selectable start. Standard windows use
`window_kind:exact`. Every window carries its own numeric extra-person supplement.

## Storage/edit path

One row per product+season; strictly validated JSON window records, typed rule columns,
private source note/date, revision, verified actor/time. Staff SELECT RLS only; no anon
privileges. Save RPC service-role-only and validates staff actor, private CHF parent,
season match, window shape and expected revision under product/row locks.

`public-private-tariff-display` POST accepts:
`product_id`, `season_id`, `information` (see seed), `expected_revision` (null for
creation), and explicit `verify` boolean. Actor is derived from authenticated staff,
never client-supplied. Revision conflict returns 409. Read current information through
staff table SELECT. No browser editor in this step; UI deliberately deferred.

## Backward-compatible catalog v1

`get-website-products` keeps `private_rates`, `price`, `price_tiers`, availability and
`online_bookable:false` unchanged. Verified season-bound rows add:
- `public_private_time_tariffs`: version=1, purpose=display_information_only,
  currency=CHF, base_persons=1, windows.
- `public_private_tariff_rules`: version=1, extra_person_basis=per_window, typed
  discount, affects_operational_pricing=false.

Absent/unverified/malformed information emits neither field; missing table alone is
safe during staged deployment. Other database errors fail catalog with 503. No new
price is calculated or invented. Source note/actors never leave Core.
Onepager must suppress generic 2h CHF170 **only when these verified fields are present**
and never treat office exceptions as standard selectable slots. No Onepager changes here.

## Later installation — requires separate authorization

1. Fresh read-only preflight, inspect concurrent changes and current source differences.
2. Install exact `supabase/pending/public_private_tariff_display.sql` atomically through
   supported tracked migration installer, next available ID. No backfill; do not replay
   offering migrations or pending effective private tariff migration.
3. Deploy only `public-private-tariff-display`; read back RLS/grants/RPC; unauthorized
   POST must return 401.
4. Independently review/execute the separate seed in a supported privileged controlled
   transaction: `psql -X -v ON_ERROR_STOP=1 -v staff_actor=<verified-staff-uuid> -f
   supabase/pending/public_private_tariff_display_seed.sql`. The seed locks sources,
   checks exact current attributes/rates, rejects existing rows, and writes only two
   unverified rows. Never wrap the seed in a schema migration to bypass data controls.
5. Office resolves discrepancies and explicitly verifies information via staff endpoint.
6. Deploy only `get-website-products`; independently verify keyed catalog before Onepager
   consumes fields. This step authorizes none of these production actions.

Rollback: export display rows first if needed, deploy previous catalog/write-function
revision or remove the write endpoint, then atomically run the prepared rollback SQL.
Only the new display table/functions are removed; historical/operational data is untouched.

## Checks

- `bun tests/publicPrivateTariffDisplay.integration.mjs`: 14 disposable actual-schema SQL
  checks: seed, 6 double/3 regular single/2 exception windows, exact amounts/supplements,
  source wording, rerun/invalid/stale/role rejection, verify/reset, RLS, unchanged
  unrelated products/seasons/BC/operational/history and rollback.
- Deno tests: shared schema/projection, actual staff endpoint and actual catalog with
  every network request intercepted at synthetic localhost. Unauthorized 401, teacher
  403, Office/Admin/Superadmin path, actor spoof rejection, conflict 409, both products,
  wrong season exclusion, unverified/missing table omission, database error fail closed,
  unchanged generic private_rates and online gate. Four distinct checks, eight executions
  due to shared test-fixture import.
- Existing catalog handler/contract and modal layout invariant retained.
- No real authenticated production save/readback or live keyed catalog test; no UI changed.
