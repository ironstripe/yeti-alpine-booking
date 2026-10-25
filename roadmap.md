# Roadmap

## B07 retest readiness (authorised 2026-10-25)
- [x] L1: tariff-priced move/period_update/B03a edit requote via the shared resolver with digest acknowledgement, consistent participant/day locks (also legacy paths), guard accepts only server pricing rows. SQL 17/17 + regressions; docs/b07-pricing-verification.md.
- [x] Backend target verified (single Lovable Cloud project) and combined install manifest: docs/b01-b11-install-manifest.md.
- [x] B07a atomic multi-item server (`b07a_office_multi` + `office-booking`), full pending chain installed together, 19/19 + rollback 4/4; L1 fixes (participant UPDATE guard, period stale locks). docs/b07a-verification.md.
- [x] B07b UI: whole-cart office-booking quote/create, accessible price dialog, private activation guard + targeted 26/27 seed, old-client refusal, combined delivery suites. docs/b07b-verification.md.
- [x] B07b review 991688d9: cart-wide due date, attempt lifecycle (no new key after unknown), 26/27 product reachable in real wizard, step-1 new people in cart, B05 flake (fixture), get-products excludes tariff products.
- [x] Final release prep 8c5b86a: replay keeps unknown attempts blocked except quote_changed; tariff rules editor follows release; migrations 0016–0028 tracked; Edge closure; switches ON in code. docs/release-b01-b11.md.
- [x] Backend release from 9880fda: exact 0016–0028 installed via supported route (+ tool trailing 0029 verification), prior 19 ledger rows preserved; 12 Edge functions deployed, runtime versions/auth checks verified, stored data digests unchanged. docs/release-b01-b11.md.
- [ ] Ivo/root publishes Core, refreshes clients and starts operational retest (backend ready; publication deliberately not performed here).

## B05 — Office booking confirmation (authorised after B03b)
- [x] Verify final B03b/B04 contracts; persist explicit intent atomically for canonical create/replay without changing finance.
- [x] Integrate saved-ticket staff confirmation with B04 guards, complete saved lesson content and separate UI delivery outcomes.
- [x] Run isolated SQL/Deno and intercepted desktop/mobile plus targeted regression checks; docs/b05-verification.md records release order, rollback and HB084–086/093 limits. No release/live writes/provider calls.
- [ ] B05 operational retests/release await separate backend install/deploy/frontend/send authorization; legacy non-atomic/ambiguous period limits documented.

## B04 — existing delivery schema compatibility
- [x] Prepare additive pending SQL against current production-schema baseline; preserve historical fields, grants/RLS and both uniqueness constraints.
- [x] Fail closed for legacy/ambiguous/corrupt delivery evidence; isolated SQL/PostgREST 19/19, Deno delivery/invoice regressions 22/22 and four caller checks passed.
- [x] Record staged release, consumer-first rollback and HB081/082/086/093 limits in docs/b04-verification.md; no release, provider requests or business writes. Frontend Workbox issue remains separate.
- [ ] B04 release and HB081/082/086/093 operational retests await separate authorisation and original issue acceptance criteria; not part of implemented preview checks.

## B03b — canonical read projection (authorised)
- [x] Resolve only Workbox 3-MiB blocker by bounded 4-MiB precache ceiling; automatic preview build OK at 10:47:18Z, before B03b implementation.
- [x] Batch-load canonical people/schedule for booking-detail cards; preserve zero amounts, per-lesson identities, group/lunch/legacy and all edit paths. Unit 63/63; real detail desktop/mobile and 48 B03a/130 checkout checks passed; B04 isolated 19/19 and invoice regressions 11/11.
- [ ] New local/server invoice projection blocked: no persisted trustworthy new-versus-historical document version; requires separately authorised boundary/schema decision. Existing invoice/frozen output retained. See docs/b03b-verification.md.
- [ ] Publication and operational acceptance await separate authorisation; no release, migrations, live writes or real messages performed. B02 remains unaccepted.

