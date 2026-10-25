# B10 – Summary text: participants and teachers (F09/F12; HB015/017/020/026/079/087)

Status: **implemented in preview, local component tests passed. Display-only. Not published, no independent E2E, no channel delivery tested.**
Base SHA: `85556829b43f3e5528299b3743992b7c50cb961c` · Preview commit after edits: `9966d8b1272ed60d8f902a8b4d25a999afa582bb` (preview availability ≠ released SHA; later auto-commits may follow).

## Verified causes (current code)
1. `PriceBreakdown.tsx` group shared caption used `state.selectedParticipants.length`; the price used the people linked to the active cart item.
2. `BookingSummaryCards.tsx` per-lesson rows treated `assignLater` as "all lessons later" (hiding fixed per-day teachers that the save does send), showed any unknown teacher id as "Wird später zugewiesen", and the bottom summary used only the global `state.instructor` → "Kein Skilehrer ausgewählt" despite per-day teachers.
3. `ConfirmationOptions` / `Step4Summary` → `BookingSuccessModal` used the global teacher only and said "<Name> wird per WhatsApp informiert".
4. **Real routing gap (not fixed, display only):** `notifyInstructor` is not read by any save or send path; no teacher message is sent. Labels now say "Wunsch wird vermerkt, kein automatischer WhatsApp-Versand". Needs a separate channel decision/test.

## Changes (frontend only)
- `src/lib/summaryAssignments.ts` (new): `blockTeacherId` = identical rule to `useCreateBooking` (`fixedInstructorId !== undefined ? fixed : main`), `summarizeTeachers`, `teacherLabel` (null+later → "Wird später zugewiesen", null without later → "Lehrperson fehlt", unknown id → "Lehrperson zugewiesen (Name nicht geladen)"), `blocksWithPeople` (stable IDs), `assignedTeacherIds`.
- `src/hooks/useAssignedTeacherNames.ts` (new).
- `BookingSummaryCards.tsx`: per-lesson teacher as submitted; summary "Mehrere Lehrpersonen: …" with counts of later/missing lessons; old single-teacher display unchanged; group participant mode shows each block with the assigned people (no duplicated block rows).
- `PriceBreakdown.tsx`: caption count from assigned people. Amount code untouched.
- `ConfirmationOptions.tsx`, `Step4Summary.tsx`, `BookingSuccessModal.tsx`: per-lesson teacher names; no promise of sending. B05 customer confirmation state is unchanged.
No backend, schema, payload, price, assignment or routing change.

## Checks run
- `tests/b10SummaryLabels.test.tsx` (real components, stubbed context): 2 days/2 teachers; assigned+later; all later; old single teacher; missing vs unknown id; repeated teacher counted once; group participant mode with different people per lesson and one person on several days; notification label. Asserts per-lesson ids equal the save mapping. 8/8.
- `tests/priceBreakdownGroup.test.tsx`: new 3 selected/1 assigned and 2 of 3 assigned caption tests; all existing price totals unchanged.
- Full `bun test tests`: 367 pass, 1 pre-existing failure (a Deno-only file that bun cannot load), 3 skips. Preview build OK.
- **Not run:** browser desktop/mobile render, a full wizard click-through incl. B01 back navigation, a group AM/PM half-day and Saturday caption in a browser, a multi-cart display (the B07 save stays blocked; no code touched there), saved-result rendering after success (success modal shows only ticket number + labels, nothing about persistence).

## Rollback
Revert the files above (frontend only). There is no data or backend involved.

## Independent retest handoff
- HB015/HB017: customer with 3 people, assign 1 (then 2) to a group course → caption "N Teilnehmer × D Tage" matches assigned people; total unchanged.
- HB020/HB026: private lesson on 2 days with 2 different teachers; then one day teacher + other "später zuweisen" → per-day rows and summary agree, no "Kein Skilehrer ausgewählt".
- HB079: all lessons "später zuweisen"; single teacher old flow.
- HB087: success dialog/notification option shows per-lesson teacher names and does not claim a WhatsApp was sent. Channel delivery to teachers remains untested and unimplemented.
