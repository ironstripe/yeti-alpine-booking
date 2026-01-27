
Goal
- When creating a group booking with multiple participants who have different ski levels, the wizard must automatically switch into participant-specific booking mode and assign each participant to an appropriate group (with the option to adjust), matching the behavior you expect.

What I found (why it’s “not solved”)
- The wizard page `/bookings/new` renders `Step2ProductAllocation.tsx` for step 2.
- The “auto-enable individual booking mode” logic we added earlier lives in `Step2ProductDates.tsx`, but that component is not used anywhere in the current wizard flow.
- Therefore the UI you show in the screenshot is still the shared `GroupSelector` inside `Step2ProductAllocation.tsx`, which explicitly warns: “Alle werden in dieselbe Gruppe eingeschrieben.”

Scope of fix
A) Fix the Step 2 UI so the correct mode is activated (and the shared group selector disappears)
B) Fix booking creation so that, when participant-specific mode is used, the backend enrollment records are created per participant and per selected group (not only for one shared group)

Implementation plan

1) Update Step 2 (active wizard screen) to support participant-specific mode for group bookings
Files
- src/components/bookings/wizard/Step2ProductAllocation.tsx
- (re-use existing) src/components/bookings/wizard/ParticipantBookingCard.tsx
- (re-use existing) src/contexts/BookingWizardContext.tsx (only if we need a small helper tweak)

Changes
1.1 Add mismatch detection to Step2ProductAllocation
- Add `hasDifferentLevels`:
  - Normalize levels (treat null/undefined as "unknown") OR use `mapLevelToCourseSkill` to detect mismatch.
- Add `hasAgeMismatch` (toddler + older) to mirror existing behavior expectations.

1.2 Auto-enable participant-specific booking mode in Step2ProductAllocation (the screen you’re actually using)
- Add a `useEffect` in Step2ProductAllocation:
  - Trigger when:
    - productType === "group"
    - selectedParticipants.length > 1
    - (hasDifferentLevels || hasAgeMismatch)
    - NOT already in participant-specific mode
  - Actions:
    - Clear shared group selection (`setSelectedGroupId(null)`) so we don’t “carry over” one group to everyone.
    - Initialize participant bookings (`initializeParticipantBookings()`).
    - Enable participant-specific mode (`setUseParticipantSpecificBooking(true)`).

1.3 Render participant cards in Step2ProductAllocation when participant mode is active
- In the group-course section of Step2ProductAllocation:
  - If `state.useParticipantSpecificBooking === true`:
    - Replace the shared “2 Teilnehmer werden … eingeschrieben” preview + `GroupSelector` with:
      - A short info banner: “Individuelle Buchung aktiviert – Teilnehmer werden automatisch in passende Kurse eingeschrieben.”
      - A list of `ParticipantBookingCard` for each participant (already built to:
        - auto-recommend a group per participant level
        - allow adjustments
        - handle lunch days per participant)
    - Hide `LunchSupervisionAddon` in this mode to avoid conflicting sources of truth (in participant mode lunch is stored in `participantBookings`, while the add-on edits `lunchSelections`).

Expected UI result
- As soon as “Gruppe” is selected and the system detects different levels:
  - The screen switches away from the shared group dropdown.
  - You see one card per participant with its own group dropdown.
  - Each participant gets auto-assigned to a suitable group (if available capacity exists).

2) Fix booking creation so enrollments are created per participant-selected group (participant-specific mode)
Why this is necessary
- Even if the UI is corrected, the current booking creation logic only creates group enrollments for `state.selectedGroupId` (a single shared group).
- In participant-specific mode we need enrollments for each participant’s `participantBookings[participantId].groupCourseId`.

File
- src/hooks/useCreateBooking.ts

Changes
2.1 Make the inserted ticket_items query include fields needed to correctly link enrollments
- Change the insert `.select(...)` to include at least:
  - `id, participant_id, date, item_type, product_id`
- This avoids accidentally linking group enrollments to the participant’s lunch item (same participant_id/date).

2.2 Add participant-specific group enrollment path
- If `state.useParticipantSpecificBooking`:
  - For each participant:
    - Read `pBooking`
    - If `pBooking.productType === "group"` and `pBooking.groupCourseId` exists:
      - For each date in `pBooking.dates`:
        - Get-or-create `group_course_instance` for (course_id = pBooking.groupCourseId, date)
          - Use course schedules to set instance start/end time (same logic as today, but per course)
        - Find the matching inserted “group” ticket_item for this participant/date
        - Insert `group_course_enrollments` row pointing to:
          - instance_id
          - participant_id (null for guests)
          - ticket_item_id
        - Update instance `current_participants` (count enrollments per instance)
- Keep existing shared-mode enrollment logic as-is for non-participant-specific bookings.

3) Verification steps (what I’ll test in the preview)
UI
- Go to /bookings/new, pick a customer with 2 participants of different levels
- Select “Gruppe” + pick course days
- Confirm:
  - The wizard automatically switches to per-participant cards
  - Each participant has an auto-selected group matching their level (where capacity permits)

Data (backend)
- Create the booking
- Confirm:
  - Ticket items exist for each participant/date
  - Group enrollments exist in the correct course instances for each participant (not all in one shared course)
  - Instance participant counts are updated

Edge cases handled
- If user already picked a shared group before the auto-switch triggers:
  - We explicitly clear `selectedGroupId` when enabling participant-specific mode to prevent “everyone stays in the same group” as in your screenshot.
- Missing levels:
  - Treated as “unknown” so mixed known/unknown also triggers participant-specific mode (safer than silently forcing same group).
- Capacity issues:
  - ParticipantBookingCard already disables full courses and shows capacity; user can adjust if the recommended option is full.

Deliverables (code changes)
- Step2ProductAllocation: add mismatch detection + auto-enable + participant-card rendering in group mode
- useCreateBooking: participant-specific enrollment creation and safer ticket_item linkage for enrollments

Outcome
- The wizard will behave like you expect: when participants differ in level, they will not be pushed into one shared group. Each participant will get their own appropriate group assignment, automatically, with correct enrollment records created when the booking is finalized.
