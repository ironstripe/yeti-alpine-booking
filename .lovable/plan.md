

# Fix Multi-Instructor Mini-Scheduler Selection Issues

## Root Causes

### Issue 1: False "Unubliche Startzeit" Warning
The mini-scheduler stores each hour-cell as a separate slot (10:00-11:00 and 11:00-12:00). When `applyMiniSchedulerSelection` computes the "base time", it picks the most frequent 1h slot (e.g., 10:00-11:00), resulting in `duration = 1` and triggering the unusual-slot warning. The fix is to **merge adjacent slots per instructor per date** into contiguous time ranges before computing the base time and duration.

### Issue 2: Only One Instructor in Selection Display
The bottom "Ausgewahlt" bar (lines 1032-1043 of `Step2ProductAllocation.tsx`) shows `state.instructor` -- which is the single "base" instructor. When `applyMiniSchedulerSelection` runs, it sets `instructorId: baseInstructorId` but never clears or updates `state.instructor` (the full object). So the old instructor from a previous selection (or none) persists. The fix is to **clear `state.instructor` when a multi-group proposal is created** (since individual instructors are tracked per group).

### Issue 3: Wrong Instructor Name ("Christoph Buhler")
The "Ausgewahlt" display shows `state.instructor.first_name + state.instructor.last_name`. Since `applyMiniSchedulerSelection` does not update `state.instructor`, it shows whatever was previously set. The fix is the same as Issue 2 -- clear the base instructor when using multi-group proposal, AND hide the "Ausgewahlt" bar entirely when a multi-group proposal is active.

## Changes

### File 1: `src/contexts/BookingWizardContext.tsx`

**Merge adjacent slots before computing base time** (in `applyMiniSchedulerSelection`, around line 720):
- After sorting slots, group them by (instructorId + date) 
- Merge consecutive 1h slots into contiguous ranges (e.g., 10:00-11:00 + 11:00-12:00 becomes 10:00-12:00)
- Use these merged ranges for base time/duration calculation and for the group proposal times

**Clear instructor when multi-group proposal is created** (around line 865):
- When `privateGroupProposal` is built (multi-instructor + multi-participant), set `instructor: null` and `instructorId: null` in the returned state
- This prevents stale instructor data from showing

### File 2: `src/components/bookings/wizard/Step2ProductAllocation.tsx`

**Hide the "Ausgewahlt" instructor bar when a multi-group proposal exists** (lines 1032-1043):
- Add condition: only show when `!state.privateGroupProposal || state.privateGroupProposal.groups.length <= 1`
- When multi-group proposal is active, Step 2 already shows the Group Proposal Panel with per-group instructors

## Slot Merging Logic

```text
Input slots: [{Azaroual, Mon, 10:00-11:00}, {Azaroual, Mon, 11:00-12:00}, 
              {Bader, Tue, 10:00-11:00}, {Bader, Tue, 11:00-12:00}]

After merge: [{Azaroual, Mon, 10:00-12:00}, {Bader, Tue, 10:00-12:00}]

Base time: 10:00-12:00 (most frequent merged range)
Duration: 2h
isUnusualSlot: false (duration != 1)
```

## Files Summary

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` | Merge adjacent slots before base time calculation; clear instructor on multi-group proposal |
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | Hide single-instructor "Ausgewahlt" bar when multi-group proposal is active |
