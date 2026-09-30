# Plan: P0.2 — Fail-closed, publication-safe sequence (revised)

Rejected and withdrawn: D1 (accepting anonymous SELECT on `booking_requests`), the global REVOKE approach, and the `p02_step2b_rollback.sql` file. That rollback file re-grants ALL TABLES and ALTER DEFAULT PRIVILEGES to anon; it is marked forbidden and must never run. No step below reintroduces blanket grants, blanket public policies or default-privilege grants.

## 0. Current risk statement (verified live 23:5x UTC)

- **The published bundle is unsafe.** It inserts into `booking_requests` directly and runs `select("*")` on it by `magic_token` and by `request_number`.
- **The anon grant is still open.** anon holds `SELECT, INSERT` on `booking_requests`, and the SELECT policy is `USING (true)`. Anyone with the public key can read all booking requests, including PII.
- **This leak is live now and is not an accepted state.** Only two exits are safe:
  - **(A)** Publish the reviewed safe frontend after an explicit release confirmation and a passing smoke test, then run the Stage 2 hardening immediately.
  - **(B)** Put public booking into manual fallback, then run the Stage 2 hardening. No publish of the new form is needed for this. Details follow.
- **Other PII tables are already closed.** `tickets`, `ticket_items`, `customers`, `customer_participants`, `conversations`, `groups` and `instructors` have no anon grants and no anon policies since 2B. Stage 2 re-asserts this by name.

## 1. PRE-PUBLISH gate (verification only, no publish)

| Check | Evidence (current commit cec380b) | Status |
|---|---|---|
| Public source uses only functions | `rg` finds no `from("booking_requests")` in `src/`. Submit goes through `useBookingRequest.ts:46` → `submit-booking-request`. Confirmation goes through `RequestConfirmation.tsx:85` → `get-booking-request`. | verified |
| Functions live | OPTIONS 200 on both. An empty POST returns 400 from submit and 404 from get (generic). | verified |
| Least-privilege payloads | submit returns only `{requestNumber, magicToken}`. get returns display fields only, with no IDs, e-mail, phone or raw row. | verified in code; re-probe in smoke test |
| No other public direct table calls | The `/book`, `/book/private`, `/book/group` and voucher check pages made zero REST calls on the live site. | re-run on preview build |
| No real outgoing e-mail in the smoke test | submit has **no test switch** and would call Resend. Today Resend rejects the sender domain, so no mail leaves, but that is incidental. | **gap → G1** |

**G1 (required before any smoke test, small code change, needs approval):** in `submit-booking-request`, skip the Resend call and log `skipped_test` when the customer e-mail ends with the reserved test domain `@smoke.invalid`. `.invalid` is reserved by RFC 2606 and can never be delivered. Everything else stays unchanged.

**Smoke test (preview and test backend, synthetic data only):**
- Customer: first name "P02", last name "Smoke", e-mail `p02-<ts>@smoke.invalid`, phone `+41 00 000 00 00`.
- Participant: "Test Kind", age 10.
1. Submit on `/book/private` and on `/book/group`. Expect a 200 response containing exactly the keys `requestNumber` and `magicToken`.
2. Submit again with the same submissionKey. Expect the same requestNumber and no second row.
3. Open `/book/request/<token>`. The page renders and the response has no id, e-mail or phone keys. A bad token gives 404.
4. Network capture: only `/functions/v1/submit-booking-request` and `/functions/v1/get-booking-request` are called, with zero `/rest/v1/*` calls.
5. `email_logs` shows `skipped_test` and Resend shows no call.
6. Clean up by deleting the rows whose e-mail contains `@smoke.invalid`.

## 2. Option B — Manual fallback (for when no release is confirmed)

- **The old bundle's form cannot be switched off from the server without breaking visibly.** Once the anon grant is revoked, its submit shows an error to the visitor.
- **B-lite (no publish):** revoke the grant (Stage 2.2) and accept that the old form errors. Enquiries go by phone or e-mail, using the contact details already shown on the site.
- **B-full (needs a publish, but only of a fallback page):** replace the `/book/*` routes with a static "please e-mail or call" page. It needs the same release confirmation as Option A.
- **Recommendation:** Option A. If the release is not confirmed within the same session, use B-lite.

## 3. Stage 2 — Named-list migrations (no loops, no ALL TABLES)

