# UI verification log

## UI-05A — closing browser verification gaps (2026-10-04)

- Baseline (last reviewed): `ade54421dbfc805c4b9871220fac2d0910f4feff`. Pre-UI-04 comparison: `266d2ce` version of `BookingDetailDialog.tsx`.
- No product code changed in UI-05A; only this file, `roadmap.md` and `docs/ui-standard.md`.

### Method

- Temporary standalone Vite page (removed before commit, never routed in the app) mounting the **real** components inside `QueryClientProvider`, `MemoryRouter`, `AuthProvider`, `TooltipProvider`.
- Synthetic data only, seeded into existing query keys `["booking-detail", id]` and `["instructors"]`; long ticket number, product name, e-mail and address used to test wrapping.
- Playwright (Python, headless Chromium) routed every non-localhost request: GET `rest/v1/ticket_items` (instructor-conflict lookup) answered locally with one synthetic overlapping row; all other remote requests aborted.
- Viewports: 1440×900, 390×844, 390×560 (short). Touch enabled at 390.

### Network result

15 remote requests intercepted, 0 reached a live service. 3 mocked reads (conflict lookup). 3 aborted POSTs, all `functions/v1/instructor-photo-url` (the existing photo read the instructor dialog fires on open). Google Fonts GET aborted. No save, approval, notification, upload or payment request was issued by the tested flows (writes during change-confirm flow: 0).

### Results

| Scenario | 1440 | 390 | 390 short |
|---|---|---|---|
| Booking detail: sheet width | 520px PASS | 390 full PASS | 390 full PASS |
| Detail: no horizontal overflow, footer inside viewport, body scrolls | PASS | PASS | PASS |
| Detail: start/end shown `10:00 - 12:00 Uhr`, long e-mail/address wrap | PASS | PASS | PASS |
| Detail: Tab/Shift-Tab stay inside sheet | PASS | PASS | PASS |
| Detail: Bearbeiten → edit footer (Speichern/Abbrechen) visible; Abbrechen returns to read mode | PASS | PASS | PASS |
| Nested instructor-conflict AlertDialog opens, focus inside; Escape and Abbrechen close it, sheet stays open | PASS | PASS | PASS |
| BookingChangeConfirmDialog opens from Speichern, focus/Tab inside; Escape and Abbrechen close it, sheet stays open; confirm not clicked | PASS | PASS | PASS |
| Detail: Escape closes sheet, focus returns to opener | PASS | PASS | PASS |
| Approval sheet: width / footer / overflow | 520px PASS | full PASS | full PASS (body scrolls) |
| Approval: checkboxes 16px aligned, toggle works locally, Tab trap, Escape + Abbrechen close, focus returns | PASS | PASS | PASS |
| Instructor dialog: footer inside viewport, body scrolls, no overflow, Tab trap | PASS (600px) | PASS (358px) | PASS |
| Instructor: edit field → Escape → discard prompt → cancel keeps dialog and typed value | PASS | PASS | PASS |

### Observations (not regressions)

- After closing the nested conflict AlertDialog with Escape, focus lands on `body` (the triggering Select option has unmounted); the next Tab returns into the sheet. Identical in the pre-UI-04 `Dialog` version (side-by-side run) → pre-existing, left unchanged.
- React `forwardRef` console warnings were observed in the current version; whether they also occur in the pre-UI-04 version was not separately confirmed. Not addressed.
- Emoji in the change summary render as boxes in headless Chromium (missing emoji font), environment only.

### Not tested

- Real records/auth roles (instructor photo controls hidden because no session; upload path untested by design).
- Actual save, approval, notification, discard-confirm execution.
- Physical touch devices; only emulated viewport/touch.

### Commands

`python3 /tmp/browser/ui05/run_ui05.py`, `python3 /tmp/browser/ui05/cmp.py` (temporary, not committed); `git diff --check`; `bunx tsgo --noEmit -p tsconfig.app.json`.

## UI-05B — early wizard ergonomics (2026-10-04)

