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
- [x] Prerequisite migration applied (schema + RLS + private storage policy); super_admin only ivo@ivo.ch
- [x] Private bucket `instructor-hr-photos` created (10 MB)
- [x] Dry-run preview (function + super_admin dialog + synthetic parser/matching tests + RLS test)
- [ ] Real-file dry-run by owner, then separate Apply step (waiting: owner runs preview with real files)
- [ ] Christoph FreeSurf account (blocked: identity clarification)
- [ ] Public Team candidate list (after verified real import)
- [ ] BC Apply plan revision: authoritative source on reviewed links, preserve Zuordnungen per ID, manual photo provenance, no-window gating staff+web, batch_status constraint

## Security Gate A – instructors access control (pre-import)
- [ ] Plan rev. 2 approval (split ops/HR, stable user link, live-status realtime, exact rollback)
- [ ] Additive migration + link backfill + frontend switch
- [ ] Lock migration + role tests + real teacher login (blocked: teacher test account/approval)