## B03a focused review follow-up
- [x] Reproduced stale originals, flattened notes and same-price total discrepancy; corrected pending contract/hydration/panel only.
- [x] SQL 17/17, assignment 16/16, unit 330/3 skips, Deno schema 4/4 and Edge check, actual intercepted UI 48 and checkout regression 130 assertions passed. Capabilities/limits and B02 asset corrected in docs/b03a-verification.md; no B02 acceptance claim.

## Scheduler visible filters — current package
- [x] Add compact searchable single-teacher selection/reset and default-off hide-absent control; keep search separate and selected teacher inspectable.
- [x] Verify confirmed full displayed-range absence with no assignment, conservative intervals and mobile actual day; preserve draft/performance/booking paths.
- [x] Actual grid/header synthetic browser: 28 checks; unit suite 328 pass/3 existing skips; checkout browser 0 failures; automatic build OK. Evidence/rollback and old performance-harness mount failure in docs/scheduler-filters-verification.md. No publication/backend/data writes.

## B03a — safe editing of existing canonical private bookings
- [x] Canonical hydration (per-lesson people/prices/teachers), dedicated edit screen, legacy save refused for canonical bookings.
- [x] Pending atomic `pa_edit_booking` (quote + acknowledged apply, Ivo rule: person change reprices only that lesson, discount kept, invoiced protected); `edit` action in private-appointments (not deployed).
- [x] Legacy total guard; SQL 11/11, unit 297, Deno, browser checks. Details: docs/b03a-verification.md.
- [ ] Release: install pending SQL, deploy private-appointments, publish — awaits authorisation.

## Scheduler rendering performance — scoped package
- [x] Record isolated 98-teacher week timing baseline at d816e917, with synthetic bookings/absences and no external writes.
- [x] Render nearby teacher slot trees with overscan and stable instructor indexing; preserve row shells/search, selection provider, mobile agenda and booking semantics.
- [x] Same before/after benchmark: 4802→294 slots, median initial render 1550.9→241.9ms; 34 synthetic browser checks and 16 unit tests passed, automatic build OK. Limits (existing resize self-overlap, keyboard drop, full wizard/autoscroll) and rollback in docs/scheduler-performance-verification.md. No deployment/publication.

## B02 independent review — frozen draft payment consistency
- [x] Fail closed before writes if a frozen draft snapshot or its payment columns disagree with current routing; preserve snapshotless issuance and issued replay. Only historical snapshot creation time is excluded from fresh-routing comparison (validated and retained).
- [x] 16 focused Deno tests pass using complete production-generated synthetic snapshots, all payment columns and snapshot-field mutations, profile/override changes and document rendering. No frontend edits, deployment, publication or live writes.

## B02 only — checkout/invoice due date
- [x] One derived date for checkout display and private/group/legacy create, explicit choices retained, B01 preserved.
- [x] New invoice reads ticket date fail-closed; issued and resumed invoice dates/snapshots stay frozen; confirmation copies the issued invoice date.
- [x] 290 unit tests pass (3 existing skips), 12 Deno invoice tests, 130 desktop/mobile browser checks including intercepted create/legacy insert, four consumer Edge checks; automatic build OK. No live writes, migration, deployment or publication. Details and rollback: docs/b02-verification.md.

## Active QA fix — lunch after course switch
- [x] Keep prior lunch selections removable in shared and participant-specific course selection, preserving full-day-only validation; no automatic clearing.
- [x] 48 focused tests pass, including per-person payload recovery preserving the other person's lunch; synthetic browser full-day → half-day/legacy → remove → payload recovery at 1280×1800 and 390×700, no automatic re-selection or runtime errors; build OK. No business writes, deployment or publication; actual live booking deliberately not submitted.

## Lunch and supervision — preparation only
- [x] Limit existing optional add-on to full-day groups, unique CHF 30 lunch product, separate billing items.
- [x] Verify 51 unit/regression tests, 33 disposable SQL booking checks, 14 settlement checks, actual addon browser selection/readback at 1280x1800 and 390x700. Existing Office invoice maps every ticket item, including lunch, to a separate line (source verified; no invoice issued).
- No production writes, installation, deployment, messages or publication; checkout unchanged.
- Release limitation: pending/group_lunch_full_day.sql must be reviewed/installed separately for authoritative full-day/CHF30/dedup guards to go live. No new table or price update. Legacy single-block group lunch is refused; website checkout remains unchanged. Existing Office discretionary discount still applies to lunch as before. Authenticated live booking/invoice issuance intentionally not tested.

