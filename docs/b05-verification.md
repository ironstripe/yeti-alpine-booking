# B05 — Office saved-ticket booking confirmations

## State
Implemented and locally tested only. No installed SQL, Edge deployment, publication, live booking/payment writes, provider request, real email or Gmail receipt. B02 hosted retest remains **not accepted**. B03b detail projection, B03a editing, B04 leased/legacy boundaries and scheduler retained.

Start inspected HEAD: `e62167a5d5a7588eb3f034a11a480b556d4ae96d`; final implementation SHA is supplied in the closing handoff (automatic checkpoints, not manually committed). User's B04 reference `17b4f3da73199b9ac55345b28b9798a3d66721ad` was not assumed to be deployed.

## Implementation/files
- `drizzle/migrations/0023_b05_office_confirmation_intent.sql`: unnumbered pending SQL; service-only intent row; `b05_office_create` wraps existing finalized private/group transactions. First explicit choice persists with ticket/people/payment; replay returns original choice without backfilling historic bookings. B04 column availability checked before canonical write. No triggers/sends/finance changes.
- `supabase/functions/private-appointments/index.ts`, `_shared/privateAppointmentsContract.ts`, `staff-group-booking/index.ts`: optional additive choice selects wrapper; old callers retain old RPC. office/admin authorization unchanged.
- `src/lib/privateAppointmentsApi.ts`, `staffGroupBookingApi.ts`, `src/hooks/useCreateBooking.ts`: send choice carried to canonical transaction; stable browser session key survives successful response and later retry. Return saved-ticket post-success action, no delivery in mutation failure path.
- `supabase/functions/staff-booking-confirmation/{index,handler}.ts`: strict staff-only status/process/send with ticket ID only; saved recipient; B04 ensure/claim/freeze/retry; no invoice/website finalize/test sender. Creation OFF never automatically sends. Explicit later send can initiate first send. Sent stays sent; legacy unsent remains review-required; no force/client recipient/HTML.
- `_shared/courseDelivery.ts`: optional injected fresh-confirmation-vars resolver only; frozen payload path unchanged; other consumers retain existing builder.
- `_shared/officeConfirmationContent.ts`, `_shared/bookingReadProjection.ts`, `src/lib/bookingReadProjection.ts`: shared B03b read projection; full canonical people/dates, correlated AM/PM group enrollments, stored zero/net amounts, saved legacy single-day overrides; no internal/instructor notes. Existing active template placeholders retained, escaping still by existing renderer. Ambiguous legacy multiday rows without trustworthy actual blocks fail closed, not flattened.
- `src/lib/bookingConfirmationApi.ts`, `src/hooks/useBookingConfirmation.ts`, `src/components/bookings/BookingEmailDeliveryCard.tsx`, `src/pages/BookingDetail.tsx`: saved-ticket real business caller replaces only test-send use in details; refresh/status/retry outcomes, no background send. Template editor test capability unchanged.
- `src/components/bookings/wizard/{Step4Summary,BookingSuccessModal}.tsx`: duplicate-click lock, visible saved booking before asynchronous delivery; explicit status rather than promised/false sent; HTTP200 success:false handled.
- `AGENTS.md`, `roadmap.md`: structural rule and bounded status.
- Tests: `tests/b05Intent.integration.mjs`, `b05Delivery.integration.ts`, `b05Content.test.ts`, `b05ConfirmationBrowser.py`; updated `checkoutPersistenceBrowser.py`, `bookingReadProjectionBrowser.py` interception/waiting for real loaded error state.

