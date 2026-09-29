# Plan: P0.2 — Public booking stays working, no PII exposure, no direct writes

Baseline is the current state after Step 2B (live since 23:5x UTC): anon has only INSERT + SELECT on `booking_requests`; all other anon table/sequence grants and the 6 blanket anon policies are gone; ~117 policies still read `TO public` but only pass for signed-in users.

## 1. Inventory (current repository + live)

### Direct browser → table calls
| Caller | Tables | Who |
|---|---|---|
| Published site `/book/*` (old bundle, `gJ()` hook) | `booking_requests` INSERT + SELECT `*` by magic_token / request_number | anon |
| Current repo `/book/*` (unpublished) | none — uses `submit-booking-request` / `get-booking-request` | anon |
| Office app (BookingWizard, BookingDetail, Scheduler, etc.) | almost all tables | authenticated staff |
| Instructor portal | tickets, ticket_items, groups, absences, etc. | authenticated teacher |

### Edge Functions reachable without login (verify_jwt=false)
| Function | Purpose | Caller check today |
|---|---|---|
| submit-booking-request | website request submission | input validation + idempotency key |
| get-booking-request | request status by magic token | 64-hex token, generic 404 |
| get-products | catalogue for Onepager | none (public metadata) |
| get-availability | free slots for Onepager | none |
| create-reservation | Onepager provisional booking | none (input only) |
| confirm-booking / get-booking-status / cancel-reservation | Onepager follow-ups | ticket_id + reservation_token |
| get-public-instructors | website portraits | filters active + show_on_website |
| intake-booking | Onepager server intake | x-api-key (YETI_INTAKE_API_KEY) |
| check-instructor-availability | office helper | **none — unverified caller** |
| webhook-email / webhook-whatsapp | inbound messages | **no signature check** (whatsapp only verify token on GET) |

Malbun Onepager: calls Core only through its own server proxy to get-products, get-availability, create-reservation, confirm-booking, get-booking-status, cancel-reservation, intake-booking (contract verified earlier). No direct table access. Its repo is not in this project; the call list comes from Core functions + earlier contract tests.

### Genuine public needs -> safe replacement
| Need | Replacement | Status |
|---|---|---|
| Metadata (products, prices, levels) | get-products | exists; verify response fields |
| Availability | get-availability | exists; verify no instructor names/IDs beyond need |
| Booking submission | submit-booking-request, create-reservation | exist; add rate limit to create-reservation |
| Magic-token status | get-booking-request, get-booking-status | exist, tested |
| Public profile | get-public-instructors (name, avatar, teaser, specialization) | exists, opt-in |

## 2. Access matrix (target)

| Data | anon | auth, no role | teacher | office | admin | service_role |
|---|---|---|---|---|---|---|
| Catalogue (products, price tiers, rates, skill_levels, seasons) | via function only | none | read | read/write | read/write | all |
| booking_requests | via function only (end of Stage 2) | none | none | read/write | read/write | all |
| tickets, ticket_items, master_bookings | never | none | own assigned items, minimal fields | all | all | all |
| customers, customer_contacts, customer_participants, customer_credits | never | none | participant name/level for own groups only | all | all | all |
| conversations, email/whatsapp logs, notifications | never | none | own notifications | all | all | all |
| invoices, payments, payment_profiles, vouchers, refunds, shop_* | never | none | none | all | all | all |
| instructors (internal record, rates, contact) | never (portraits via function) | none | own row | all | all | all |
| instructor_absences / recurring_blocks | never | none | own | all | all | all |
| groups, trainings, group_course_* (planning) | never | none | assigned only | all | all | all |
| settings, user_roles, AI config/docs | never | none | own role row | read (settings) | all | all |

anon may never read or write directly: tickets, ticket_items, master_bookings, customers, customer_contacts, customer_participants, customer_credits, conversations, email_logs, whatsapp_notifications, invoices, payments, payment_profiles, vouchers, voucher_redemptions, refund_requests, booking_cancellations, booking_consents, instructors, instructor_absences, instructor_recurring_blocks, instructor_activity_log, groups, trainings, training_*, group_course_*, user_roles, school_settings, shop_*, inventory_*, notifications, action_tasks. (Enforced today since 2B; stays enforced.)

## 3. Stages

### Stage 1 — Verify / harden public replacements (functions only, no RLS changes)
1. Response audit of each public function above: list returned fields, remove any PII, internal IDs not needed, or raw DB errors.
2. check-instructor-availability: add `requireRole(office, admin)` (office helper, not public).
3. create-reservation: basic abuse limits (payload size, participant cap, per-IP throttle via existing tables or in-memory window) — no schema change.
4. Webhooks: verify Resend (svix) signature on webhook-email; verify Meta `X-Hub-Signature-256` on webhook-whatsapp POST. Needs secrets RESEND_WEBHOOK_SECRET / WHATSAPP_APP_SECRET (product decision D3).
5. Tests: extend the Deno test suite + one live anon probe per function (happy path, wrong token 404, no PII keys in response).

### Stage 2 — Publish new form path, then close last anon grant
1. Publish the current app (new form path) — needs your go-ahead (D1).
2. Confirm on the published bundle: zero direct `booking_requests` calls.
3. Migration: `REVOKE ALL ON public.booking_requests FROM anon`; change the three booking_requests policies from `TO public` to office/admin. Rollback script restores 2B state.
4. Test: website submit + confirmation page E2E on published site; anon REST probe → 401 on every table.

### Stage 3 — Role-scoped authenticated policies (teacher / no role)
1. Replace `auth.role() = 'authenticated'` / `USING true` policies with `is_admin_or_office(auth.uid())` for staff tables; teacher-scoped policies via `get_instructor_for_user(auth.uid())` for own row, absences, assigned ticket_items/groups.
2. Teacher portal needs participant/customer minimal fields: serve through a SECURITY DEFINER view or function returning only name, age, level for assigned items (no contacts, no payments).
3. Staged per table group (planning, customers, finance), each with its own rollback script; test with the teacher account (ivo.streiff71) and an office account.
4. Requires an office login for verification (blocker today).

## Decisions needed
- D1: approve publishing the current app before Stage 2.
- D2: can teachers see other instructors' names in shared groups (F1)?
- D3: provide webhook signing secrets for Resend and WhatsApp, or accept unsigned webhooks until later.
- D4: open signup allowed? If no, disable signups so "authenticated, no role" accounts cannot appear.
- D5: office test login for Stage 3 verification.

## Rollback
Each stage is independently reversible: Stage 1 = redeploy previous function versions; Stage 2 = `p02_step2b_rollback`-style script re-granting anon INSERT/SELECT on booking_requests; Stage 3 = per-table-group scripts restoring prior policy text.