## Saturday selection rules — 18 Oct 2026
- [x] Enforce first-day/maximum-day rules in staff options/create and website reserve using server-read canonical course levels, source tariff family and course period mappings; existing atomic SQL pricing/save unchanged.
- [x] Verify 46 unit/regression tests, 7 disposable PostgreSQL persistence/readback checks and authenticated mocked HTTP staff/website checks; Deno checks pass. No production business writes, migration, function deployment or publication.
- Calendar clarification: Windel still offers five dates per series; only maximum three selections is authorised, not removing dates.
- [ ] Separate 2h Ski Saturday product `ceea6bdc-9bc4-57f4-af87-5a5233979246` remains one-day-only: missing 2–5-day tariffs and variant eligibility require owner-supplied prices/authorisation. No prices invented.
- Release limitation: changed functions not deployed; live UI still uses previous server rules. Authenticated live booking not tested to avoid real business writes. Preflight facts are read before existing atomic SQL save, not locked by it; concurrent metadata changes are not covered by this no-migration patch.

## Product activation and deletion — preparation only
- [x] Prepare staff-authorized optimistic product activation and audited fail-closed deletion, with deactivation for referenced products.
- [x] Integrate existing modal/list without import-marker locks or raw browser product deletion; preserve prices, metadata and scrolling.
- [x] Verify isolated SQL/API/UI activation, deletion, concurrency, dependencies and scrolling; no production install/deploy/publish.
- Product delete (simplified, not installed): install `supabase/pending/product_delete.sql` as next tracked migration, then deploy only `product-management`, then separate frontend release. Rollback: `supabase/rollback/product_delete_rollback.sql`.
- Evidence: isolated SQL 7/7, API 1/1, helper/editor 12/12, modal invariants 5/5, typecheck + build OK.
- Files: `src/lib/productDelete.ts`, `src/hooks/useProducts.ts` (delete only), `src/pages/SettingsProducts.tsx`, `supabase/functions/product-management/*`, `tests/productDelete*`; activation/edit path restored to original.

## Product modal persistent scrolling
- [x] Confirm current definite-height layout and actual authenticated Products → Bearbeiten wheel interaction at 851×533 without business writes; no disabled-scroll reproduction observed.
- [x] Keep native viewport-constrained pane, expose stable styled scrollbar and keyboard-focusable product details; preserve fields, footer and dirty guard.
- [x] Mandatory layout alarm 5/5; isolated browser checks passed at 1053×763, 851×533, 390×700 and tall desktop, including keyboard access and return from unsaved-changes dialog. Actual authenticated menu opener wheel scroll 0→600; automatic build OK. No business writes, deployment or publication.

## Public private tariff information — preparation only
- [ ] Controlled activation authorised 18 Oct 2026 15:33 UTC: blocked before writes because prepared target-only seed requires privileged BEGIN/LOCK/DO/COMMIT plus service-only RPC; available run_sql supports DML only, shell is restricted and has no service credential. No schema installation or function deployment attempted. Fresh preflight confirms absent display table/functions, correct target seasons/admin roles, unchanged 32 products/54 tiers, BC 60=75/120=170, four operational hourly rates and no active pricing_rules. Ivo explicitly approved both time-price matrices; discount is public-copy only, not an operational change.
- [x] Prepare separate product/season display persistence, atomic revision-checked staff save, unverified target-only seed and rollback; preserve operational tariffs.
- [x] Extend optional versioned catalog information for explicitly verified rows only; missing schema omits fields, private_rates and booking gates unchanged.
- [x] Verify 14/14 disposable actual-schema SQL checks, 8/8 offline API/schema executions, existing catalog handler/contract and 5/5 modal invariants; Deno checks and automatic build OK. Installation notes in docs/public-private-tariff-display.md.
- Release gap: no production installation/seed/deployment/publication; UI deferred. Office must resolve user wording “4 lessons” vs operational >=4 hours and confirm both disciplines; Ski stored duration 55min and operational double prices differ. New information stays unverified until explicit staff approval. This task does not authorize older open roadmap packages.

