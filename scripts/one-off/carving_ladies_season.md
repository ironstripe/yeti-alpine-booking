# Carving Ladies: reviewed one-off data plan (not executed)

Run only in a dedicated privileged production session after independent review:

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/one-off/carving_ladies_season.sql
```

The available Lovable data tool accepts only data-change statements, not this complete
`BEGIN / LOCK / DO / COMMIT` plan. Restricted project shell access cannot execute it.
Do not split the statements, wrap the data seed in a schema migration, or introduce a
permanent privileged helper simply to bypass this limitation.

## Exact scope and guards

- Product `8fe2a11e-362d-4f05-8964-87d6b214fc3e`; season and product attributes checked.
- One course `5029b32f-3bfb-4c2d-93b9-b8ac81d6bce7`, one Sunday schedule, 19 occurrences
  and 19 Monday-based group-1 shells, no instructors or invented skill level.
- Fixed CHF 99 copied into the mandatory legacy course price field; products/tiers unchanged.
- Planning maximum 8 uses the existing schema default, not a new sales restriction.
- Teaching course `is_internal=false` follows Office semantics; this does not publish a course.
- Missing-row races blocked by brief `NOWAIT` table locks; any concurrent edit aborts.
- Exact offering revision checked and preserved; weekday correction intentionally separate.
- Rerun rejects an existing linked/name/ID course; no silent partial completion.
- Snapshots compare unrelated source, course, billing and notification records. Only
  checksums, not customer data, are printed. Any discrepancy aborts the transaction.

## Verification

`bun tests/carvingLadiesSeason.integration.mjs` uses disposable PostgreSQL on
`/tmp:55432`, never the managed connection. The actual baseline plus installed
additive course/offerings schema is loaded locally. Checks cover source drift,
mid-write rollback, concurrent editing, exact dates, FK/week relations, preserved
unrelated rows, retry rejection and duplicate-free future generator runs.
Global generators are exercised **only in this disposable test**, never production.

## Recovery and remaining release limits

Before any later recovery, read back the deterministic course ID, product ID, marker,
all 19 dates/shells, and actual usage. Use the existing office/admin `course-management`
delete operation (backed by `course_delete_if_unused`) only for this exact course.
It blocks usage and records a deletion snapshot; do not issue raw course deletes.
An error before COMMIT needs no recovery: all new course rows roll back together.

This plan adds no BC product-variant/source links and enables no booking gate.
The current 26/27 staff options path requires those links; therefore planning structure
alone must not be reported as an end-to-end bookable Office product. Any necessary
booking integration is a separate reviewed task, not silently added here.
The existing weekly generator also ignores season bounds; the local test proves
idempotency **within the 19 intended weeks**, not safety outside the season.