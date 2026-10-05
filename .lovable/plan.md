# Group booking UX corrections

## Goal
Make the existing group-booking path truthful and consistent from sport and dates through participants, summary, readiness, and the captured save request—without changing pricing, permissions, backend contracts, or the protected 26/27 booking guard.

## Implementation
1. **Create one shared group-course eligibility/plan helper**
   - Filter active, non-internal courses by explicit sport, every selected date, active schedules, course period, linked active product, and product season.
   - Preserve the existing source-tariff preflight as the final authority and expose its known blocker early.
   - Return stable course ordering, exact per-date schedule blocks, meeting point, and a specific unsupported-persistence reason when a course has multiple blocks that the legacy save path cannot safely represent.

2. **Align wizard state and readiness**
   - Show Ski/Snowboard for both booking types.
   - On group sport/date changes, clear incompatible shared and per-participant course selections without replacing them automatically; preserve people and meaningful dates.
   - Link applied group participant IDs to the active cart item and use that same set for readiness, summary, and save.
   - Add group-specific readiness issues for missing sport/course, unavailable dates, and unsupported split-block persistence, with actionable focus targets.

3. **Correct the group UI**
   - Replace recommendation/capacity heuristics with an explicit “Kurs” selector; remove all “Empfohlen” states and sales-capacity disabling.
   - Exclude internal courses and distinguish loading, query error, and genuinely empty/unreleased catalog states.
   - Place fixed course blocks beside the calendar on wide containers and stack on mobile; show split blocks separately and derive meeting point from the selected course.
   - Keep course and participant level distinct, using existing Swiss Snow League labels/catalog ordering and separate Ski/Snowboard options.

4. **Repair participant entry and participant-specific mode**
   - Reuse the existing participant sheet for groups without requiring private timing or teacher state.
   - Provide persistent add/edit entry, predictable apply/cancel/reopen behavior, and no duplicate/orphan local participants.
   - Keep per-person course selection explicit when participant-specific mode is active, applying the same eligibility, sport, date, label, and no-auto-selection rules.

5. **Keep summary and save fail-closed**
   - Show the exact selected shared or per-person group course, dates, blocks, meeting point, and applied participants.
   - Remove stale private times from group state and payload mapping.
   - Block progression/save before writes whenever the current legacy path would drop a split block or duplicate its daily price; retain the existing final `groupBookingPreflight` unchanged as defense.

6. **Fix scheduler course navigation (additional explicit user request, 5 Oct 2026)**
   - Confirmed source defect: both `BookingBar.tsx` and `MobileSchedulerAgenda.tsx` navigate to `/trainings/capacity?course=${booking.ticketId}` without a date. That opens capacity for the current week, not the clicked course/session. Screenshots show a 21 Dec 2026 Windel-Wedel block opening empty KW41 (5–11 Oct).
   - Reuse the existing operational course details: `GroupCoursePlanning` at `/trainings/planning` and its `DailyAssignmentModal`. This is a specific course/session navigation fix, not a redesign or course-generation task.
   - Carry the actual course ID, selected session date/week and exact instance ID from the scheduler. `useSchedulerData` maps group `ticketId` to `g.course_id`, group `id` to `group-instance-${g.id}`, and `date` to `g.date`; never mix up ticket, course and instance IDs.
   - After target data loads, open only the requested course's daily details and visibly identify/focus the clicked instance (especially when a day has two blocks). Initialise the correct local-calendar Monday/week; handle subsequent URL changes and invalid/missing/unauthorised targets explicitly. Do not fall back to an unrelated course or today.
   - Apply one consistent navigation contract to the desktop grid and mobile agenda. Preserve private/office interactions and drag/swipe guards. Closing the details must not reopen it on refetch; browser Back and return to the scheduler must retain the originating date/view where supported, rather than resetting to today.
   - Preserve existing internal visibility rules, including inactive 26/27 courses that have real enrollments. Do not activate a course, generate instances/groups, change enrollment/assignment/price, or make any live write merely by opening details.
   - Keep this patch identifiable from the group wizard changes; no publication.

