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
- React `forwardRef` console warnings appear in both versions; pre-existing, not addressed.
- Emoji in the change summary render as boxes in headless Chromium (missing emoji font), environment only.

### Not tested

- Real records/auth roles (instructor photo controls hidden because no session; upload path untested by design).
- Actual save, approval, notification, discard-confirm execution.
- Physical touch devices; only emulated viewport/touch.

### Commands

`python3 /tmp/browser/ui05/run_ui05.py`, `python3 /tmp/browser/ui05/cmp.py` (temporary, not committed); `git diff --check`; `bunx tsgo --noEmit -p tsconfig.app.json`.
