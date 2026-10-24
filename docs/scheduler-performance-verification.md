# Scheduler performance — scoped verification

## Scope and identity

Baseline source: `d816e917652ed95a82d1766de5afed6e48fbe1d6` (clean start).
This package changes only desktop teacher rendering, not booking/absence rules, filters, data access, mobile agenda or payment/invoice/auth source. The observed published `index-BmrC8oRz.js` baseline is not mapped to this commit; measurements below are local Vite development source, not published production measurements.

## Implementation

- `VisibleInstructorBlock.tsx`: all 98 lightweight shells/search refs remain mounted. IntersectionObserver rooted in the existing scroll container mounts nearby slot trees with 400px vertical overscan. No dependency added.
- Height estimates include borders: day 41px; 3 days 100px; week 232px. ResizeObserver retains actual rendered height. Date-count changes reset estimates; container/fullscreen/column resizing remains native geometry.
- Active booking drag, selection drag, selection resize, focus and highlighted teacher remain mounted. Rows are not unmounted while a portalled dialog is open. Selection remains in the unchanged provider/sessionStorage, not row state.
- `InstructorFocusView.tsx`: stable memoized per-instructor booking/absence arrays reduce global scans in descendant cells. Full instructor date range is retained for cross-day selection checks.
- `SchedulerGrid.tsx`: passes existing scroll ref; no changes to moves, confirmations, search callback, filters or mobile routing.

## Reproducible benchmark

Run `python3 tests/schedulerPerformanceBenchmark.py after` against the already running local Vite server. Screenshots/raw JSON go to `/tmp/browser/scheduler-performance/`. Fixture is `tests/schedulerPerformanceFixture.js`; no app route or test hooks were added to production.

Three fresh Chromium contexts; fixed 1280×1800 viewport, 900px fixture scroll region; 98 synthetic teachers, seven dates 21–27 Dec 2026, 98 10–12 bookings alternating group/private, 14 two-day absences. All non-local requests fulfilled locally (empty reads); no real credentials/data/writes. Same fixture and interaction: mount, settle 500ms, 20 wheel events of +400px with 50ms waits, settle 200ms, return top, Ctrl-select teacher 1 on Dec24 09–10. Fixture uses actual InstructorFocusView, rows/cells, DndKitProvider, selection provider, toolbar, auth/query/router/tooltip providers.

React Profiler `actualDuration` records render work; requestAnimationFrame records intervals during scrolling; PerformanceObserver records long tasks (>=50ms). This is dev-mode headless wall-clock/render evidence, not CPU utilization, GPU/compositor FPS or a real-device guarantee. Hover/tooltip and dnd-kit work are included. Warm module caches and shared sandbox load affect comparisons. Mount figures are initial React commit only (observer commits occur afterwards).

| Metric | Before runs | After runs |
|---|---|---|
| Initial slots | 4802 / 4802 / 4802 | 294 / 294 / 294 |
| Initial DOM elements | 32081 / 32081 / 32081 | 2092 / 2092 / 2092 |
| Initial React render ms | 1309.8 / 1574.9 / 1550.9 | 245.6 / 197.4 / 241.9 |
| Median scroll frame interval ms | 66.6 / 66.6 / 58.3 | 16.7 / 16.7 / 16.7 |
| Maximum frame interval ms | 166.6 / 133.4 / 133.3 | 100.0 / 83.4 / 66.7 |
| Scroll long tasks | 21 / 16 / 19 | 2 / 2 / 1 |
| Scroll React render total ms | 1681.5 / 1624.4 / 2101.3 | 653.1 / 626.5 / 602.8 |
| Selection React render total ms | 1282.0 / 1752.2 / 1240.4 | 86.6 / 65.0 / 69.7 |

Median initial render 1550.9→241.9ms; initial slot count down 93.9%, DOM down 93.5%. All runs have zero runtime errors. Earlier fixture attempts lacked AuthProvider; those erroneous timings were discarded, not included.

## Regression evidence

`python3 tests/schedulerPerformanceBrowser.py`: 34 passing checks, synthetic only:
- All shells preserved; initially offscreen teacher 90 mounts, scrolls and highlights via the same ref/search mechanism.
- Real Ctrl/Meta cell clicks across teacher 90→1; selections remain after slot-tree/wizard-fixture unmount/remount; unchanged sessionStorage contains both.
- Real Shift cell click selects three exact dates; production multi-day drag commit retains two 120-minute dates; active selection source pinned while scrolled offscreen.
- Day/3day/week each mounts correct cell counts and actual 41/100/232px heights; column width 112→200, container 900→500 and viewport 1280→1100×760 remain populated.
- Synthetic role/compact/order/capability/planning controls preserve intended row set/order and dimming. This exercises production focus view, not the full SchedulerHeader settings dialog.
- Real mouse DnD: source teacher 1 pinned after distant scroll; drop teacher90/Dec24/13:00 delivered to mock callback only. Keyboard sensor Space/ArrowDown activates, Escape cancels with no move.
- Mobile 390×700 actual MobileSchedulerAgenda keeps 98 sections; free interval callback intact.
- All external calls intercepted; only GETs and existing read-only instructors_ops_list/check_recurring_block_conflicts RPCs attempted; no business writes.

Existing focused unit tests: `bun test tests/schedulerSlotInput.test.ts tests/schedulerCourseLink.test.ts tests/schedulerPrefillProvenance.test.ts tests/ticketItemSessions.test.ts`: 16 passed, 0 failed. Automatic preview build checked separately; no manual project build/typecheck run per project harness rules.

## Limits and pre-existing findings

- Existing selection resize validation includes its own selection in overlap detection: attempted 60→120 remains 60 (source confirmed). Preserved, not fixed in this performance scope; success of extending a selection is not claimed.
- Existing KeyboardSensor uses pointerWithin collision detection; pointer-free successful keyboard drop was not established. Activation/cancel preserved; no new keyboard routing semantics introduced.
- Cross-viewport mouse drop uses explicit native scroll, not a timed edge-autoscroll endurance test. dnd-kit sensors, overlay and default autoscroll configuration unchanged; edge-autoscroll speed/keyboard cross-viewport drop unverified.
- Wizard/back check retains the real scheduler provider and unmounts/remounts the real slot tree with a synthetic wizard screen. Full actual booking wizard, save, paMove/paPeriodUpdate and group-page navigation are not exercised; no live writes permitted. Existing deep-link and canonical item-session tests pass; code paths unchanged.
- Fullscreen is covered as container resize, not clicking the full app button; full header search/settings and real hosted 98-teacher workflow not benchmarked. Mobile screenshot checked; no hardware touch test.
- No standalone frontend typecheck claim; no backend deploy, schema changes, publication, emails or invoices.

## Rollback

Remove only this package's scrollContainerRef prop line in SchedulerGrid; revert this package's InstructorFocusView indexing/wrappers/imports to direct row mapping; remove VisibleInstructorBlock and these three fixture/test files. Remove only this package's AGENTS/roadmap entries and this document. Preserve concurrent B01/B02/invoice/auth changes. No database rollback. Any frontend publication requires separate authorization.