- Baseline: `3d95f750bc3cf8c40ea4fe6e6188e721d5d5e456`. Changed: `Step1ProductCart.tsx`, `Step2ProductAllocation.tsx`, `Step2AssignCustomer.tsx`, `CustomerPayerCard.tsx` (class names, `aria-label`, `aria-expanded` only) plus docs.
- Diff review: every changed source line besides `className` is an added `aria-label`/`aria-expanded` or a line re-emitted with new classes; no hook, state, effect, mutation, handler, condition or text change.

### Method

Temporary local Vite page (removed) mounting the real `Step1ProductCart` and `Step2AssignCustomer` inside the real `BookingWizardProvider`, seeded only through existing context setters: synthetic long-named customer, two pre-existing synthetic participants (no local participants, so the auto-insert path never triggers), three cart items (private 3 days, group 1 day, private snowboard 2 days) and two selected mini-scheduler slots. Playwright answered GET `rest/v1/*` locally (synthetic season/product, otherwise empty) and aborted everything else.

Network: 72 remote requests intercepted, none reached a live service; 18 aborted POSTs were all read RPCs (`instructors_ops_list`, `instructor_deployment_gates`); no `customer_participants` insert or other write was issued.

### Results (1440×900, 1024×768, 390×844 touch)

| Check | Result |
|---|---|
| No horizontal overflow, no element past viewport | PASS all widths, both steps |
| Shortcut toggle wraps, `aria-expanded=true` when open | PASS |
| Long pre-selected customer wraps beside labelled remove icon | PASS |
| Cart with 3 items visible; remove icons labelled | PASS |
| Icon actions 36×36 (mouse) / 44×44 (touch) | PASS |
| Text/select/pill controls ≥36px tall (mouse) / 44px (touch) | PASS |
| Private filter row: stacked at 390, three columns at ≥640 | PASS |
| Selected slots summary ("2 Termine ausgewählt", apply/cancel) visible | PASS |
| Step 2: cart reminder badges wrap; long name/e-mail/address wrap without clipping; Bearbeiten/Wechseln 36/44px | PASS |

### Observations / not tested

- One unlabelled icon button remains: the red delete icon inside the date picker child component (outside the four files).
- Not tested: real products/instructor availability grid, group-course data, fullscreen mode, period summary/automatic-prefill and individual-booking panels (their conditions were not reached with the seed), customer search/create/edit dialogs, local-participant persistence (deliberately avoided).

## UI-06 — scheduler visual signals and date-picker labels (2026-10-04)

- Baseline: `fd15e3e97d57746cda887ef57f63f2ccdaa0f41a`. The current main scheduler did **not** import or mount `SchedulerLegend`; it rendered an inline hardcoded compact legend. UI-06 mounts `SchedulerLegend compact` at that same conditional location. `SchedulerLegend` otherwise had no app consumer. `BLOCK_COLORS` reached only its non-compact rendering. The wizard mini-scheduler uses a separate availability/ranking legend and was not changed.
- Source reach: shared static booking classes feed desktop `BookingBar`, mobile `MobileSchedulerAgenda` markers and the compact main legend. `BLOCK_COLORS` keeps every `BlockType`, label, branch and legend item in the same order, with aligned presentation values only.

### Method and safety

- Temporary standalone Vite fixture (removed before final diff) mounted the real `BookingBar`, both `SchedulerLegend` presentations, `MobileSchedulerAgenda` and `RangeDatePicker` with synthetic paid/open/group/office/provisional bookings, a cross-discipline warning, short 30-minute group bar and long labels.
- Browser matrix: 1440×900 and 390×560, light and `.dark`; touch enabled at 390. Every non-localhost request was intercepted and aborted. Existing detail components initiated only read requests; no write or mutation was triggered.

### Results

| Check | Result |
|---|---|
| Static booking palette agrees across desktop bars, mobile markers and compact legend | PASS |
| Group `Users` and office `Building` cues; long labels truncate without changing bars | PASS |
| Paid/open/group/office/provisional normal text contrast | PASS: light minimum 8.57:1; dark minimum 9.90:1 |
| Provisional striped amber and cross-discipline icon remain visible | PASS |
| Booking geometry versus baseline class/style source | PASS: positions, width formula, height, padding and coordinates unchanged; measured light/dark identical (96×58px standard, 46×58px short) |
| Date-picker names | PASS: `Ausgewählte Daten löschen`, `Vorheriger Monat`, `Nächster Monat` |
| Date-picker action targets | PASS: 36×36 precise pointer, 44×44 coarse pointer |
| Existing clear callback | PASS: synthetic selection count 2 → 0 |

