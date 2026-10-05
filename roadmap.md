# Roadmap

## UI optimization
- [x] Booking step-one UX: single input column, early explicit teacher assignment, unified participant section, read-only draft-aware sticky summary, mounted scheduler toggling, responsive footer-safe layout
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
- [x] UI-09a staff detail density correction: compact staff profile/empty-today rows and restored original rentals visibility gate; isolated before/after evidence in docs/ui-verification.md
- [x] UI-10 booking-flow role clarification: wizard-only participant/payer copy and narrow wrapping, with no workflow changes
- [x] UI-11 recurring-block copy clarification: preset labels with blocked periods, clearer heading/helper text, no dialog values or workflow changes
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
- [x] Assign-later time consistency: actionable missing-time focus, atomic incomplete-time clearing, cart isolation, and canonical variable-plan progression
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
- [x] Activate "Später zuweisen" save path: migration drizzle/migrations/0001_pa_assign_later.sql applied + private-appointments deployed 2026-10-04 (frontend index-fsCIuKrT.js already live; real save not yet exercised end-to-end)
- [x] Private booking: time-first teacher list (full / partial / unavailable over exact intervals), "Andere Zeiten suchen" → existing scheduler + back; synthetic browser checks 14/14, unit 15/15 (unpublished)

## TODAY'S RELEASE LEDGER (5 Oct 2026) — single source of truth
Legend: impl = in code on this commit · runtime = observed test · live = installed/published state.
1. Mobile "Neue Buchung" (44px, opens /bookings/new, not shown inside wizard) — impl yes · runtime: code inspection only this turn (WebKit/Chromium 390 re-run NOT done) · live: after frontend publish
2. Private NOW/LATER, canonical save, multi-date/split blocks, participant apply/reopen/cancel, language filter — impl yes (earlier commits) · runtime: unit + earlier fixture browser; server persistence on disposable schema NOT re-run this turn · live: after publish (pa_assign_later migration 0001 installed)
3. Customer switch / duplicate e-mail — impl yes (earlier) · runtime: unit + earlier synthetic browser; completed booking after selection NOT re-run · live: after publish
4. Groups UI (Ski/Snowboard, levels, participants, times beside calendar, course meeting point, full plan sync, footer targets, no Empfohlen) — impl yes · runtime: fixture browser 1440/390 in previous turn (ddf618f), unit 165/165 · live: after publish
4b. Group staff save — impl yes · runtime: local PG 22/22 (one group quote per product+dates+block with real count, 7 over capacity 2, AM+PM once, replay/concurrency/rollback, roles, drift) · live: migration 0003 INSTALLED, `staff-group-booking` DEPLOYED; readback: functions service_role-only, anon 401, non-staff 403, staff `installed:true`
4c. Quote rule correction (group capacity no longer limits sales; private 1–5 kept) — live INSTALLED in 0003; rollback restores old rule
4d. Catalogue — dry-run: 24 courses / 10 products, every eligible day tier = exactly one source tariff, Dec 14–18 + 21–25 AM/PM instances exactly once; release gate trigger narrowed to validated GROUP products (migration 0004); ACTIVATED 24 courses + 10 products (rollback `supabase/rollback/bc_2627_group_catalog_activation_rollback.sql`). Live options 21–25 Dec: 13 Ski, 1 Snowboard. Known data gap: all 26/27 courses have no meeting point (shown empty, not invented).
5. Scheduler course click → /trainings/planning?week&date&course&instance, opens that course's DailyAssignmentModal with "Ausgewählter Termin"; explicit messages for missing session/course; no writes — impl yes · runtime: browser 1440 full (open, close, back, reload, missing instance, missing course); 390 open+focus+close · live: after publish
6. Course rename/delete — unchanged, live since 2757e1f; 8 courses deleted by users earlier, not recreated
4e. Follow-up (19:35 request) — migration 0005 INSTALLED (`bc_2627_staff_group_book` v2; live body = tested source, EXECUTE service_role only). Edge function unchanged (passes booking through), no redeploy needed.
   - Meeting point: course value authoritative; if empty, regular Treffpunkt buttons next to course times (shared) or per participant card, initially empty, required by readiness and server; kept on back/reopen for the same course, cleared on course change; stored on ticket item only. impl yes · runtime: unit + local PG.
   - Lunch: 26/27 lunch days + vegetarian saved per participant/day from the single active lunch product (live: CHF 30, product belongs to season 25/26 — Ivo should confirm it is also the 26/27 price; server rejects price drift). impl yes · runtime: unit + local PG (association, total, replay).
   - Concurrency: courses FOR SHARE then instances FOR UPDATE in id order before any write; blocks re-resolved after locks. Quote cached once per product+block+dates. runtime: local PG 29/29 incl. 2 parallel different bookings (4 sessions), parallel duplicate participant, instance moved while waiting.
   - NOT done: full Chromium+WebKit 1440/390 browser acceptance (item 4 of the request), mobile scheduler close/back/reload after onboarding, private assign-later persistence re-run, completed customer-switch booking payload. These remain open.
7. This ledger — yes. NOT in this release: school workflow (analysis only), multi-item/mixed private+group carts (still refused), public website hold/invoice/email pipeline (not installed).

## Course management repair (5 Oct 2026)
- [x] Rename (name-only), specific delete/archive dialogs, archive filter, no raw DELETE, frontend + local SQL tests
- [x] Real delete for unused courses (technical source links no longer block); migration 0002 installed, `course-management` deployed, capability verified
- [x] Example courses deleted by users in the live app (deletion log, 8 entries 17:29–17:32 UTC)
- [x] Group-flow branch `e1047b4` integrated on main (`275eb66`; copied file-by-file after a refused tool command — disclosed; no later work lost)
- [x] Scheduler course navigation fix (see ledger item 5)

## Group booking completion (5 Oct 2026) — acceptance list
- [x] Ski/Snowboard visible for group; discipline change clears incompatible courses (browser 1440/390)
- [x] "Teilnehmer hinzufügen" always visible; create/apply/reopen/close; only explicitly assigned people linked to the active item (browser + unit)
- [x] No "Empfohlen", no auto-selection; capacity shown as info only, never blocks (browser + SQL: 3 people over source capacity 2)
- [x] Course times beside calendar (desktop) / stacked (mobile); all AM/PM blocks per date; meeting point from course only
- [x] Plan sync compares full content (dates, times, product, meeting point, server price), also per participant
- [x] Footer "Kurs wählen" focuses course selector, or the explanation when no course exists
- [x] Per-participant courses (different levels) with summary/readiness agreement (browser with fixture options)
- [x] Full-suite test interference fixed (163/163)
- [x] Staff atomic 26/27 group save prepared: `supabase/pending/bc_2627_staff_group_booking.sql` + rollback, `staff-group-booking` function, frontend path; local PG 20/20
- [ ] Payer shortcut → participant offer with real customer fixture (search returned no customers in test browser) — unverified
- [ ] Full step 1→3 browser save with mocked server — unverified (payload covered by unit tests)
- [x] Installed (0003) + deployed
- [x] Validated 26/27 group offers activated (ledger 4d)