## Carving Ladies — targeted one-off season plan
- [x] Prepare one atomic, fail-closed data script for the corrected product UUID, one Sunday course/schedule, 19 instances and 19 Monday-based group shells; preserve offering and all unrelated data.
- [x] Verify disposable actual-schema creation, duplicate/concurrent rejection, rollback, foreign keys and future generator idempotency: 8/8 checks passed.
- [ ] Production execution blocked: available data tool cannot run BEGIN/LOCK/DO/COMMIT and restricted shell has no privileged execution; no schema migration workaround. Production unchanged, linked course count still 0. Script and review notes in scripts/one-off/carving_ladies_season.*; offering correction separate. Planning alone does not add required 26/27 BC variant links or establish end-to-end bookability.

## Product series — preparation only
- [x] Schema-only activation: reviewed SQL installed byte-identically as 0012_product_offering_series; only product-public-offering and get-website-products deployed. Readback confirms service-only RPCs, staff-read RLS, empty series default, unchanged existing offering fields and identical products/tiers/courses/instances fingerprints. Seed, private tariffs and frontend publication remain separate and unexecuted.
- [x] Extend existing offering metadata and atomic staff save with ordered weekly series and per-series selection limit; prepare reversible incremental SQL and target-only unexecuted seed.
- [x] Add compact editor, generated dates, existing-tier selection preview and optional catalog projection; preserve legacy schedules, text and blocks.
- [x] Verify isolated SQL, exact Saturday/pricing rules, actual modal save/reopen and desktop/mobile scrolling. No shared business writes, migration installation, deployment or publication.

- Evidence: 30 unit/layout tests, 27 disposable SQL checks and offline catalog passed; actual modal save/reopen, max3 and tariff preview at 1053x763/390x700 with external network blocked; existing scroll regression passed. Deno function checks and automatic build OK. Frontend standalone typecheck not separately run. Production install/deploy/seed/publish await independent review; seed requires reviewed clock times and staff actor.

## Optional website schedule label — implementation only
- [x] Add nullable editorial label through incremental SQL + safe rollback and existing atomic staff save; never install 0010 again.
- [x] Integrate optional text, automatic weekday preview and catalog projection without changing schedules, blocks, prices or booking gates.
- [x] Verify 18 unit/layout tests, 18 disposable UTF-8 PostgreSQL checks, offline catalog and function checks; actual modal/hook save/reopen at 1053x763 and 390x700 with external network blocked; existing scroll regression passed at both sizes and tall desktop. Automatic build OK. No production writes, installation, deployment or publication.
- Installation pending owner approval: incremental display-text SQL only → product-public-offering function → get-website-products function → compatible Core frontend publication. Production save/reopen and live catalog remain untested; private tariff release remains separate.

## Product public offering metadata — implementation only
- [x] Prepare product-scoped schedule persistence, preflight and reversible SQL; no backfill or shared-backend installation.
- [x] Integrate Website-Informationen into existing modal, preview, dirty guard, save/reopen; metadata-only save avoids product writes, failed saves retain edits.
- [x] Prepare optional product-only catalog projection; preserve existing fields, prices and online_bookable:false.
- [x] Verify 31 focused offering/legacy-pricing/private-tariff tests, 13 disposable actual-schema SQL checks (permissions, unchanged history and rollback), isolated actual modal at 1100x760 and 390x700 (save/reopen, reordered Saturdays, overlap, dirty dismissal, failed save retry, scrolling; no runtime errors). Functions checked; automatic build/typecheck checked. Offline catalog handler test recorded alongside endpoint.
- [x] Targeted backend activation: exact pending SQL installed atomically as 0010_product_public_offerings; only product-public-offering deployed. Independent readback: 32 products/58 tiers unchanged, 0 offerings, RLS staff SELECT only, anon has no table/save-RPC access; live unauthorized POST returns 401. Isolated SQL checks 13/13 and offering unit tests 9/9 passed. Default authenticated table grants remain blocked by absent write policies; only service_role can execute save RPC. Pure shape/trigger helpers retain default execute grants (not privileged write paths).
- Release gap: production Office save/reopen not exercised (no business test writes); get-website-products and frontend were not deployed/published in this activation. Private tariff feature untouched. Booking date suitability/availability enforcement remains outside this step.

