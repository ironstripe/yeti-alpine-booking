# Roadmap

## UI optimization
- [x] UI-01 foundations + bookings/payment pilot: UI standard, accessible primary action pairing, icon actions, neutral source badge, ticket links, responsive filters, payment sheet
- [x] UI-02 approval/detail + final wizard review: approval sheet, detail skeleton/header, sticky desktop summary, touch and long-title refinements
- [x] UI-03 form ergonomics: stable dialog anatomy and responsive fields for customer, instructor, course and product forms
- [x] UI-04 scheduler controls + booking detail workspace: accessible controls, viewport-centred wrapping selection toolbar and stable detail sheet; booking-detail and nested-dialog interaction checks completed in UI-05A (see docs/ui-verification.md)
- [ ] Future package: approval/detail follow-up (complex ticket edit dialogs, history and related information)
- [x] UI-05A browser verification: booking detail sheet, nested confirmations, approval sheet and instructor dialog exercised with synthetic local fixtures (docs/ui-verification.md); remaining: real-data visual check and photo upload path untested
- [x] UI-05B early wizard ergonomics (cart, product/time step, customer step, payer card): wrapping, labelled icon actions, touch-sized controls, muted info panels; evidence in docs/ui-verification.md. Untested: real availability grid, fullscreen, period/prefill/individual panels
- [x] UI-06 scheduler visual signals + remaining range-date-picker action labels: shared calm booking palette and type cues across desktop/mobile/live compact legend; light/dark contrast, unchanged geometry and 36/44px labelled date actions verified with isolated synthetic fixtures
- [x] UI-07 compact scheduler workspace + visible fullscreen action: 92px desktop grid gain, narrow wrapping, shared fullscreen state and settings-menu stacking verified with isolated synthetic fixtures
- [x] UI-07a shell-aware scheduler correction: natural wrapping with 250px/64px sidebars, tap-open multi-select help, future-selection retention and shell-aware 92–94px grid gain verified
- [x] UI-08 calm lists and documents: six compact responsive document rows, quiet counts, secondary actions, labelled date navigation, and denser batch-print/notes presentation; functional mismatches remain documented and unchanged
- [x] UI-09 backoffice instructor management: compact staff table, staff-only detail workspace and 520px website-profile sheet; teacher portal and teacher self-view preserved
- [ ] Future package: earlier wizard steps and cross-step pricing
- [ ] Future package: scheduler geometry, density and drag/drop review (booking palette/active legend completed in UI-06)
- [ ] Future package: remaining modules

## Mobile navigation
- [x] Share desktop/mobile navigation, expose Einstellungen in both mobile menus, preserve live inbox counts and short-screen scrolling

## Security P0.2
- [x] Step 1A: anon `get-booking-request` Edge Function + RequestConfirmation switched to it
- [x] Step 1B: lock down SECURITY DEFINER functions (grants + role checks)
- [ ] Verify office/admin paths with a real office login (blocked: no office account available)
- [ ] Decision: request-received email needs a server-side sender (was browser-side with customer email)
- [x] Follow-up: `useBookingRequest` moved to submit-booking-request (Step 1D)
- [ ] Step 2A: applied 21:42, ROLLED BACK 21:52 on user emergency request — anon access is open again; waiting for user reason/go before retry
- [ ] Step 3: role-scoped authenticated policies (not started)

## Private-lesson appointments (plan 2026-09-30)
- [x] Stage 1: private_appointments table + ticket_items.appointment_id (additive)
- [x] Stage 2: backfill dry run — 0 future private items, nothing to backfill


- [x] Stage 3: multi-instructor selection → wizard hand-off; no participant split for different-day instructors; creation writes appointments + links items
- [x] Stage 4 (partial): Scheduler shows one block per appointment; moves via update_private_appointment
- [x] Explicit "Mehrfachauswahl" toggle + instructor names in the summary/remove-only list (Ctrl/Cmd+Click remains available)
- [x] Wizard planning step edits each private lesson's date, time and instructor
- [x] Canonical private lessons render once in Scheduler and show mapped participants in Scheduler/detail views
- [x] Phase 3 correction: `state.appointments` is the canonical plan (date/start/duration/instructorId per real block); mini-scheduler + scheduler prefill populate it; paCreate payload built 1:1 from it; legacy manual flow kept when no plan exists
- [x] "Geplante Termine" card = only editor (open by default; 09:00–16:00, end>start, no same-day overlap; date deselection drops blocks)
- [x] Different instructors on different dates = one booking; simultaneous picks rejected, never participant split
- [x] Final price preview sums every canonical block (date/time/participants); server-authoritative note; draft cleared only after successful paCreate
- [ ] End-to-end test with an office login (blocked: no office account)
- [x] Desktop Scheduler: move the labelled multi-select switch into the always-visible top controls, add right-click/Ctrl/Cmd slot toggling, and keep the mobile cutoff strictly below 768px

