# Phase 1 — Completion report (no further build)

Phase 1 has already been applied. This step only re-checks it without changing anything and delivers the final report. No Phase 2, no backfill, no existing booking rows touched, no UI, no Edge Function, no RLS weakening, no publish.

## What Phase 1 delivered (already live, not published)
- Participant mapping table for private appointments (participant required, attendance present/absent, one row per participant per appointment); office/admin manage, teachers see only their own appointments, no public access.
- Appointment additions: price, confirmed_at/confirmed_by, allowed status values (scheduled, booked, completed, cancelled).
- Backfill log table (server-only; no backfill ever run).
- Read-only helpers (server-only): business date (Zurich), price (matches the current app formula), protection check (past / completed / invoiced), free-slot and conflict check, reconciliation report.
- Guard on billing lines: lines linked to an appointment must mirror it; they can only be confirmed through a confirmed appointment.
- Grants tightened: signed-in users cannot wipe or alter the new tables; public access removed.
- Rollback script written and reviewed, never run (refuses to run if rows exist).

## Read-only re-verification to run
1. Row counts unchanged: appointments 0, mappings 0, backfill log 0, linked billing lines 0.
2. Public and plain signed-in access to the new tables and helpers is still refused.
3. Reconciliation report still marks the 4 older private bookings as skipped ("past").
4. Security linter shows no new findings from Phase 1.
5. Price check test: 450/450 cases match.

## Acceptance checklist
- [x] Additive schema only, no existing rows changed
- [x] Helpers and guard in place, server-only
- [x] Row-level access not weakened; no public access
- [x] SQL test and price parity test pass
- [x] Rollback script present, not executed
- [x] Nothing published

## Known limits (left open on purpose)
- Confirming multi-date private appointments stays blocked until a later phase adds the proper confirmation path.
- Signed-in users may have overly broad default rights on older tables — to be handled with the 34 existing security findings.