## Product editor repair — step 1 only
- [x] Preserve legacy flat pricing and all stored day tiers; 10/10 targeted tests (real update hook with synthetic responses), isolated actual form open/save/reopen for flat/fixed/hourly/tiered plus 6/7-day edit, automatic build/typecheck OK. No live writes, migration, deployment or publication; live persistence not exercised.

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
1. Mobile "Neue Buchung" — runtime: WebKit 390 exactly one outside wizard, none inside (final turn) · live: after frontend publish
2. Private NOW/LATER — runtime (final turn, writes intercepted): Chromium 1440 LATER 21–22 Dec, blocks 21 Dec 10–11 + 13–14, 22 Dec 10–11, 2 new people (levels blue_king / red), apply/reopen/cancel/remove/re-add, preview 3 lessons CHF 305, create captured; WebKit 390 NOW 14–15 Dec 10–12, language filter DE 24 / FR 21 / IT 0 teachers, 2 existing people, CHF 420, create captured. Captured LATER payload persisted on disposable production schema + 0007: 3 appointments, NULL teacher, 2 people with levels (total under synthetic SQL rates 300, not compared to UI). · live: 0001 + 0006 + 0007 installed
3. Customer switch / duplicate e-mail — runtime: "Kunde wechseln" focuses search, cancel keeps payer; duplicate e-mail (emulated 23505) offers existing customer or correction; correction → completed submit (Chromium); choosing existing Alberto as payer (WebKit) shows "Teilnehmer gehören zu einem anderen Kunden" listing Robin's people, no reassignment; switch back → warning gone → submit
3b. New-person level — migration 0007 INSTALLED (`staff_guest_level_ok`, group + private save accept optional guest `level`, validated per sport against existing level keys, stored in `level_current_season`; existing people never updated; no level = old behaviour). Live md5 = tested source, EXECUTE service_role only; `private-appointments` + `staff-group-booking` deployed (no auth → 401). Local PG staffFinalize 14/14 (Ski/Snowboard levels, invalid level rejected, rollback + same-key retry, captured payloads). Rollback `supabase/rollback/staff_guest_level_rollback.sql`.
3c. VAT in booking summary — Swiss rate by service date (7.7 % until 2023, 8.1 % from 2024), VAT included in gross (gross×rate/(100+rate)). No existing 8.1 % setting found: product `vat_rate` values are still 7.7 (not changed); tariffs, invoices and history unchanged. Summary only.
4. Groups UI (Ski/Snowboard, levels, participants, times beside calendar, course meeting point, full plan sync, footer targets, no Empfohlen) — impl yes · runtime: fixture browser 1440/390 in previous turn (ddf618f), unit 165/165 · live: after publish
4b. Group staff save — impl yes · runtime: local PG 22/22 (one group quote per product+dates+block with real count, 7 over capacity 2, AM+PM once, replay/concurrency/rollback, roles, drift) · live: migration 0003 INSTALLED, `staff-group-booking` DEPLOYED; readback: functions service_role-only, anon 401, non-staff 403, staff `installed:true`
4c. Quote rule correction (group capacity no longer limits sales; private 1–5 kept) — live INSTALLED in 0003; rollback restores old rule
4d. Catalogue — dry-run: 24 courses / 10 products, every eligible day tier = exactly one source tariff, Dec 14–18 + 21–25 AM/PM instances exactly once; release gate trigger narrowed to validated GROUP products (migration 0004); ACTIVATED 24 courses + 10 products (rollback `supabase/rollback/bc_2627_group_catalog_activation_rollback.sql`). Live options 21–25 Dec: 13 Ski, 1 Snowboard. Known data gap: all 26/27 courses have no meeting point (shown empty, not invented).
5. Scheduler course link — runtime: 1440 full; WebKit 390 after tour: real link opens Blauer Star day dialog, survives reload, closes, back → scheduler; unknown course shows "Dieser Kurs ist in der verlinkten Woche nicht (mehr) vorhanden." (no dialog), same after reload · live: after publish
6. Course rename/delete — unchanged, live since 2757e1f; 8 courses deleted by users earlier, not recreated
4e. Follow-up (19:35 request) — migration 0005 INSTALLED (`bc_2627_staff_group_book` v2; live body = tested source, EXECUTE service_role only). Edge function unchanged (passes booking through), no redeploy needed.
   - Meeting point: course value authoritative; if empty, regular Treffpunkt buttons next to course times (shared) or per participant card, initially empty, required by readiness and server; kept on back/reopen for the same course, cleared on course change; stored on ticket item only. impl yes · runtime: unit + local PG.
   - Lunch: 26/27 lunch days + vegetarian saved per participant/day from the single active lunch product (CHF 30 = 26/27 source tariffs 26449/5256, verified; server rejects price drift). impl yes · runtime: unit + local PG (association, total, replay).
   - Concurrency: courses FOR SHARE then instances FOR UPDATE in id order before any write; blocks re-resolved after locks. Quote cached once per product+block+dates. runtime: local PG 29/29 incl. 2 parallel different bookings (4 sessions), parallel duplicate participant, instance moved while waiting.
