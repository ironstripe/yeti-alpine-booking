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
## Resumed authorised work — 2026-10-25

### Narrow Workbox fix
`vite.config.ts` changes only `maximumFileSizeToCacheInBytes` from 3 MiB to 4 MiB (4,194,304 bytes). Existing patterns, runtime cache, navigation and application code remain unchanged; the application bundle is not excluded. Automatic preview build `10:47:18Z` reports build OK before dependent B03b edits; `10:48:45Z` and `10:49:03Z` also report build OK after frontend changes. No manual build or restart, publication or deployment.

### Implemented read-only detail scope
`bookingReadProjection.ts` projects one entry per existing line with stored nullish amount fallback (`0` stays `0`). Appointment-linked lines get only their canonical linked people, actual appointment date/time/teacher/meeting point, never all customer people or a misleading legacy fallback. IDs—not names—preserve distinct same-name people; missing historical name is neutral. Missing appointment and query failures are distinguishable from absent names.
`useBookingReadProjection.ts` performs at most four batched minimal-field reads (appointments and links, then names and teacher directory). React Query cache is separate from editing. `BookingDetail` passes projection only to detail cards; the original ticket object and invoice `lineItems` remain unchanged. `TicketItemEditCard` preserves all existing edit actions/form state and enrolled group AM/PM/lunch behaviour; both amount displays now use nullish fallback. No prices/tax/discounts/payments/totals are recalculated.

### Read rights verified without changing them
Read-only live catalog checks confirm appointment/participant FK paths; authenticated SELECT on both canonical tables and staff RLS (`is_admin_or_office`), plus teachers' own-assignment policies. `instructors` has no authenticated whole-table SELECT but **does** grant SELECT on `id`, `first_name`, `last_name`, exactly the directory columns this reader requests. No rights widened, no DDL or data mutation. Empty restricted appointment results become an explicit missing-data problem, not a legacy participant substitution.

### Document boundary — deliberately blocked
All relevant renderer callers traced: BookingDetail preview and hidden print → InvoicePrintTemplate; issue-invoice/invoice-service preserves existing non-draft invoice/payment snapshots; courseDelivery initial attachment → invoiceDocument, retries use B04 frozen payload/digest. Other print/report/voucher/shop/event callers do not supply an invoice version boundary. Invoice line text is currently derived from live items independently of payment snapshots. There is **no persisted trustworthy new-document projection version**. Therefore changing local/server invoice lines would redraw existing issued invoices, including on later visits or first attachment generation for an old invoice. No guessed date/status cutoff was added.
Safe detail scope is complete; new document R6 is blocked, not claimed complete. Minimal proposal requiring separate authority: agree a persisted projection/version boundary at issuance and immutable source for those line descriptions; then opt only those documents into canonical projection. No such schema or snapshot architecture implemented here. Existing historical local invoice zero fallback is intentionally untouched as part of preserving old output; the detail card zero bug is fixed.

### Verified tests (synthetic/intercepted only)
- `bun test tests/bookingReadProjection.test.ts tests/canonicalPrivateEdit.test.ts tests/ticketItemSessions.test.ts tests/checkoutDueDate.test.ts tests/schedulerVisibleFilters.test.ts`: **63 passed, 0 failed, 122 assertions**. Seven new projection tests cover R1 two people/one105 line, R2 distinct per-lesson assignments/blocks, R3 zero/discount/NULL, R4 mixed group/lunch/legacy unchanged counts, R5 duplicate names/unknown identities, R7 missing appointment and batch-read rejection. Inputs remain unchanged.
- `python3 tests/bookingReadProjectionBrowser.py`: production BookingDetail and actual TicketItemEditCard under MemoryRouter/QueryClient; **desktop1280×1800 and mobile390×800 pass**. Names (including literal `<S>` escaping), actual lesson times/teachers, CHF0, enrolled AM/PM, lunch, one batch query per canonical relation, injected participant failure visibly shown. Historical invoice preview remains legacy and hidden print HTML stays identical before/after projection reload/error. No business write or runtime error; existing read-only instructors_ops_list POST is simulated. All external requests intercepted; screenshots under `/tmp/browser/b03b/` reviewed.
- `python3 tests/canonicalPrivateEditBrowser.py`: **48 checks, 0 failures**; existing B03a hydration/acknowledgement/stale protections unchanged.
- `python3 tests/checkoutPersistenceBrowser.py`: **130 checks, 0 failures**; B01 remount/new-reset and B02 synthetic payload dates preserved, not hosted B02 acceptance.
- `deno test --node-modules-dir=none --allow-env supabase/functions/_shared/invoice-service.test.ts`: **11 passed**; frozen payment/due-date regressions intact.
- Local baseline+ONLY B04 SQL/PostgREST/fake transport harness: **19 passed**, including identical frozen invoice attachment/key retry bytes. No provider request.
- Automatic frontend preview builds OK as above. No separate manual typecheck was run; automatic preview compile is the compilation evidence.
R8 verified to these limits via unchanged invoice renderer/service/delivery files, historical browser print comparison and frozen synthetic retry tests; no real historical invoice/provider E2E or Gmail was run. R6 local/server NEW document agreement is blocked as described, not silently tested using historical regeneration.

### Files / identity / release
Implementation/test checkpoint `9ad57ac1f57f93ffc94d2310727ecff55b4180cc` (documentation/roadmap finalisation follows; checkpoints managed automatically). Changed: `vite.config.ts`, `src/lib/bookingReadProjection.ts`, `src/hooks/useBookingReadProjection.ts`, `src/pages/BookingDetail.tsx`, `src/components/bookings/TicketItemEditCard.tsx`, `tests/bookingReadProjection.test.ts`, `tests/bookingReadProjectionBrowser.py`, `AGENTS.md`, `roadmap.md`, this report. B04, B01/B02/B03a and scheduler implementation files untouched outside this shared detail card's display-only props/amount formatting.
No publication, backend deployment, installed migration, live writes, real booking/invoice/message or historical repair. Detail/cache release is frontend-only and requires separate publication authorisation; no DB/function release needed for this detail reader. B03a/B04 pending releases remain independent. Rollback only these frontend projection/card imports/tests and cache ceiling (restoring 3 MiB would reintroduce the build risk); retain other packages and all data. New document scope requires a separately approved boundary before implementation. B02 remains unaccepted.