## Phase 1 validation fix
- [x] Live pa_price assertions in SQL test (section 0); parity test header corrected; run instructions in test file
- [x] Phase 2: private-appointments server step + transactions + confirmation (not published)
- [ ] Phase 2 office/teacher/no-role live checks (blocked: no test logins)
- [x] Phase 2 fix: advisory slot locks + DB-unique submission_key (2-session live proof pending: needs privileged DB URL)

## Booking-Corner Lehrer-Import (Admin-Dry-Run)
- [x] Prerequisite migration applied (schema + RLS + private storage policy); super_admin only ivo@ivo.ch
- [x] Private bucket `instructor-hr-photos` created (10 MB)
- [x] Dry-run preview (function + super_admin dialog + synthetic parser/matching tests + RLS test)
- [ ] Real-file dry-run by owner, then separate Apply step (waiting: owner runs preview with real files)
- [ ] Christoph FreeSurf account (blocked: identity clarification)
- [ ] Public Team candidate list (after verified real import)
- [ ] Before-image ledger + recovery dry-run: files ready (pending/bc_import_ledger.sql, test, rollback, RECOVERY.md) (blocked: owner review before Cloud SQL; then run test, apply, re-run Gate A/scheduler tests)
- [ ] Old YETI test hourly rates: separate gate, never treated as verified Booking wages
- [ ] BC Apply plan revision: authoritative source on reviewed links, preserve Zuordnungen per ID, manual photo provenance, no-window gating staff+web, batch_status constraint

## Security Gate A – instructors access control (pre-import)
- [ ] Plan rev. 2 approval (split ops/HR, stable user link, live-status realtime, exact rollback)
- [ ] Additive migration + link backfill + frontend switch
- [ ] Lock migration + role tests + real teacher login (blocked: teacher test account/approval)
- [ ] Future Apply decision recorded: links 20308/21309/21095/15916 approved; Booking wins phones + "Viktoria"; never overwrite UUID/bookings/roles/manual photos/website flags (blocked: backup gate + Gate A)
- [ ] Gate A2 (only if found): teacher access to customer contacts/prices
- [ ] Real-browser office/admin/super_admin role test (blocked: separate user permission to sign in as staff)
- [ ] Lock migration review: published app shares backend → old published frontend breaks for office until republished (needs user decision)

## Buchungsübernahme 26/27 (preparation, read-only)
- [x] Normalized package contract v1, pure evaluator, scheduler projection tests, staff dry-run card
- [ ] Original BC export adapter (blocked: CSV schema not obtained)
- [ ] Rechnung/refund/online-payment semantics + group planning source (blocked: owner/BC answers)
- [ ] Server absence/collision/capability checks; migration-mode triggers; server apply + journal (later milestone)

## Issues #15/#22/#36 (see docs/issues-15-36-status.md)
- [x] #22 offline function check script (`bun run check:functions`)
- [x] #15 get-products fail-closed + website visibility; staff group preflight before writes
- [x] #36 online payment refused until provider verification exists
- [ ] #15 atomic server booking RPC; Carving activation separately awaits verified operating data
- [ ] #36 capacity policy (blocked: owner decision soft vs hard capacity)
- [ ] #36 invoice-only checkout + immediate invoice delivery + OnePager (Robin repo push=false)
- [ ] #36 online payment provider verification (separate from invoice-only checkout)

## Controlled 26/27 lab transfer (run bc2627-run1, package lab-v4-7a9b66d)
- [x] Mechanism, dry-run (51/51), rollback rehearsal, apply 51 sales, readback, idempotent re-run
- [x] UI: capacity view shows booked inactive courses; unknown DOB shown as "unbekannt" / "? J." (family card, edit forms, capacity)
- [x] Merged people hidden in participant search pickers
- [x] Booking wizard/lists: age rules for people with unknown DOB (needs a decision: which course age checks apply when DOB unknown)
- [ ] #36 26/27 website course booking: SQL + API + invoice/confirmation delivery + staff resend implemented and tested locally (SQL 43/43, API 19/19). Blocked: owner approval to apply SQL/deploy; production school e-mail (sender) missing; OnePager client switch to contract v1.