4f. Release step 20:02 — migration 0006 INSTALLED (`staff_booking_finalize`, `bc_2627_staff_group_book` v3, `pa_create_booking_finalized`; live bodies md5-identical to tested source, EXECUTE service_role only); `private-appointments` + `staff-group-booking` DEPLOYED (no auth → 401).
   - Booking + payment/notes/metadata + new people in ONE server transaction; trusted actor from auth. runtime: local PG 9/9 (group paid-now, hotel/invoice, 2 new people + lunch/veg + discount, discount validation, payment fault → full rollback → same-key retry once with payment → replay no double; private LATER persisted with NULL teacher + payment; private error rolls back new person; privileges) + 29/29 group + 16/16 assign-later.
   - Office discount on group: existing per-line discount_percent/reason (0–100, reason required), shown = saved. No automatic rule.
   - Price preview: chosen 26/27 variant's quoted unit price per linked person (shared + per person), unique lunch price (CHF 30, sources 26449/5256), lunch only on booked dates; unit test 370/320/170/230, changed dates, unlinked/decoy ignored.
   - Draft people: no early inserts; local IDs sent as new people with their own course/lunch/vegetarian data; drafts kept on failure; foreign-owner participants flagged before submit. unit tests.
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

## Browser acceptance — bounded group cases (5 Oct 2026, base 0d0082f)
All real business writes intercepted (any non-GET to the backend fails with 403 unless it is a read RPC or the read-only `options` call; staff-group-booking `create` captured + answered locally). Synthetic payer "Paula Synthetik" served by the test; no early participant insert observed (0 blocked writes in every run).
- [x] A — Chromium 1440: Gruppe → Ski → 14–18 Dec → "26/27 Ski Blauer Star" (product Kinder 4h, 320) → 2 new draft children → reopen/close dialog (both kept) → Treffpunkt Malbipark (course has none) → lunch child 1 on 14/15/17 + vegetarian, child 2 none → preview CHF 730 (2×320 + 3×30, AM+PM once) → payer → back/reopen (all kept) → review → 10 % "Geschwisterrabatt Test" → total CHF 657 → "Buchung erstellen" sends one create with both guests, full dates, malbipark, lunch_dates/vegetarian, discount.
- [x] B — WebKit 390: one "Neue Buchung" outside wizard, none inside → Gruppe → Snowboard → 14–18 picked course, cleared, 21–25 (course reset, re-picked "26/27 Snowboard Anfänger" AM) → 2 new children with snowboard levels → per-person mode (2 selectors) and back → Gorfion → CHF 460 (2×230) → payer → review shows only 21–25 → create payload only 21–25, 230/person. Time list readable at 390.
- [x] C — Chromium 1440 per-person: child 1 Blauer Star + Täli, child 2 Roter Star + Schneeflucht → CHF 640 → create payload with two courses, two points.
- [x] Captured payload A replayed in a throwaway local database (production schema + installed 0006, synthetic IDs): ticket total 657 = UI; each child 10 distinct AM+PM course sessions on exactly 14–18; lunch only child 1 on 14/15/17 vegetarian; meeting point malbipark; discount 10 % + reason on every line; no payment (pay later). staffFinalize 10/10.
- [x] Fixed: date picker endless redraw after clicking a day (blocked course choice); report hours key per real group session (two courses at the same time stay two; same session across people counted once); "Gruppenkurs0" in summary; raw meeting point id in summary.
- [x] New-child level now saved (ledger 3b); VAT summary 8.1 % (ledger 3c).
- [ ] Known limit: on the phone "Weiter zur Prüfung" stays clickable while foreign-owned people are linked; the final save refuses them.
- [ ] Produkt-Tarifeditor (Schritt 2): editierbare private Tarifmatrix (1-7h x 1-5 Pers.) im ProductFormModal; neue Tabelle product_private_tariffs + service_role-RPC save_product_private_tariffs + Edge Function product-private-tariffs vorbereitet (supabase/pending/product_private_tariffs.sql, Rollback vorhanden). Lokal getestet: SQL 12/12, Unit/Komponente 22/22, tsgo OK, deno check OK. NICHT installiert/deployt/veröffentlicht: Migration, Function-Deploy und Publish warten auf Freigabe. quote_bc_2627_product liest weiterhin BC-Originale — editierte Preise wirken noch nicht auf Buchung/Rechnung.

