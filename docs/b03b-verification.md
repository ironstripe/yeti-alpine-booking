# B03b — queued, preflight blocked

## Starting state (2026-10-25)

- Inspected HEAD: `4e6b9b7b41da50e851a358c97ab405deb559d144` (`Fixed original value check`), following `bb7b852`. Working tree initially clean. B03a was not interrupted or redone.
- Read root AGENTS.md and B03a verification; preserved B01/B02/B03a, scheduler filters/performance and auth.
- Existing retained B03a logs: `/tmp/b03a-after.log` reports 17/17 SQL checks; `/tmp/b03a-unit-final.log` reports 330 pass / 3 skips / 0 failures. These are prior execution evidence, not newly rerun tests.
- Current automatic preview check `/tmp/observability/build-errors.log`, timestamp `2026-10-25T10:36:01Z`, exits 1 in `logWorkboxResult` / `generateServiceWorker` after transforming 4038 modules. Output reports `index-BAOIwFph.js` at 3,148.17 kB. `vite.config.ts:75` sets `maximumFileSizeToCacheInBytes` to `3 * 1024 * 1024` (3,145,728 bytes); the reported bundle exceeds that limit. No frontend type error is reported in this signal; build completion is not established.
- As requested for unresolved B03a checks, stopped before dependent B03b code changes. No speculative cache/config correction or new build was run. The cache/build blocker must be resolved in its own narrow step before B03b implementation continues.

## Read-only investigation findings (not implemented)

- BookingDetail currently creates print/preview lines from live ticket items; TicketItemEditCard consumes a single legacy participant. Canonical appointments and their participants must be batch-loaded for detail display without changing write paths. Existing `ticketItemSchedule.ts` resolves group enrollment AM/PM blocks and must remain authoritative for them.
- Repository production schema baseline/migrations contain staff RLS for canonical appointment and participant reads. Current live FK/grant/policy verification was not performed.
- InvoicePrintTemplate receives live line inputs independently of invoice/payment snapshot. CourseDelivery creates initial attachment content from current items plus group quote_snapshot; retries reuse a frozen full payload/digest. Issued invoice replay in invoice-service returns the existing invoice unchanged.
- No safe persisted new-versus-historical document projection discriminator was established. Before document changes, inspect actual render inputs/lifecycle and decide whether a new-only boundary can be implemented without redrawing existing invoices; otherwise complete detail-only work and report that document limitation. No renderer, issuance or retry changes were made.

## Changes and verification this turn

- Changed only `roadmap.md` and this evidence document; no application, backend, SQL, auth or configuration files changed.
- B03b R1–R8 tests, intercepted desktop/mobile detail tests, fresh SQL/Deno/checkout regressions: **not run**, because implementation has not started.
- B02 remains unaccepted; prior mocked checkout checks do not establish hosted acceptance.
- No deployment, publication, migration installation, live queries/writes, bookings, invoices or messages. Existing test tickets/history were untouched.

## Release / rollback

- No B03b implementation commit or release candidate exists yet. The inspected baseline commit above is not a B03b implementation.
- No release authorised or performed; eventual release needs are not yet determined.
- This documentation-only change can be removed independently; there is no application or business-data rollback to perform.