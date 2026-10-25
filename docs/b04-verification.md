# B04 — delivery schema compatibility (pending release)

## Scope and identity

Authorised B04 only; baseline `7ac4ed58caaa67a9a49bb33633832c4af1460849`.
Tested implementation checkpoint: `7a96c0bb1b00122e275185d08374ca6816732f52` (final documentation/roadmap follow-up has no delivery-code changes). Git checkpoints are managed by the platform, not manually committed.

Files: `supabase/pending/b04_delivery_compatibility.sql`, `_shared/courseDelivery.ts`, `_shared/bookingDelivery.ts`, `_shared/bookingDelivery.test.ts` (the three shared paths are under `supabase/functions/`), `supabase/functions/retry-course-booking-delivery/handler.ts`, `tests/b04Delivery.integration.ts`, `AGENTS.md`, `roadmap.md`, this report. No frontend, invoice-service, lifecycle or document renderer modifications.

## Actual schema and change

Read-only inspection and the production baseline show the six missing protocol columns and a confirmation-only kind constraint. Existing unique idempotency key, ticket+kind uniqueness, ticket/email-log FKs, status check, office/admin SELECT RLS and grants are retained. Pending SQL adds nullable lease/payload/digest/provenance columns and allows invoice kind; no backfill/default, trigger, access widening or financial mutation. It has no guessed migration number and was NOT installed remotely. Only the isolated test database applied it.

New course rows explicitly insert `leased_v1`; new old-caller confirmation rows explicitly insert `legacy_v1`. Neither consumer upgrades an existing row through ignore-duplicate insertion. NULL provenance is not evidence of no handoff. Legacy pending/sending/failed rows require review; legacy sent rows remain sent, not resent. Old confirmation code cannot claim course/invoice rows or retry historical failures. The legacy first-send path remains distinct and has no automatic recovery protocol.

New recovery uses optimistic attempts/status claim, a ten-minute lease and validated first-claim timestamp/key. Unknown retry under 24 hours reuses the exact frozen mail including attachments and SHA-256; at/after 24 hours it requires review. `force` is accepted for API compatibility but cannot bypass review, missing payload or digest mismatch. Definite pre-handoff failures/provider rejection differ from unknown handoff. Failures reading schema/content/evidence, freezing payload, claiming or writing pre-send audit stop transport. Provider-accepted/durable-write failure is unknown, recoverable from durable sent evidence; no false sent result. No claim of permanent provider exactly-once.

## Verified, synthetic only

Command: `PATH=/tmp/b04-tools/postgrest-bin/bin:$PATH PGSSLMODE=disable deno run -A --node-modules-dir=none tests/b04Delivery.integration.ts` — **19 passed, 0 failed**. It creates/drops its own local database, loads baseline first, applies ONLY B04 SQL and runs local PostgREST. Non-local HTTP is blocked and transport is injected; no provider request.

Coverage: baseline rejection; unchanged historical row bytes/ACL/RLS/uniqueness; all legacy statuses; invoice-kind/duplicate constraints; real competing DB claim; old/new consumer collision; timeout same bytes/key with changed template; exact 24-hour boundary and repeated force; corrupt/missing freeze; definite rejection/new key; missing configuration; freeze/audit failure; accepted then failed durable write/reconciliation; unauthorized handler; read/evidence/claim errors; anon/teacher recipient/payload denial; frozen invoice attachment retry without invoice/document queries; incompatible schema before insert/handoff. Financial tables are compared before/after handler tests.

`deno test --node-modules-dir=none --allow-env supabase/functions/_shared/bookingDelivery.test.ts supabase/functions/_shared/invoice-service.test.ts` — **22 passed, 0 failed** (11 delivery + 11 invoice regressions including B02/frozen drafts).

`bun run check:functions course-booking retry-course-booking-delivery confirm-booking retry-booking-confirmation` — **all four passed**. Automatic preview log ends build OK; no frontend/Workbox setting changed, no manual frontend build performed. B03b's prior failure is a separate historical finding, not a B04 fix or acceptance.

## Staged release — separately authorised only

1. Review pending SQL and actual schema/consumer inventory again. Preserve a scoped row/schema record using approved handling. Confirm provider configuration and whether active course sends/recovery are externally scheduled; B04 adds no scheduler/trigger. Pause relevant sends/recovery during rollout rather than assuming they are disabled.
2. Deploy compatible guarded consumers FIRST (`confirm-booking`, `retry-booking-confirmation`, `retry-course-booking-delivery`, `course-booking` as explicitly approved). They fail closed on the old schema. This may temporarily prevent new confirmation delivery; it must not alter invoice/booking lifecycle or resend history.
3. Assign the next free tracked migration and install only the reviewed B04 SQL verbatim. Do not install the older whole `bc_2627_atomic_course_booking.sql`. Read back columns/kind constraint/unchanged grants/RLS/FKs/uniques and refresh API schema before enabling delivery.
4. Verify configuration/auth and approved HB retests, then explicitly authorise any provider sends. Never manufacture protocol timestamps/keys/frozen payload for legacy rows. Website options/state-machine availability and release gates remain separate prerequisites, not supplied by B04.

## Consumer-first rollback

Pause producers/recovery; roll back consumers only to a reviewed **guarded** version that refuses leased/invoice rows and NULL historical provenance. Do not redeploy unguarded pre-B04 consumers over the enlarged table. Keep nullable columns/invoice-kind and existing delivery/log evidence in place; no column drop, kind narrowing, payload rewrite or historical resend. Pending SQL can simply remain unapplied if rollout never begins. No automatic rollback was performed.

## Remaining limits / acceptance

No remote writes, installed migrations, deployments/publication, real messages/provider calls, automatic sends or historical repairs. Full booking/invoice E2E and Gmail evidence were deliberately NOT run. Frozen invoice retry bytes were tested with a synthetic persisted attachment; fresh real invoice rendering/provider delivery remains an operational retest. Existing invoice/frozen payment tests are regression evidence only, not B02 acceptance.

HB081, HB082, HB086 and HB093 remain open for the development lead's identified-release retests; their exact issue acceptance text was not available here, so no guessed mapping or closure. Verify approved real consumer/auth/schema/configuration, ambiguous-window/reconciliation and document/payment outputs under those original criteria. B05/B06 and B03b untouched; B02 still unaccepted.