### Limits

- Not tested with authenticated live scheduler records, real booking detail dialogs, actual drag/drop, fullscreen, selection overlays or physical touch hardware. No save, booking, approval, payment or other live action was performed.
- `BlockingBar` reserve/absence styling and instructor availability/category colours were deliberately not changed. The non-compact legend remains currently unmounted but aligned for any future direct consumer.

## UI-06a — provisional dark-mode precedence correction (2026-10-04)

- Independent review found that UI-06's provisional base amber classes did not override the paid/open `dark:` classes. The earlier minimum-contrast result therefore measured payment-coloured dark provisional bars and did not prove the intended amber provisional precedence.
- Before correction, the real `BookingBar` computed dark provisional paid as emerald `rgb(2, 44, 34)` and unpaid as amber `rgb(69, 26, 3)`. Both measured 46×6px in the focused fixture.
- The existing `isProvisional` class branch now explicitly overrides dark background, text and border with the same amber provisional palette. The cross-discipline icon inherits the bar text colour instead of applying a separate low-contrast dark colour.
- Focused synthetic verification rendered provisional `isPaid=true` and `isPaid=false` through the real `BookingBar`, with all non-localhost requests aborted. Both now compute identically in light and dark: background `rgb(251, 191, 36)`, text `rgb(69, 26, 3)`, border `rgb(217, 119, 6)`; text and cross-discipline icon contrast are both 8.97:1.
- Coordinates and dimensions remained identical before/after for both payment states: x=25px, y=2px, width=46px, height=6px. The existing stripe gradient, dashed border, condition and status branching were unchanged. No write action was exercised.

## UI-07 — scheduler workspace and fullscreen discovery (2026-10-04)

- Baseline: `8518688e98d01666b83180ec38cb6a43c4aa9e5e`. Product-code scope: `Scheduler.tsx`, `SchedulerHeader.tsx`, and `MultiSelectToggle.tsx`; presentation and accessible labels only.
- A temporary standalone Vite fixture (removed before final diff) mounted the real scheduler with 18 synthetic instructors and private/group bookings. Every non-local request was aborted; no write or live action ran.
- Browser matrix: 1440×900, 1280×720, and 390×560 touch. At both desktop sizes, the first scheduler row moved from y=218px to y=126px: **92px more vertical workspace**, with its 41px height and booking-bar coordinates relative to the row unchanged. Fullscreen moved the same row to y=82px.
- At 390px the toolbar top moved from y=112px to y=44px and its wrapped height changed from 120px to 110px. The mobile list remained inside the 390px viewport without horizontal page overflow.
- The visible fullscreen action entered and left the existing fullscreen state; Escape left it; the settings checkbox reflected the same state, and entering through settings changed the visible action to `Vollbild verlassen`. Day, 3-day, and week controls remained functional. Desktop toolbar actions fit one row at 1440px and 1280px.
- Body dimensions stayed exactly at each viewport. The fixed time header/instructor column and scheduler scroll region remained in their existing implementation; row and slot geometry source was untouched. Synthetic rows below a short viewport remained reachable through the existing scheduler scroll area rather than page overflow.

### Limits

- Selection-state retention was not claimed: the attempted synthetic click was rejected by the existing current-date/future-date validation in this time-shifted fixture. No validation or selection logic was changed to force the scenario.
- Portal stacking was checked for the existing settings menu in fullscreen and showed no observed overlap problem. Other portalled sheets/dialogs and physical touch hardware were not exercised.

## UI-08 — calm lists and documents (2026-10-04)

- Presentation scope: `Lists.tsx`, `DocumentCard.tsx`, and `BatchPrintCard.tsx`. Titles, subtitles, counts, count labels, preview handlers, checkbox defaults, print handler, and exact `disabled={count === 0}` behavior remain unchanged.
- The known Ticket-Übersicht action still opens the daily overview. Stapeldruck still opens only the first eligible selected dialog after its informational toast and does not open attendance-only selection. These functional mismatches were intentionally not changed in this UI package.
