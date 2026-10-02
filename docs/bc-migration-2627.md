# Buchungsübernahme 26/27 — preparation milestone (read-only)

Implemented: normalized package contract `yeti.bc-migration.normalized` v1 (`src/lib/bcMigration/contract.ts`),
pure evaluator (`evaluate.ts`), scheduler row projection (`schedulerProjection.ts`, uses shared
`src/lib/schedulerCollapse.ts` also used by `useSchedulerData`), staff dry-run card in Settings › Datenimport.
No apply action, no writes, no persistence of file contents.

## Named blockers (not solved here)
- Original Booking-Corner export adapter: CSV schema not obtained; package `manifest.adapter` null → blocker.
- Group planning teacher source; Rechnung / Rückerstattung / Internetzahlung semantics (must be `semantics_confirmed`).
- Absence, booking-collision (beyond existing-item overlap) and capability checks: no server check → blocker.
- Instructor source links + deployment windows are HR-protected: readable only for super_admin; otherwise
  mapping is reported unverifiable (no RLS bypass, no name matching).
- "unchanged" status needs a target migration journal; not emitted.
- Target schema has no invoice-level payment allocation.

## Prerequisites for a later apply milestone (not implemented)
- Migration mode: `ticket_item_instructor_notification_trigger` enqueues instructor notifications on insert with
  an assigned instructor; `skip_documents` alone does not suppress it.
- Season assignment trigger derives season from `created_at`, not service date.
- Inserting `payments` does not update `tickets.paid_amount` in the current trigger set.
- Apply must be server-side, idempotent, atomic per sale, journaled with rollback and cutover — never a browser loop.
- No live scheduler end-to-end proof exists until a controlled rehearsal.