**2.1 Re-assert closed PII tables.** Idempotent; runs now under A or B.

```sql
REVOKE ALL ON public.tickets, public.ticket_items, public.customers,
  public.customer_participants, public.conversations, public.groups,
  public.instructors FROM anon;
DROP POLICY IF EXISTS "Public can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Public can view ticket_items" ON public.ticket_items;
DROP POLICY IF EXISTS "Public can view customer_participants" ON public.customer_participants;
DROP POLICY IF EXISTS "Public can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public can view groups" ON public.groups;
DROP POLICY IF EXISTS "Public can view instructors" ON public.instructors;
```

**2.2 `booking_requests`.** Runs right after the smoke test on the published bundle (A) or immediately (B-lite).

```sql
REVOKE SELECT, INSERT ON public.booking_requests FROM anon;
DROP POLICY "Anyone can create booking requests" ON public.booking_requests;
DROP POLICY "Anyone can view requests by magic token" ON public.booking_requests;
-- "Authenticated users can update booking requests" left unchanged (authenticated scope is Stage 3)
```

- The office inbox reads through authenticated sessions: it has an authenticated grant and needs an authenticated SELECT policy. Before 2.2, verify that an authenticated SELECT policy exists on `booking_requests`.
- If none exists, 2.2 adds exactly one: `FOR SELECT TO authenticated USING (is_admin_or_office(auth.uid()))`. Without it the inbox loses access, because the dropped policy was its only read path.

**Unchanged:** authenticated policies and grants, service_role, functions and triggers.

**Legitimate public metadata:** products, price tiers, availability and portraits are served only by `get-products`, `get-availability` and `get-public-instructors`. These are key-guarded and return a limited column set. No public view is needed; no anon table grant is added.

## 4. Stage-specific rollback (never reopens direct PII reads)

| Stage | Rollback | Forbidden |
|---|---|---|
| 2.1 | none needed (no legitimate caller) | re-creating anon SELECT policies |
| A publish | Republish the previous safe commit, or switch to B-full. The DB stays in the 2.2 state. | reverting to the old bundle while the anon grant is closed, unless paired with a fallback |
| 2.2 | Code-level only: fallback page (B-full). If the new form fails, fix the functions. | re-granting anon SELECT on `booking_requests` |
| G1 | revert the one-line guard | — |

The only reversible DB action allowed is re-granting **INSERT only** plus an INSERT-only policy on `booking_requests`. It is permitted only if the old bundle must accept enquiries temporarily, and it opens no read path. (The old bundle's `.select()` after insert would still fail, so this is a last resort.)

## 5. Tests by environment (no real customer data)

| Env | Test |
|---|---|
| Preview + test backend | smoke test §1 with `@smoke.invalid` data, cleaned up afterwards |
| Published, after publish | Playwright on the live `/book/*`: zero `/rest/v1/booking_requests` calls; only `submit-booking-request` and `get-booking-request` endpoints; the bundle source grep finds no `from("booking_requests")` |
| Backend, after 2.1/2.2 | anon REST probe returns 401 on each of: tickets, ticket_items, customers, customer_participants, conversations, groups, instructors, booking_requests (SELECT and INSERT) |
| Backend | function probes: happy path with contract keys only; wrong token → 404; missing key → 401 |
| Office | inbox lists booking requests (needs an office login, D5) |

## 6. Release confirmation payload (required before any publish)

```text
Commit/version : cec380b6ee7c9564984dff03609821e0c9c97fa3 (+ G1 commit)
Frontend routes: /book, /book/private, /book/group, /book/request/:token
                 (the office app ships in the same bundle, unchanged)
Functions      : submit-booking-request, get-booking-request (already live)
User impact    : same forms; the confirmation page no longer shows
                 "Bestätigung gesendet an…"; ack e-mail still undelivered
                 (Resend domain unverified)
Fallback       : B-full static contact page, or B-lite
Verification   : §5 published-bundle test + anon probes, within 15 min
Rollback       : republish the previous safe commit or the fallback; DB stays hardened
Confirmed by   : <name, UTC time>
```

## Decisions needed
- **Choose A or B.** Recommendation: A, with B-lite as the same-day fallback.
- **Approve G1**, the test-domain e-mail guard. This is the only code change.
- **Office login (D5)** to verify the inbox after 2.2.
