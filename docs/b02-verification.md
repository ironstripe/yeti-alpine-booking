# B02 (F04/F11) — implementation verification

Baseline: `9bad210088014e5c2026cb30f69df501d046f6fb`. B01 and instructor changes preserved. No changes to generated auth files, settings, schemas or pricing.

## Changes
- `src/lib/checkoutDueDate.ts`: shared effective date calculation, calendar-only first lesson minus seven / local today plus seven fallback. Explicit wizard date wins; paid-now gets no new default. First date uses validated private intervals or assigned participant dates, never in-place sorts.
- `PaymentMethodSelection.tsx`: derives the display default without storing it as an explicit choice; invoice/hotel still force pay-later, leaving hotel clears partner.
- `Step4Summary.tsx`: same date for display/create, no mutating sort. B01 context choices and NULL-email guard retained.
- `useCreateBooking.ts`: same helper for private/group finalization and legacy ticket insert.
- `_shared/invoice-service.ts`: ticket lookup includes its stored date and aborts on error/missing ticket, even with client customer override. New/additional invoices use that date before existing dueDays/14 fallback. Issued replay returns unchanged; resumed draft retains its date and existing snapshot.
- `confirm-booking/invoiceStep.ts`: confirmation copies the issued invoice's date, not a second now+14 calculation. Status/payment/release semantics unchanged.
- Tests: `tests/checkoutDueDate.test.ts`, `tests/checkoutPersistenceBrowser.py`, `_shared/invoice-service.test.ts`, `confirm-booking/invoiceStep.test.ts`. Architecture rule in `AGENTS.md`; task status in `roadmap.md`.

## Checks actually run
- `bun test tests`: 290 passed, 3 skipped, 0 failed (37 files). No new skips.
- Deno real issuance/document and confirmation tests: 12 passed. Stored date beats dueDays; absence fallback; issued replay; draft date/snapshot; additional invoice; failed/missing lookup before any write; snapshot and rendered document date agree.
- `python3 tests/checkoutPersistenceBrowser.py`: 130 checks passed at 1280×1800 and 390×800. Real summary unmount/remount with retained provider, six methods, explicit dates, changed course dates, reset, B01 flags and NULL email. Real UI submit reaches intercepted private create. Real production hook tests six private methods default/manual, paid-now, group finalization, legacy ticket insert (intentionally rejected after capture). Synthetic auth/client/rows; external requests intercepted, no real business writes or runtime errors. Group/legacy invocations are hook-driven, not full UI journeys; synthetic responses do not establish database persistence.
- `bun run check:functions issue-invoice confirm-booking course-booking retry-course-booking-delivery`: all four passed with `deno check --node-modules-dir=none`.
- Automatic preview build log: build OK. No manual frontend build/typecheck command run (environment forbids duplicating harness checks); no separate standalone frontend typecheck claim.
- Read-only live schema confirms ticket and invoice deadline fields are `date`; payment snapshot is `jsonb`.
- `git diff --check` clean; generated auth files unchanged against baseline.

## Release / limitations
Frontend available in preview only. No backend deployment or publication, no historical repair, no live invoices/messages/payments/bookings. SQL finalization persistence is unchanged and source-inspected; this batch did not run a local SQL persistence suite. Hosted end-to-end persistence deliberately not exercised.

Eventual coordinated release must include the frontend and consumers bundling the shared invoice service: `issue-invoice`, `confirm-booking` (also changed invoiceStep), `course-booking`, `retry-course-booking-delivery`. No schema migration required. Active split-specific caller was not established; shared `allowAdditional` path is covered. Independent QA acceptance remains separate.

## Precise rollback
Revert only this batch's hunks in PaymentMethodSelection, Step4Summary, useCreateBooking, invoice-service and invoiceStep, remove checkoutDueDate and the new due-date/invoice tests, restore the B01-only browser test and prior invoiceStep assertions; remove this batch's architecture/roadmap/document entries. Preserve all later or concurrent changes and B01 context state. If released later, redeploy the four consumers from that selectively reverted source and republish the compatible frontend under separate authorization. No database rollback or historical-date changes.