7. **Make course renaming explicit and side-effect-free (user request, 5 Oct 2026)**
   - Existing source: TrainingCard already offers Bearbeiten; TrainingFormModal exposes the name as “Name (= Niveau)” and says the name defines the level. Correct this misleading distinction: “Kursname” is a display name, not the course's skill-level identity.
   - Provide a clearly labelled, discoverable “Umbenennen” action using the existing Yeti input/confirmation patterns (also usable on touch), prefilled current name, explicit Save and Cancel/ESC. Reuse the existing update mechanism with a name-only partial payload where safe; do not create/copy a course or submit the full course schedule form for renaming.
   - Confirmed existing hazard: TrainingFormModal submits all schedule days/time slots even when only name changes; useUpdateGroupCourse deletes/recreates weekly schedule rows when schedules + weekly type are supplied. A rename must never trigger this branch, change schedule/date IDs, rebuild a day/time Cartesian product, or alter times, instructors, course/skill/product IDs, prices, source mappings, activity state or enrollments.
   - Preserve existing validation, report rejected updates truthfully and do not show success for zero affected rows. Refresh relevant existing course, scheduler and planning reads so the new display name appears consistently. Keep historical issued invoice documents/text snapshots unchanged.
   - Check existing name-based consumers before changing display labels; do not make sport, level or tariff depend on the newly editable display name. Preserve source/import identity.

8. **Make course deletion discoverable and safe (user request, 5 Oct 2026)**
   - Existing source: TrainingCard has an icon-only trash action; Trainings already confirms and useDeleteGroupCourse directly deletes group_courses by ID. Improve discoverability with a clearly labelled action and one named-course confirmation, using existing UI conventions.
   - VERIFIED live schema risk: group_courses cascades deletion into course instances, schedules, course dates and training_groups; instances cascade to enrollments and transfer requests. Other source/history references restrict deletion, and some participant/course references are SET NULL. No course-delete guard trigger is present. Do not merely expose the current raw delete more prominently.
   - Safe default to implement: truly unused courses can be deleted after confirmation; courses with bookings, enrollments, assignment/history/source/event/participant references must retain identity and receive a clear reason plus an explicit optional “Deaktivieren” alternative. Never silently deactivate when the user chose Delete, or silently cascade real booking history. Do not loosen foreign keys or erase source mappings to force deletion.
   - Reuse existing facilities. A client-only count-then-delete is not a complete safety guard: protect the consequential hard-delete server-side against concurrent enrollment. Prepare and test the smallest required guard locally if none exists; do not apply/deploy any new SQL/RPC under this task. Until the protection is available, the UI must not offer an unsafe hard delete or claim the deletion feature is fully ready. Rename/discoverability work can proceed independently.
   - No live course deletions, deactivations, renames or other test data writes. Preserve current roles/permissions, booking/pricing rules, group availability and internal visibility. Report server deployment dependency explicitly if required.

## Verification
- Add focused pure tests for eligibility, all-date schedule matching, inactive/internal/stale-season exclusion, sport invalidation, no capacity lock, and split-block persistence blocking.
- Exercise the actual wizard with synthetic catalog/participant/customer fixtures and all external writes blocked at 1440px and 390px.
- Verify group add/edit/reopen/cancel, valid single-block progression and captured payload, sport switching, empty 26/27 state, summary agreement, private teacher now/later, customer switching, and duplicate-customer choice.
- Run targeted tests, TypeScript, project build, diff checks, and inspect the final preview/build diagnostics. No publish, deployment, migration, live data, invoices, or notifications.

- Scheduler regression: click/tap a synthetic group instance on 21 Dec 2026 from desktop and mobile; land in KW52 and open the matching course/session, not capacity/KW41. Cover a Sunday/week boundary and separate same-day blocks, inactive-but-internally-visible enrolled course, missing/inaccessible target, close/refetch/reopen and Back. Block external writes and verify opening/closing does not generate groups or mutate assignments.

- Course management: synthetic desktop/mobile rename, Cancel/ESC, empty/invalid input, backend error/zero-row result; captured payload contains only the intended name update and existing update timestamp. Verify course/level/product/schedule/date IDs, bookings and historical invoice data are unchanged, including unequal schedules on different weekdays.
- Deletion: synthetic unused course success, cancellation, in-use/source-linked course refusal with clear reason, explicit deactivation choice, permission/network failures and double-click safety. Any new server guard requires isolated database concurrency/regression tests; do not use production writes. State clearly if only UI and unapplied guard are prepared.

## Technical boundaries
- Keep the legacy group save and 26/27 source-tariff preflight; do not activate catalog rows or introduce a new server booking path.
- Treat `max_participants` as planning information only.
- Report the stored “Black Academy SB” ski-discipline inconsistency as data, without name-based correction.
