## UI-09 backoffice instructor management

- Browser verification used the authenticated local application shell at 1440×900, 1280×720 and 390×560 in light and dark presentation. The overview rendered 98 synthetic/read-only records in a semantic table with six stable columns, 52px desktop rows, real detail links, the existing order, visible filter labels and no page-level horizontal overflow. The table itself intentionally scrolls horizontally on narrow screens.
- The staff detail route retained its existing action destinations and role conditions. Its compact header, availability control, today's assignments, profile grid and subordinate website section were exercised with long production-like content without clipping. The teacher self-view remains on the original page branch; teacher-portal routes and shared teacher components were not restyled.
- Website-profile editing rendered as a 520px desktop sheet and full-width 390px mobile sheet with one scrollable body and stable footer. Focus trapping, labelled close, nested confirmation structure and cancel controls remained present. Escape closing was exercised before changing fields; dirty-state behavior was not separately testable because this dialog had no pre-existing dirty-close guard.
- No save, upload, invite, message or status action was triggered. Requests observed during authenticated rendering were existing reads/session traffic; no application mutation was initiated by the test. Physical touch hardware, actual portrait upload and successful publication remain untested.

## UI-09a staff detail density correction

- Baseline: `492743dd66705ab3006a9d287f965f0c8c5aa866`. Scope is limited to the staff-only detail branch and existing `compact` presentation variants; the teacher/self-service branch and every status, schedule, query, and action callback remain unchanged.
- A temporary isolated fixture (removed before final diff) mounted the real before/after `InstructorDetail`, `TodayScheduleCard`, and `StatusToggle` with synthetic short/long names and empty/populated schedules. Business panels and actions were inert stubs. Google Fonts was the only external request and was aborted; no service request or write ran.
- Shell widths: 1440×900 and 1280×720 with a 250px expanded sidebar, 390×560 touch, and 853×480 as a reduced-CSS-width proxy for 150% browser zoom. This last case verifies equivalent available width, not an assertion about the user's screenshot zoom.
- Long-name empty state measurements (baseline → corrected): staff header 158→90px at 1440/1280, 274→218px at 390, 158→122px at reduced width; empty “Heute” card 148→50px desktop/reduced and 148→74px mobile. The next profile section moved up 178px desktop, 142px mobile, and 146px reduced-width. No page overflow occurred.
- Status targets remained 36×36px with a precise pointer and 44×44px with a coarse pointer. Populated schedule times, booking labels, confirmations, and eight-slot logic remained present; only compact card padding changed (430→414px desktop, 450→434px mobile). Default `compact=false` presentation was source-compared and unchanged.
- The original rentals gate was restored exactly in the staff branch: `isAdminOrOffice && id`. Physical touch hardware and real staff records/actions were not exercised.
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

## UI-07a — shell-aware scheduler toolbar correction (2026-10-04)

- Independent review found that UI-07's `md:flex-nowrap` classes used viewport width rather than the scheduler's available width after the 250px application sidebar. Both forced no-wrap classes were removed; the same flex groups now wrap naturally while retaining one row where they fit.
- The tooltip-only multi-select help was replaced with the existing popover primitive. The same help text is now exposed by a focusable 36px precise-pointer / 44px coarse-pointer button and opens by click or tap; the switch and selection state are unchanged.
- A temporary isolated fixture (removed before final diff) mounted the real `SchedulerHeader` and selection context inside an AppLayout-equivalent shell with 250px expanded and 64px collapsed sidebars. Every non-local request was aborted; no write action ran.
- Shell matrix: 1440×900, 1280×720 and 1024×768, expanded/collapsed and normal/fullscreen, plus 1280×720 coarse pointer. There was no page-level horizontal overflow or clipped action. At 1440 the toolbar stayed on one row; at 1280 it used two rows only with the expanded sidebar, and at 1024 it used two rows in both sidebar states. Coarse-pointer targets remained 44px and wrapped without clipping. `Vollbild verlassen`, the visible selection count and all controls remained reachable.
- Against the actual pre-UI-07 header inside the same shell, the corrected grid gained 92px at 1440 expanded/collapsed, 94px at 1280 expanded and 92px collapsed, and 94px at 1024 expanded/collapsed. This supersedes the earlier 92px isolated full-viewport estimate only as shell-aware evidence; the original result was not evidence for expanded-sidebar fit.
- A future synthetic selection (`2027-02-15`) remained visible across fullscreen transitions. Day/3-day/week controls, the shared visible/settings fullscreen state, Escape exit and sticky scroll header were exercised. Scheduler row/slot/bar geometry source was not changed.

### UI-07a limits

- The fixture reproduced the application shell dimensions and real sidebar widths but did not authenticate against live scheduler data. Portalled settings worked in fullscreen; other sheets/dialogs and physical touch hardware were not exercised.

## UI-08 — calm lists and documents (2026-10-04)

- Presentation scope: `Lists.tsx`, `DocumentCard.tsx`, and `BatchPrintCard.tsx`. Titles, subtitles, counts, count labels, preview handlers, checkbox defaults, print handler, and exact `disabled={count === 0}` behavior remain unchanged.
- The known Ticket-Übersicht action still opens the daily overview. Stapeldruck still opens only the first eligible selected dialog after its informational toast and does not open attendance-only selection. These functional mismatches were intentionally not changed in this UI package.

### Method and results

