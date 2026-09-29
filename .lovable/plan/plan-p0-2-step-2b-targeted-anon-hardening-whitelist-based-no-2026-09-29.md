# Plan: P0.2 Step 2B — Targeted anon hardening (whitelist-based, no blanket moves)

Goal: remove anonymous direct database access that the published booking flow does not need, using a measured whitelist instead of either previous blanket migration. Nothing is published or deployed in this step.

## Verified current state (measured today, live)

- **Grants:** anon holds SELECT/INSERT/UPDATE/DELETE on **all 82 public tables** (pg_class ACL dump), plus all sequences, plus `ALTER DEFAULT PRIVILEGES` re-grants — restored by `20260929215248`.
- **Policies that actually admit anon:** 6 blanket `SELECT USING (true)` policies on `tickets`, `ticket_items`, `customer_participants`, `instructors`, `conversations`, `groups` (created by the rollback); `booking_requests` INSERT (true), SELECT (true), UPDATE (authenticated only); catalog reads `private_lesson_rates`, `product_price_tiers`, `skill_levels` (SELECT true); `vouchers` SELECT/INSERT/UPDATE all effectively open (roles public, qual true). All other ~120 policies are effectively authenticated-only via `auth.role()` or helper functions.
- **Published bundle behavior (measured, unauthenticated, live site):** `/book`, `/book/private`, `/book/group` and the voucher check make **zero** backend calls. Direct database usage is confined to request submission (INSERT `booking_requests`) and the confirmation page (SELECT by magic token) — per earlier verification.
- **New booking flow** (`submit-booking-request`, `get-booking-request`) is deployed but NOT published; the published bundle still uses direct table access. So this step cannot remove all anon access without breaking the live flow.

## Phase A — Capture the exact whitelist (live, before any migration)

1. Drive the published public flow end-to-end unauthenticated (fill private + group forms with test data, submit, open the confirmation page with the returned magic token) and record every `/rest/v1/*` and `/functions/v1/*` call.
2. Expected whitelist: only `booking_requests`. If more tables appear, each gets the minimum operation and a scoped policy or is flagged as a product decision (D2) — never opened wholesale.
3. Delete the test request afterwards (run_sql) — no leftover data.

## Phase B — One additive migration (single file, reversible)

1. `REVOKE ALL` on every public table and sequence from `anon`; drop the two anon `ALTER DEFAULT PRIVILEGES` re-grants.
2. Re-grant exactly what Phase A measured: expected `INSERT, SELECT` on `public.booking_requests` to `anon` — nothing else.
3. Drop the 6 blanket anon SELECT policies individually (tickets, ticket_items, customer_participants, instructors, conversations, groups).
4. Keep the `booking_requests` policies as-is: INSERT stays open (required by the published flow), SELECT stays `qual = true` for now (RLS cannot see the magic-token query param — see D1), UPDATE stays authenticated-only.
5. No schema changes; no authenticated/service_role policy, grant, function or trigger touched.

## Phase C — Verification

1. Anon-key probes: valid `booking_requests` INSERT → success; SELECT with token → row returned; any other table (e.g. `tickets`, `customers`, `invoices`) → permission denied.
2. Re-run the published public flow E2E (second test request, cleaned up) — submit + confirmation must still work.
3. Supabase linter run; expect remaining flags on `booking_requests` (documented residual risk D1).
4. Nothing published, nothing deployed. Office/teacher regressions are not testable (no office login) — mitigated by not touching any authenticated path.

## Rollback

`supabase/rollback/p02_step2b_rollback.sql`: re-grant wide anon table/sequence privileges, recreate the 6 blanket policies, restore the two `ALTER DEFAULT PRIVILEGES` statements — i.e. exactly the state source `20260929215248` documented. Precedence: this restores the known pre-2B state; it is written and reviewed before Phase B runs.

## Decisions and residual risks

- **D1 — booking_requests anon SELECT leak (accepted for now):** the SELECT policy `qual = true` lets anyone with the public key read all booking requests (names, contacts). RLS cannot scope it by token; the only real fix is publishing the new flow, which reads via the Edge Function. Recommendation: publish the new booking flow immediately after 2B lands green, then a follow-up migration removes even the `booking_requests` anon grant (whitelist → empty).
- **D2 — whitelist growth:** if Phase A shows the published flow reading more tables (e.g. vouchers), each addition is minimum-op and documented; anything not safely scopeable is a flagged product decision, not opened.
- **D3 — office app on the same bundle:** staff pages run under authenticated policies, unchanged by this step.
- **D4 — publish sequencing (needs your call):** 2B first (this plan) with the small `booking_requests` whitelist, vs. publishing the new flow first and going straight to zero anon table access. 2B-first is reversible without a publish; publish-first removes the D1 leak sooner.
