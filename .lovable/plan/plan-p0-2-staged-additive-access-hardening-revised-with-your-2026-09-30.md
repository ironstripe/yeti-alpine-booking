# Plan: P0.2 — Staged, additive access hardening (revised with your constraints)

## Important: current state vs. your rules

Your rules: replacements first, then revoke only proven-unneeded access, and no blanket `ALL TABLES` grants or loops.

- **Step 2B (live since ~23:50 UTC) already broke the "no blanket" rule.** It ran `REVOKE ALL ON ALL TABLES/SEQUENCES FROM anon`, then re-granted `SELECT, INSERT ON booking_requests` only.
- **Why that was not an outage:**
  - The published site uses only `booking_requests` directly. That was measured from the published bundle and by live probes.
  - The Onepager uses only Edge Functions that are protected by the website key.
- **Decision R0:**
  - Option (a): keep 2B. Its rollback script is `supabase/rollback/p02_step2b_rollback.sql`.
  - Option (b): apply that rollback first, then redo the work per table under the rules below. That would reopen wide anon access in the meantime.
  - Recommendation: (a).

Stage 1 function work is already done: check-instructor-availability is now staff-only, instructor IDs and raw errors are removed from public responses, and the functions were redeployed.

## Stage 1 — Replacements verified before any further revoke (no DB changes)

| Public need | Endpoint | Guard | Response contract |
|---|---|---|---|
| Metadata | get-products | x-api-key | product, price tiers, season (no internal notes) |
| Availability | get-availability | x-api-key | slots + free count; no instructor IDs |
| Onepager booking | create-reservation / confirm-booking / cancel-reservation | x-api-key + reservation_token | ticket number, status, amounts |
| Website request | submit-booking-request | validation + submissionKey | requestNumber, magicToken only |
| Magic-token status | get-booking-request / get-booking-status | token, generic 404 | display fields only |
| Public profile | get-public-instructors | x-api-key, show_on_website | display_name, portrait_url, role_label, teaser |

Remaining Stage 1 items:
1. **Webhooks.** Add a Resend (svix) signature check to webhook-email and an `X-Hub-Signature-256` check to webhook-whatsapp. This is blocked until you provide the signing secrets (D3).
2. **Onepager adapter.**
   - No change needed. The Onepager only reads `free_instructors` and `available`.
   - Confirm in the Onepager repo that it never read `available_instructor_ids` (the field removed in Stage 1).
   - If it did read that field, add it back as an opaque count.
3. **Core frontend.** No change. The new form path (`useBookingRequest` → submit/get functions) already exists but is not published yet.

## Stage 2 — Revoke only proven-unneeded access (additive, per object)

- **Precondition:** publish the current app (D1).
- **Proof step:** confirm the published bundle contains zero `from("booking_requests")` calls, and capture live network traffic on /book/* showing zero `/rest/v1` calls.
- **Migration 2.1** (explicit, one object each, no loops):
  ```sql
  REVOKE SELECT, INSERT ON public.booking_requests FROM anon;
  DROP POLICY "Anyone can create booking requests" ON public.booking_requests;
  DROP POLICY "Anyone can view requests by magic token" ON public.booking_requests;
  CREATE POLICY "Office/admin read booking requests" ON public.booking_requests
    FOR SELECT TO authenticated USING (is_admin_or_office(auth.uid()));
  -- existing UPDATE policy re-scoped the same way (DROP + CREATE with is_admin_or_office)
  ```
- **Rollback 2.1:** recreate the two policies with their original text and `GRANT SELECT, INSERT ON public.booking_requests TO anon`.
- **Compatibility:**
  - The old published bundle would break, which is why the publish must come first.
  - The office inbox keeps working, because it uses authenticated office sessions.
  - Edge Functions use service_role, so they are unaffected.

## Stage 3 — Role-scoped authenticated policies (per table group, separate migrations)

Each migration names its tables explicitly, and each has a matching rollback file that restores the exact prior policy text.

| Migration | Tables | Change |
|---|---|---|
| 3.1 finance | invoices, payments, payment_profiles, vouchers, voucher_redemptions, refund_requests, customer_credits(_usage), shop_* | `auth.role()='authenticated'` / `true` → `is_admin_or_office(auth.uid())` |
| 3.2 customers | customers, customer_contacts, customer_participants, conversations, email_logs, whatsapp_notifications | same → office/admin |
| 3.3 planning | tickets, ticket_items, groups, trainings, training_*, group_course_*, master_bookings | office/admin all; teacher SELECT only where `instructor_id = get_instructor_for_user(auth.uid())` |
| 3.4 instructor self | instructors, instructor_absences, instructor_recurring_blocks | office/admin all; teacher own row |
| 3.5 teacher view | new SECURITY DEFINER function `get_my_assignment_participants()` | returns name, age, level for assigned items only; the portal switches to it |

- **Frontend (Stage 3.5):** the instructor portal hooks that read customer_participants switch to the RPC. This is the only code change.
- **Compatibility:**
  - Accounts with no role lose all business reads. That is intended.
  - The teacher portal keeps its own-assignment data.
  - The office app is unchanged.

## Verification matrix (non-destructive)

| Check | anon | no-role | teacher (ivo) | office/admin | service fn |
|---|---|---|---|---|---|
| Direct REST SELECT on each never-list table | 401/empty | empty | own rows only | full | n/a |
| Direct REST INSERT/UPDATE/DELETE on business tables | 401 | denied | denied (except own absences) | allowed on a throwaway test row, cleaned up | n/a |
| Public functions happy path | 200, contract keys only | — | — | — | 200 |
| Wrong/missing token or key | 404 / 401 | — | — | — | — |
| Website submit + confirmation (published) | works | — | — | — | — |
| Onepager reserve → status → cancel on a test ticket | works via key | — | — | — | — |
| Office pages load (inbox, scheduler, customers) | — | — | — | works | — |

- All write tests use rows tagged `P02-TEST` and are deleted afterwards.
- Supabase linter runs after each migration.

## Decisions needed
- R0: keep 2B as-is (recommended) or roll it back and redo it per table.
- D1: publish approval (gates Stage 2).
- D3: webhook signing secrets for Resend and WhatsApp.
- D4: disable open sign-up?
- D5: office test login (gates Stage 3 verification).
- D2: may teachers see co-instructor names?
