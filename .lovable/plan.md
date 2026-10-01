# Selective before-images for the Booking-Corner Apply

## Goal
Before the import changes an existing YETI instructor, keep an exact private copy of that person as it was. If a batch goes wrong, a super_admin can put back only those people, without restoring the shared Cloud database. Screens stay the same.

## What gets saved (once per run per existing instructor)
- The whole instructor row as it was, not just the 10 fields the import changes.
- Their private HR row (wage, bank, AHV, raw values, assignments) if one existed, or a note that none existed.
- Their source link and the deployment windows that existed before the run.
- Their photo records (which photo was current).
- When it was saved, which run and staging row it came from, and a checksum of the saved data.

The 67 newly created people have no before-state. They are recorded as "created by this run" and are never deleted by a restore.

## Rules
- The copy is written in the same step as the change. If the copy fails, that person is not changed: the row is marked failed and the batch continues.
- On retry, the first copy is kept. A later copy never overwrites it.
- Copies cannot be edited or deleted, except by an explicit retention step later. Only super_admin can read them. Teachers, office, admin and the public cannot.
- No PII goes into logs.

## Restore (super_admin only, no new screen)
- **Preview first:** for each chosen instructor, or a whole run, list the fields that would go back and flag conflicts.
- **Conflict rule:** a field goes back only if it still has the value the import wrote. If someone edited it after the import, it is left alone and reported.
- **What a restore does:**
  - puts back the 10 import fields and the HR row
  - removes the source link and the deployment windows added by that run
  - puts the previous current photo back
- **What a restore never touches:** UUID, bookings, roles, status, website flags, or manual photos uploaded after the import.
- Every restore is logged in the run.
- It is called through the existing super_admin import server step with new actions `restore_preview` and `restore`.

## Gates
- Before the live change, you review the exact SQL and its rollback. It is not applied before that.
- Synthetic SQL test, inside a transaction that is rolled back, using test-only instructors:
  1. capture, then apply, then restore
  2. retry keeps the first copy
  3. a failed copy blocks the change
  4. a later office edit counts as a conflict
  5. teacher, office, admin and anon cannot read the copies
- Nothing is imported or published. Security Gate A and the backup gate stay in force.

## Technical details
- New table `instructor_import_before_images`:
  - columns: run_id, staging_id, source_id, instructor_id, kind (`updated`|`created`), instructor_row, hr_private_row, source_link_row, window_rows, photo_rows, sha256, captured_at
  - unique (run_id, instructor_id)
  - grants: service_role ALL, authenticated SELECT; RLS policy `is_super_admin(auth.uid())`
  - an immutability trigger blocks UPDATE and DELETE
- `bc_apply_batch`: on the update path, before `UPDATE instructors`, it runs `INSERT ... SELECT to_jsonb(i) ... ON CONFLICT DO NOTHING`. This happens inside the existing per-row exception block, so the copy and the change succeed or fail together. Created rows insert a `created` marker.
- New service_role-only functions `bc_restore_preview(run, ids[])` and `bc_restore(run, ids[])`. Restores are recorded in `instructor_import_runs.counts.restores`.
- Rollback file: drops the new table and functions and restores the current `bc_apply_batch` definition byte-for-byte.
- Update the AGENTS.md rule.
