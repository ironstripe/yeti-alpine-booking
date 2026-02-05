

# Fix: Stale Closure in Scheduler Multi-Select

## Problem Summary

When using Ctrl+Click to select multiple time slots in the scheduler, selecting different time slots fails because `toggleSlotSelection` and `canSelectSlot` read `state.selections` from a stale closure. The state isn't updated between rapid clicks.

## Root Cause

In `src/contexts/SchedulerSelectionContext.tsx`:

```typescript
const toggleSlotSelection = useCallback(
  (slot, bookings, absences) => {
    // PROBLEM: Reads from closure - may be stale!
    const existingSelection = state.selections.find(...);
    
    // PROBLEM: canSelectSlot also reads stale state.selections
    const validation = canSelectSlot(...);
    
    // addSelection does use setState, but validation already failed
    addSelection(slot);
  },
  [state.selections, state.teacherId, ...]  // Dependencies don't help mid-render
);
```

When user:
1. Ctrl+Clicks slot A at 10:00 → `state.selections` is `[]` → adds slot A
2. Immediately Ctrl+Clicks slot B at 14:00 → `state.selections` is STILL `[]` (stale!) → tries to add, but validation may fail or behave incorrectly

## Technical Fix

Refactor `toggleSlotSelection` to use a functional state update pattern where all logic happens inside `setState((prev) => ...)`, accessing `prev.selections` instead of `state.selections`.

**File:** `src/contexts/SchedulerSelectionContext.tsx`

### New Implementation

```typescript
const toggleSlotSelection = useCallback(
  (
    slot: Omit<SlotSelection, "id">,
    bookings: SchedulerBooking[],
    absences: SchedulerAbsence[]
  ): { added: boolean; removed: boolean; error?: string } => {
    let result: { added: boolean; removed: boolean; error?: string } = {
      added: false,
      removed: false,
    };

    setState((prev) => {
      // Check if this exact slot is already selected using PREV state
      const existingSelection = prev.selections.find(
        (s) =>
          s.instructorId === slot.instructorId &&
          s.date === slot.date &&
          s.startTime === slot.startTime &&
          s.endTime === slot.endTime
      );

      if (existingSelection) {
        // Remove the selection (toggle off)
        result = { added: false, removed: true };
        const newSelections = prev.selections.filter((s) => s.id !== existingSelection.id);
        return {
          ...prev,
          selections: newSelections,
          teacherId: newSelections.length === 0 ? null : prev.teacherId,
        };
      }

      // Check if trying to select for a different teacher
      if (prev.teacherId && prev.teacherId !== slot.instructorId) {
        result = { added: false, removed: false, error: "Nur ein Lehrer pro Buchung" };
        return prev; // No change
      }

      // Validate the slot inline (can't use canSelectSlot due to closure)
      const validation = validateSlotInternal(prev, slot, bookings, absences);
      if (!validation.valid) {
        result = { added: false, removed: false, error: validation.reason };
        return prev; // No change
      }

      // Add the selection
      const newSelection: SlotSelection = {
        ...slot,
        id: generateSlotId(),
      };
      result = { added: true, removed: false };
      
      return {
        ...prev,
        teacherId: slot.instructorId,
        selections: [...prev.selections, newSelection],
        anchorSlot: {
          instructorId: slot.instructorId,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMinutes: slot.durationMinutes,
        },
      };
    });

    return result;
  },
  [] // No dependencies needed - all state access is via prev
);
```

### Helper Function for Validation

Extract validation logic into a pure function that takes state as a parameter:

```typescript
function validateSlotInternal(
  state: SelectionState,
  slot: Omit<SlotSelection, "id">,
  bookings: SchedulerBooking[],
  absences: SchedulerAbsence[]
): { valid: boolean; reason?: string } {
  const { instructorId, date, startTime, endTime } = slot;
  
  // Check if date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotDate = new Date(date);
  slotDate.setHours(0, 0, 0, 0);
  if (slotDate < today) {
    return { valid: false, reason: "Vergangene Daten können nicht gebucht werden" };
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const duration = endMinutes - startMinutes;

  // Operational hours, duration checks...
  if (startMinutes < OPERATIONAL_START_MINUTES) {
    return { valid: false, reason: "Frühester Start: 09:00" };
  }
  if (endMinutes > OPERATIONAL_END_MINUTES) {
    return { valid: false, reason: "Spätestes Ende: 16:00 (Liftschluss)" };
  }
  if (duration < 60) {
    return { valid: false, reason: "Mindestdauer: 60 Minuten" };
  }
  if (duration > 240) {
    return { valid: false, reason: "Maximaldauer: 4 Stunden" };
  }

  // Check absences
  const isAbsent = absences.some(
    (a) => a.instructorId === instructorId && date >= a.startDate && date <= a.endDate
  );
  if (isAbsent) {
    return { valid: false, reason: "Lehrer abwesend" };
  }

  // Check booking overlaps
  const hasBookingOverlap = bookings.some((b) => {
    if (b.instructorId !== instructorId || b.date !== date) return false;
    const bookingStart = timeToMinutes(b.timeStart);
    const bookingEnd = timeToMinutes(b.timeEnd);
    return startMinutes < bookingEnd && endMinutes > bookingStart;
  });
  if (hasBookingOverlap) {
    return { valid: false, reason: "Zeitraum bereits belegt" };
  }

  // Check selection overlaps using passed state
  const hasSelectionOverlap = state.selections.some((s) => {
    if (s.instructorId !== instructorId || s.date !== date) return false;
    const selStart = timeToMinutes(s.startTime);
    const selEnd = timeToMinutes(s.endTime);
    return startMinutes < selEnd && endMinutes > selStart;
  });
  if (hasSelectionOverlap) {
    return { valid: false, reason: "Überschneidung mit anderer Auswahl" };
  }

  return { valid: true };
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/contexts/SchedulerSelectionContext.tsx` | Refactor `toggleSlotSelection` to use functional state update; add `validateSlotInternal` helper |

---

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Ctrl+Click 10:00, then 14:00 | Second click may fail/behave incorrectly | Both slots selected correctly |
| Rapid multi-selection | Stale state causes missed selections | All selections captured |
| Toggle off existing selection | May not find selection due to stale state | Correctly removes selection |

---

## Testing Checklist

- [ ] Ctrl+Click first slot at 10:00 - verify selection appears
- [ ] Immediately Ctrl+Click second slot at 14:00 (same day) - verify both selected
- [ ] Ctrl+Click third slot on different day - verify all three selected
- [ ] Ctrl+Click an already-selected slot - verify it deselects
- [ ] Click "Buchung erstellen" - verify wizard receives all slots with correct times

