# Scheduler visible filters — 25 October 2026

## Scope and release

Baseline: `9408384d1d175f21be055f6548d5722b8a146991`. This package is frontend/display-only. No publication, function deployment, migration, live business writes, messages or notifications. B01/B02/B03a, canonical move/period paths and authentication files are unchanged. The final commit is reported in chat; Git-managed commits are assigned by the workspace, not by an agent commit command.

## Behaviour

- Header uses the existing SearchableSelect for a compact teacher filter, initially “Alle Lehrpersonen”, with an explicit reset. Selection survives date/day/3day/week and mobile list/grid changes. No new persistent settings or backend queries.
- An explicit active teacher bypasses role/compact/capability dimming and absence hiding. Existing role/compact preferences are retained for reset, with visible paused-filter text. Hide-absence switch is disabled in single mode; its previous value resumes in all mode. Booking-type filtering remains unchanged.
- Hide-absence defaults off. Each displayed date must have confirmed, coherent coverage of 09:00–16:00; intervals merge without allowing gaps. Pending/rejected/invalid data are not evidence. Raw one-time status/full-day facts that were defaulted by the existing hook are flagged unsuitable for this new display rule, without changing original absence rendering.
- Any planned private/group/office assignment in the actual displayed range protects visibility, even when its booking type is hidden. On-call people remain visible and have a phone cue/“Auf Abruf” label. Current operational status alone never proves future absence.
- Group reserve, office duty and deployment-window projections do not prove confirmed absence. Deployment projections are conservatively retained because their RPC omits readiness/error from the hook aggregate and can project empty/unknown windows; they continue blocking/displaying exactly as before.
- Mobile list evaluates only its actual displayed single date, not the retained hidden week/3day range.
- Universal search remains separate find/scroll/highlight; when necessary it clears teacher/absence/role/compact hiding to reveal its target. Instructor name keywords were added to the existing search item: the previous command filter matched UUID values and suppressed named results.
- Filters never change selection state or original booking/absence arrays. Existing row-shell virtualization/indexing remains intact; no new per-cell scans.

## Changed files

- `src/components/scheduler/SchedulerHeader.tsx`, `SchedulerGrid.tsx`, `SchedulerSearchDialog.tsx`
- `src/components/scheduler/SingleDayInstructorRow.tsx`, `InstructorWeekBlock.tsx`, `mobile/MobileSchedulerAgenda.tsx`
- `src/lib/schedulerVisibleFilters.ts`, `src/lib/scheduler-utils.ts`
- `src/hooks/useSchedulerData.ts` — only display-evidence provenance; no query/status/booking semantics changes
- `tests/schedulerVisibleFilters.test.ts`, `tests/schedulerFiltersFixture.js`, `tests/schedulerFiltersBrowser.py`
- `AGENTS.md`, `roadmap.md`, this document; durable display rule saved to project memory

## Actual verification

- `bun test tests`: **328 passed, 3 existing skipped, 0 failed** (39 files). New helper: 31 cases, including full week, partial/gapped/merged coverage, rejected/pending/unknown facts, boundaries, all assignment types, on-call, selected-teacher bypass/reset and mobile day.
- `python3 tests/schedulerFiltersBrowser.py`: **28 checks passed**, actual production SchedulerGrid + Header + useSchedulerData through intercepted synthetic read responses (98 teachers). Selection/search/reset, retained date/3day/week selection, group/office visibility under private filter, compact preference/bypass, empty/reset, actual slot draft across filters, offscreen highlight/mount, mobile 390×800 and desktop 1280×1800. All external HTTP requests fulfilled locally; zero business write attempts and no runtime errors. Screenshots `/tmp/browser/scheduler-filters/desktop.png` and `mobile.png` inspected.
- `python3 tests/checkoutPersistenceBrowser.py`: **0 failures** on desktop/mobile; B01/B02 outgoing payload checks intercepted, zero backend writes.
- Automatic preview build log: **build OK**, including the provenance change. No manual builds or typechecks run (workspace harness owns these checks). No Edge checks needed: no Edge files changed.

## Limits and pre-existing issues

- The old `schedulerPerformanceBrowser.py` was attempted but its isolated fixture failed to mount (`#scroll` null) before DnD checks; this run is **not a pass**. New actual-grid fixture verified offscreen mount and reduced cell trees, not an FPS/CPU benchmark. No fresh timing claim.
- Pointer/keyboard DnD, drag autoscroll, resize, full wizard/back and role submenu interactions were not rerun end-to-end in this package. Their mutation paths/provider/performance wrapper implementations are unchanged; slot draft retention and B01/B02 navigation are verified separately.
- No authenticated real-ticket journey or real move/save was executed, deliberately. Preview implementation is not a published release. B03a backend remains unreleased.
- Existing `isInstructorAbsent`, DaySlots and conflict checks treat a matching partial absence as day-level blocked and may suppress booking bars despite assignment rows remaining visible. Mobile agenda can treat pending/group-reserve entries as busy. These semantics were not repaired in this filter-only package.

## Rollback and retest

Revert only this package's listed frontend/helper/test/document hunks using the workspace's normal revision tools; preserve concurrent booking/auth changes. No database rollback or data repair required. Retest default all/off, full-week no-assignment hide, partial week stay, hidden group/office assignment stay, explicit absent teacher inspection, reset, separate offscreen search, draft retention and mobile actual date. Do not publish automatically.