- A temporary standalone Vite fixture (removed before final diff) mounted the real `Lists` page and all real preview components. The existing data hooks alone were replaced with isolated zero/nonzero synthetic values. Every non-localhost request was aborted; no print action or live write ran.
- Browser matrix: 1440×900, 1024×768, and 390×560 touch, each in light and dark. All six rows rendered without clipped titles, counts or actions and without horizontal page overflow.
- Zero data disabled all six `Erstellen` actions. Nonzero data enabled all six and opened, in existing order, Mittagsliste, Gruppeneinteilung, Tagesübersicht, Skilehrer-Einsatzplan, Anwesenheitsliste, and Tagesübersicht for Ticket-Übersicht.
- `Erstellen` and date-arrow targets measured 36px with a precise pointer and 44px with a coarse pointer. Date arrows exposed `Vorheriger Tag` and `Nächster Tag`.

### Limits

- Preview dialogs were opened and closed only; option changes, print/download actions, batch print, real records, and physical touch hardware were not exercised. The known handler mismatches above remain unchanged.

## UI-09a — staff instructor-detail density correction (2026-10-04)

- The staff-only identity/status header now wraps by available width instead of waiting for the `xl` breakpoint. The compact empty “Heute” state is one responsive row; populated schedule content and the teacher/self-service presentation remain unchanged.
- The original rentals visibility condition, `isAdminOrOffice && id`, was restored in the staff branch.
- An isolated fixture with synthetic instructor and schedule data checked 1440×900, 1280×720, 390×560 touch, and an 853×480 reduced CSS viewport. External app traffic was blocked and no status, invite, save, upload, or message action ran.
- Long-name empty-state measurements: profile header 158→90px desktop, 274→218px mobile, and 158→122px reduced viewport; empty “Heute” 148→50px desktop/reduced and 148→74px mobile. The following profile section moved up by 178px, 142px, and 146px respectively. Status targets stayed 36px precise-pointer / 44px coarse-pointer with no page overflow.
- Populated schedule height changed only through compact staff padding: 430→414px desktop and 450→434px mobile. Time-slot and booking content remained present.

### UI-09a limits

- The checks used real presentation components with synthetic hooks and inert actions, not live instructor data. The reduced viewport is a CSS-width proxy for 150% zoom, not evidence about the user screenshot’s browser zoom.

## UI-10 — booking-flow role clarification (2026-10-04)

- Wizard-only wording now distinguishes lesson participants from the paying customer across progress, existing-customer shortcut, participant picker, payer card, step actions, local-participant badge, and final summary. Step order, callbacks, state, persistence, calculations, and validation were not changed.
- An isolated fixture mounted the real progress, shortcut, payer card, participant sheet, and controls with synthetic long names/contact details. At 1440×900 and 390×844 touch, all requested labels were visible, progress labels wrapped cleanly, and document width equalled viewport width (1440/1440 and 390/390).
- The existing-customer shortcut measured 38px with a precise pointer and 44px with a coarse pointer. All external requests were aborted (only the font request occurred); no customer, participant, cart, or booking write ran.

### UI-10 limits

- The full wizard data flow, customer search/edit/create, participant persistence, availability, final submission, and live records were not exercised. The fixture was removed before the final diff.

## UI-11 — recurring-block copy clarification (2026-10-04)

- Text-only presentation change in `RecurringBlocksTab.tsx` and `RecurringBlockDialog.tsx`: heading “Wiederkehrenden Block hinzufügen” with the neutral helper sentence, preset buttons “Nachmittage blockieren” (13:00–16:00) and “Vormittage blockieren” (09:00–12:00) with muted sublabels, “Eigener Block …”, “Bestehende wiederkehrende Blöcke”, dialog label “Blockierte Zeit *”, and edit heading “Wiederkehrenden Block bearbeiten”.
- All preset times, weekdays, reasons, keys, hooks, handlers, validation, conflict checking, persistence, and the submit action remained unchanged. No props or hooks were introduced; the shared teacher-portal component only received approved wording.
- Diff verified as strings and local wrapping JSX only; `git diff --check` and TypeScript passed.

### UI-11 method

- An isolated fixture (removed before this note) mounted the real `RecurringBlocksTab` with an isolated query client. At 390×844 all requested labels rendered, preset buttons wrapped cleanly, document width equalled viewport width (390/390), and external requests were aborted; no save, delete, or live data action ran. The dialog itself was not opened in the fixture; dialog strings were verified in the source diff only.

## Private booking "Später zuweisen" (functional fix, 2026-10-04)
- Step 1 offers "Teilnehmer hinzufügen" without a teacher; `setAssignLater(true)` clears every teacher reference of the active item only (root/per-block instructor, appointments' instructorId, per-day overrides, mini-scheduler picks, group-proposal teachers) while keeping dates, times, durations and participants. Turning it off never restores a teacher. Scheduler provenance (`schedulerPrefill.plan`) is kept unchanged as the original record; the banner then shows the plan as adjusted.
- Save path (implemented 2026-10-04, NOT yet active): `supabase/pending/pa_assign_later.sql` lets `pa_create_booking` store an appointment with a NULL teacher only when the slot carries explicit `"assign_later": true` (confirmation NULL, no teacher lock/notification, one `assign_instructor` task in the same transaction). A missing teacher without that flag is still rejected. Teachers are assigned later via the existing move/period-update operations, which keep the lock and conflict checks and roll back completely on a conflict. Tested only in a local throwaway database (`tests/paAssignLater.integration.mjs`, 16/16).
- Activation order: (1) apply `supabase/pending/pa_assign_later.sql` (accepts old and new requests), (2) deploy the `private-appointments` Edge Function (contract accepts `assign_later`), (3) publish the frontend. Until all three run, saving with "Später zuweisen" stays blocked: the currently published frontend still stops with "Bitte für … eine Lehrperson wählen". Rollback: `supabase/rollback/pa_assign_later_rollback.sql`.