## Lehrereinsatz planning visibility
- [x] Show only courses relevant for the selected week (course period, else product season; unknown period needs an instance; enrollments always shown). Badge "Keine Termine in dieser Woche". No data changes; not published.

## Product delete follow-up
- [ ] Waiting on Ivo: which product failed to delete. Imported products blocked only by their Booking-Corner price entry would need a decision before that entry may be deleted.

## Skilehrer list — Saisonstatus default filter (24 Oct 2026)
- [x] Default status filter "Aktive" (`instructors.status === "active"`), choices Aktive/Inaktive/Alle; search, sort, real-time filter unchanged; Saisonstatus stays independent of Operativer Status and Homepage toggle. No schema/record changes.
- [x] Verified in preview (signed in as ivo@ivo.ch): default "Aktive" 98/98 (no inactive instructors exist yet), Inaktive → empty state, Alle 98, Aktive+Suche 72, reload returns to "Aktive", mobile 390px OK, no console errors, build OK.

## B06 (Rechnungsversand)
- [x] PDF-Renderer + send-invoice Function + BookingDetail UI (lokal getestet: 10/10 Integration, 3/3 PDF)
- [ ] Ausstehend: B04+B06 SQL installieren, send-invoice deployen, HB057/086/093 UI-Retest, kein Release ohne Freigabe

## B07-P (Produkt-Tarife privat, Vorstufe B07a)
- [x] Pending SQL, Resolver, Vorschau/Create-Bindung, Editor, Edge-Vertrag; lokal getestet (docs/b07-pricing-verification.md)
- [ ] Wartet auf Ivo: Personenzuschlag im neuen Modell, Doppelstunde 14–16, Abdeckung aller aktiven Privatprodukte; danach Installation/Deploy/Schalter nur mit Freigabe
- [x] B07b: Zusammenfassung zeigt Server-Vorschau; Verschieben/Bearbeiten über L1 (siehe oben)

## B08 (Geburtsdatum)
- [x] UI + Edge-Validierung, pending Trigger, lokale Tests, Browser Kundendetail (docs/b08-verification.md)
- [ ] Wartet auf Freigabe: Functions deployen, publizieren, Trigger installieren; HB042–044 Retest
