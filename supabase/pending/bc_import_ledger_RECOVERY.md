# Booking-Corner import – selective recovery (operator notes)

Status: the migration `supabase/pending/bc_import_ledger.sql` is pending review and has **not** been applied.

## What the ledger holds
`public.instructor_import_ledger` gets one row per run per instructor:
- **`kind = updated`**: the exact instructors row before the first change by that run. That means every column, nulls included, plus pay, website flag and avatar. The row also holds the HR-private row, the source link, the deployment windows and the photo metadata. Each of these related rows is marked as present or absent.
- **`kind = created`**: the run, the source ID and the actual new UUID. Only real inserts get this row. A reimport or an existing link never creates one.

Guarantees:
- The ledger row and the change are made in the same per-row subtransaction. If a row fails, no ledger row is left behind.
- On a retry, the first image is kept and never overwritten.
- Same-run retry guard: retrying a row this run already applied re-applies it only if all 10 import-owned fields still hold what this run wrote. Otherwise the row becomes an `edited_since_same_run_apply` conflict and nothing is touched. Reimports in a new, separately reviewed run keep Booking-authoritative semantics.
- The ledger cannot be changed: UPDATE, DELETE and TRUNCATE are blocked, even for the owner.

## Forward order (each step needs owner approval)
1. Review the migration SQL, its grants and the rollback.
2. Run `supabase/tests/bc_import_ledger_test.sql` in the SQL editor while the migration is still pending. It embeds the migration and rolls it back. Expect `all_passed = true`. If any identity is missing, report the result as UNVERIFIED.
3. Apply the migration through the migration tool, using the exact file contents byte for byte.
4. Re-run the ledger test, the Gate A test and the scheduler test. Confirm the live counts are unchanged: 31 instructors, 14 roles, 2 public team, 0 Booking links.
5. Only after that, a separately approved pilot or full Apply.

## Dry-run (read-only, operator only)
Run this in the SQL editor as postgres. Callers with the `authenticated` or `anon` role are refused.
```sql
SELECT public.bc_recovery_dry_run('<run_id>');                    -- whole run
SELECT public.bc_recovery_dry_run('<run_id>', ARRAY['<uuid>']::uuid[]);  -- selected instructors
```
The output contains field names, verdicts and reference counts only. It never contains values or raw HR data.

**`verdict = stop`** for a row means it must not be recovered automatically. Possible reasons:
- `edited_after_import:<field>`
- `pay_changed:<field>`
- `profile_changed:<field>` (this includes the website flag and the avatar)
- `hr_private_changed_after_import:<field>` (the live HR row compared field by field with what this run wrote, with no time window)
- `manual_photo_after_import`
- `photo_metadata_changed` / `photo_current_changed` (photo IDs and metadata compared with the captured photos, never with timestamps)
- `bookings_since_import`
- `private_appointments_since_import`
- `later_import_touched`
- `referenced_cannot_delete` (for created rows; `references` lists the tables involved)
- `instructor_no_longer_exists`

**`restorable`** means each field that the import changed still holds the imported value.

**`unreferenced_create_candidate`** means nothing outside this run's own rows points at that UUID.

Also check `counts.applied_without_ledger`. It must be 0.

## Not provided (on purpose)
- No restore function.
- No global restore.
- No deletion of instructors.

Any actual recovery needs a separately reviewed, per-instructor SQL statement based on a dry-run result. That statement must never overwrite manual photos or pay, and never delete a referenced teacher.

## Rollback
Run `supabase/rollback/bc_import_ledger_rollback.sql` only in an emergency. It restores the live `bc_apply_batch` byte for byte (sha256 `a20fda4a…`) and drops the dry-run function. The ledger table is kept by default.
