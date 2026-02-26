

# Fix: Single-cell click highlights slots on ALL dates

## Problem

When you click a single cell (e.g., 11:00 on Fr. 27 for D. Clarke), the slot gets correctly added to the multi-select. However, the `isWithinSelectedDuration` highlight (line 677) also activates, which highlights the same time slot across ALL dates for the selected instructor. This creates the illusion of selecting 2+ cells when you only clicked one.

**Root cause**: The `isWithinSelectedDuration` check (line 342) only compares the hour against `selectedStartTime + selectedDuration` -- it does NOT filter by date. So if you click 11:00 on Fr. 27, it highlights 11:00 on Sa. 28 as well.

Additionally, the `onSlotSelect` call on line 652 updates `selectedStartTime` and `selectedDuration` on every click, which feeds the duration highlight. In the new toggle-based model, the duration highlight is redundant since selections are tracked individually via `multiSelectSlots`.

## Solution

**File: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`**

1. **Remove the `isSelectedInstructorDuration` highlight entirely** (line 677). In the toggle-based model, selected cells are already visualized by the `isMultiSelected` check (line 672). The duration-based highlight is a leftover from the old single-select model and now causes double/phantom highlighting.

2. **Remove the `isWithinSelectedDuration` function** (lines 342-346) since it's no longer used.

3. **Remove the `isSelectedInstructorDuration` variable** (line 582) that calls the removed function.

4. **Remove the selected-instructor row highlight that dims ALL cells** (line 682): `isSelected && available && !inDragRange && "bg-primary/10 hover:bg-primary/20"`. This makes the entire row of the selected instructor look highlighted even when individual cells are not selected.

**File: `src/components/bookings/wizard/Step2ProductAllocation.tsx`**

5. **Remove the `setStartTime` / `setEndTime` calls** from `handleSlotSelect` (lines 427-428). In the toggle model, time syncing should derive from the multi-select state, not from individual clicks. The instructor assignment (`setInstructor`) can remain.

These changes ensure: one click = one cell highlighted, via the existing `isMultiSelected` visual (checkmark + ring).

### Files Changed

| File | Change |
|------|--------|
| `MiniSchedulerGrid.tsx` | Remove `isWithinSelectedDuration`, `isSelectedInstructorDuration`, and the selected-instructor row tint from cell styling |
| `Step2ProductAllocation.tsx` | Remove `setStartTime`/`setEndTime` from `handleSlotSelect` to stop feeding the duration highlight |

