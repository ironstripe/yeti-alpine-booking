# Buchungsübernahme 26/27 — preparation milestone (read-only)

Implemented: normalized package contract `yeti.bc-migration.normalized` v1 (`src/lib/bcMigration/contract.ts`,
total structural validation that never throws), pure evaluator (`evaluate.ts`), PRIVATE-only scheduler projection
(`schedulerProjection.ts`, uses shared `src/lib/schedulerCollapse.ts` also used by `useSchedulerData`),
staff dry-run card in Settings › Datenimport (5 MB limit, stale-run guard, generic errors, per-sale details,
downloadable JSON report held only in memory). No apply action, no writes, no persistence of file contents.

**No sale is import-ready in this milestone** (`import_ready: false` on every result, `totals.import_ready = 0`).
`data_review_ok` only means the data review found no sale-level blocker.

## Named blockers (not solved here)
- Original Booking-Corner export adapter: CSV schema not obtained; `manifest.adapter` null → blocker.
- Target reference verification: `target_customer_id` / `target_participant_id` are UUID-shape checked only;
  existence is not verified → per-sale blockers.
- Group/Saturday: source group identity (`source_group_id`) is preserved and reported once per group across sales
  (`shared_groups`), but mapping to a real target `group_course_instances` row plus enrollment linkage is not
  implemented → `group_target_mapping_unavailable`, no scheduler projection, per-sale price kept.
- School (`school_camp`/`school_group`): native projection UNSUPPORTED. Current live model:
  `SchoolCampBooking` writes `tickets.ticket_type='school_camp'`, `ticket_items.item_type='school_group'`,
  `group_name`, headcount and `custom_start_time`/`custom_end_time`; `useSchedulerData` selects
  `time_start`/`time_end` and falls back to 09:00/10:00. That mismatch is documented, not changed. Kind, slot
  times and headcount are preserved; no `group_course_instances` are emitted.
- Collision checks unavailable: group instances, instructor absences, source-source overlaps. Teacher/date/time
  overlap with existing ticket_items is a collision CANDIDATE, not proven duplicate identity.
- Absence and capability checks: no server check → blocker.
- Lifecycle: raw booking/item/invoice status, sent/paid evidence and source balance are retained; missing values
  block status preservation; the target status mapping is undefined → global blocker.
- Finance: invoice number/document/due date/payment reference must come from the source (no defaults).
  Reconciliation requires explicit per-item invoice allocations; otherwise "unavailable" (not inconsistent).
  Overpayment → signed negative rest, treatment unresolved. Unconfirmed movements are never counted as settled.
- Instructor source links + deployment windows are HR-protected: readable only for super_admin.
- "unchanged" status needs a target migration journal; not emitted.
- Target schema has no invoice-level payment allocation.

## Scheduler proof scope
Only the shared PRIVATE appointment collapse (one block per private lesson). No group/school scheduler proof and
no live end-to-end proof until a controlled rehearsal.

## Prerequisites for a later apply milestone (not implemented)
- Migration mode: `ticket_item_instructor_notification_trigger` enqueues instructor notifications on insert with
  an assigned instructor; `skip_documents` alone does not suppress it.
- Season assignment trigger derives season from `created_at`, not service date.
- Inserting `payments` does not update `tickets.paid_amount` in the current trigger set.
- Apply must be server-side, idempotent, atomic per sale, journaled with rollback and cutover — never a browser loop.