## Evidence
- Local SQL production baseline + existing canonical prerequisites + ONLY pending B04/B05 additions: **7/7** intent transaction tests. Private/group ON/OFF concurrent lost-response/replay: one ticket/person/payment/intent, original choice; intent failure rolls back all writes; old replay not backfilled; service-only grants and invalid input.
- Local PostgreSQL/PostgREST + fake injected transport (nonlocal HTTP denied): **24/24**, including original **19 B04** tests + 5 B05 cases (matrix within case). Saved recipient ON/OFF/NULL, explicit later first-send, saved ticket after mail failure, HTTP200 false, prior sent, concurrent one handoff, unknown/expired/corrupt review, strict input and injected auth denial, schema unavailable. Uses existing customer-email migration prerequisite for NULL case, no new live schema relaxation.
- Deno content **3/3**: two people/multiday/AM+PM, zero saved amount, no notes, legacy override, missing canonical/ambiguous group fail closed. Local delivery verifies actual existing renderer escapes `<Customer>` and includes real time blocks.
- Targeted frontend **29/29** (83 assertions): B03b projection, B02 due dates, B03a edit pure rules.
- Real Step4Summary/useCreateBooking intercepted browser: **132 checks**, desktop 1280 and phone 390; B01 remount/reset choices and B02 actual outgoing finance/due-date contracts; added saved-ticket-only process request and HTTP200 failed outcome, zero unhandled writes/runtime errors. All external calls intercepted, no sends.
- Real BookingDetail intercepted desktop/phone: first-send and failed retry exactly `{ticket_id,action:"send"}`, status uses `status`; no test endpoint; B03b names/zero/group/lunch/error/invoice bytes retained. B03b independent browser regression also passes both sizes.
- `deno check --node-modules-dir=none` all 3 affected endpoints passed; repository `check:functions` three endpoints passed; automatic preview log **build OK**. No manual application build/typecheck.

## Limits / fail-closed release gate
- Legacy browser create remains non-atomic; no claim of atomic legacy response-loss recovery. Only after its existing success is an explicit send attempted; no durable choice on legacy incomplete writes. Canonical/source group paths are the durable target.
- Intent is durable, but a total browser crash after commit before processing leaves pending intent for explicit staff action/status. No background catch-up introduced. Retry in the same retained wizard/session uses the original submission key; no claim of cross-device reset recovery.
- Legacy unsent delivery rows stay review-required; existing sent rows are never resent. Ambiguous old multiday lines cannot receive inaccurate content; staff review needed. No historic repairs/backfills.
- Endpoint actual JWT validation is existing requireRole; new handler tests inject denied 401/403, not hosted teacher/anon tokens. Existing B04 local RLS tests retained. Hosted permissions/config, exact real active template layout, provider/Gmail and operational issue flows untested.
- Existing sender configuration unchanged; missing SQL/functions/config cannot use test/legacy fallback or show sent. Frontend activation MUST await coordinated backend readiness. Current draft is not a release approval.

## Staged release / consumer-first rollback
Separate authorization required: verify current B04 and canonical prerequisites; install reviewed B04 SQL, then reviewed B05 SQL; deploy all B04 consumers/guards first (including old legacy consumers), then B05 private-appointments + staff-group-booking + staff-booking-confirmation with its shared files; run controlled non-provider contract checks; activate frontend last. No automatic sends or data backfill. Real sends require explicit separate permission.
Rollback frontend activation first; stop B05 consumer calls before reverting create consumers. Do not re-enable unsafe old detail test/legacy send fallback. Preserve intent, delivery rows, frozen payloads and email logs. Retain additive B04/B05 schema until no consumers depend on it; do not delete provenance/history or resume old consumers able to claim leased rows.

## Retest handoff (not acceptance)
- **HB084**: identified released bundle, authorized Office private/group ON/OFF/missing-email create, retained choices and lost response replay; read saved ticket/people/payment/intent; actual saved recipient.
- **HB085**: mail failure/503 after commit keeps saved ticket visible; details explicit first-send/retry; already sent no duplicate; no test-mail endpoint.
- **HB086**: B04 installed protocol and frozen bytes/key, concurrent one handoff, unknown within 24h vs expired/corrupt review; old consumers cannot claim leased rows. Actual operational acceptance pending.
- **HB093**: released full canonical/group/legacy content, separate blocks, two people, escaped names/no notes; controlled actual email/Gmail receipt only with separate send authority.
HB081/082 from B04 and B02 hosted retest remain open separately. This report proves local synthetic contracts, not deployment or Gmail delivery.
