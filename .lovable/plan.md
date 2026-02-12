
# Fix: Multi-Instructor Mini-Scheduler Selection for Multi-Participant Bookings

## Problem

When booking 2 participants and selecting slots from the mini-scheduler with **different instructors** (e.g., O. Elmiger for Mon/Tue and H. Dirnhofer for Mon/Tue), the system:

1. **Resets the selection** when you Ctrl+Click a slot from a second instructor (line 666-677 in `BookingWizardContext.tsx` forces single-instructor)
2. **Only stores one "base" instructor** with per-day overrides -- but two participants needing two instructors at the **same time on the same days** cannot be expressed as day-level overrides
3. The existing `privateGroupProposal` system (which supports per-participant instructor assignment) is only triggered by the level-based grouping algorithm, not by manual mini-scheduler selections

## Solution

### Part 1: Allow Multi-Instructor Slot Selection

Remove the restriction in `toggleMiniSchedulerSlot` that resets the selection when a different instructor is picked. Allow slots from multiple instructors to coexist in the `miniSchedulerSelections` array.

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` (lines 665-677) | Remove the "different instructor = reset" logic. Simply add the new slot regardless of instructor. |

### Part 2: Detect Multi-Instructor Selections and Generate Group Proposal

Update `applyMiniSchedulerSelection` to detect when selected slots span multiple instructors. When they do AND there are multiple participants:

- Group the slots by instructor
- Create a `privateGroupProposal` automatically, assigning participants round-robin or evenly across instructor groups
- Each group gets its own instructor, time, and participant list

If only one instructor is selected, the current logic remains unchanged.

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` (lines 728-850) | After computing instructor counts, if multiple instructors are found AND `selectedParticipants.length > 1`, build a `privateGroupProposal` with groups split by instructor. Use the first instructor's slots for group 1 participants, second instructor's slots for group 2, etc. |

### Part 3: Show Multi-Instructor Selection Count in UI

The floating action bar already shows "X Slots ausgewahlt". Update it to also show the instructor breakdown when multiple instructors are selected (e.g., "4 Slots: O. Elmiger (2), H. Dirnhofer (2)").

| File | Change |
|------|--------|
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` (lines 948-955) | Enhance the selection badge to show per-instructor counts when multi-instructor slots are selected |

### Part 4: Ensure Step 3 Reflects the Group Proposal

Step 3 (`Step3InstructorDetails.tsx`) already handles `privateGroupProposal` correctly -- it shows "Skilehrer wurden pro Gruppe in Schritt 2 zugewiesen" when a multi-group proposal exists. No changes needed here.

Similarly, `BookingSummaryCards.tsx` and `PriceBreakdown.tsx` already render per-group details. No changes needed.

## Logic Flow After Fix

```text
Mini-Scheduler: User Ctrl+Clicks slots across 2 instructors
  -> toggleMiniSchedulerSlot: allows multi-instructor (no reset)
  -> UI shows "4 Slots: Elmiger (2), Dirnhofer (2)"
  -> User clicks "Auswahl ubernehmen"
  -> applyMiniSchedulerSelection detects 2 instructors + 2 participants
  -> Creates privateGroupProposal:
       Group 1: Participant A -> Elmiger, 12:00-13:00
       Group 2: Participant B -> Dirnhofer, 12:00-13:00
  -> Step 2 Group Proposal Panel shows the assignment (editable)
  -> Step 3 shows "Skilehrer pro Gruppe zugewiesen"
  -> Step 4 summary shows both groups with correct pricing
```

## Participant-to-Group Assignment Strategy

When the grouping algorithm hasn't split participants (compatible levels), the mini-scheduler multi-instructor selection will assign participants evenly:
- With 2 participants and 2 instructors: 1 participant per instructor
- With 3 participants and 2 instructors: 2 to the first, 1 to the second
- The assignment follows participant order (as listed in Step 1)
- The user can always adjust assignments in the Group Proposal Panel

## Files Summary

| File | Action |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` | Allow multi-instructor selection + generate group proposal on apply |
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | Enhance selection badge UI for multi-instructor feedback |

## Edge Cases Handled

- **1 participant, 2 instructors**: Falls back to the existing day-override model (different instructor per day)
- **2+ participants, 1 instructor**: No change to current behavior
- **Algorithm already split groups**: Mini-scheduler selections update the existing group proposal's instructors rather than creating a new one
- **More instructors than participants**: Extra instructor groups are created with empty participant lists (user must assign manually)
