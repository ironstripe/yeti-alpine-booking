# Roadmap

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
- [x] Prerequisite schema/RLS and private storage are live; Christoph's approved `super_admin` role remains alongside the owner's (two superadmins observed 2026-10-01).
- [x] Private bucket `instructor-hr-photos` created (10 MB)
- [x] Dry-run preview (function + super_admin dialog + synthetic parser/matching tests + RLS test)
- [x] Real-file preview twice, latest `d2711047-6f18-4f4a-8614-605270e18760`: 67 creates, 16 candidates, 4 owner-approved reviews; all 87 source checksums and 20 target UUIDs unchanged; no Apply, 31 instructors and 0 Booking source links.
- [x] Christoph `christoph@powersurf.li` granted `super_admin` with owner approval; never remove this role during import work.
- [ ] Public Team candidate list (after verified real import)
- [ ] Before-image ledger + selective recovery dry-run: corrected files in `supabase/pending/bc_import_ledger.sql` and associated test/rollback/runbook; **not applied**. Stop gate: review and execute the fully rolled-back synthetic ledger test, approve migration separately, then re-run Gate A/scheduler/ledger role tests and verify live counts.
- [ ] Old YETI test hourly rates: separate gate, never treated as verified Booking wages
- [ ] Refresh selective preimport snapshots and durable backup, then separately approve a 1-create+1-update pilot; full 67+20 Apply only after pilot checks. Preserve UUIDs, raw assignments, manual photos and website flags; do not invent absences or publish imported profiles.

## Security Gate A – instructors access control (pre-import)
- [x] Role model, staff/superadmin RPCs, stable user links, PII-free live status and frontend switch; Gate A lock applied to live Cloud and 59/59 synthetic role tests passed with rollback. The direct Cloud recurring-blocks policy compatibility fix is also live; scheduler, booking list, instructor list and detail load as superadmin.
- [ ] Reconcile live Gate A and scheduler fix into source control: [PR #3](https://github.com/ironstripe/yeti-alpine-booking/pull/3) is open, not merged. Do not re-run the historical pending lock; check migration/deploy impact before merge.
- [ ] Real teacher-only and office-only browser UAT (synthetic SQL role tests do not replace separate account sessions); stale PWA bundles can show 0 instructors until client cache clears.
- [x] Future Apply identity review: Booking IDs 20308/21309/21095/15916 are approved to link their existing UUIDs; Booking source values win for import-owned fields. No import has executed.
- [ ] Gate A2 (only if found): teacher access to customer contacts/prices
- [ ] Real-browser office/admin role verification (superadmin smoke tests passed); preserve the shared published backend and YETI UX.
