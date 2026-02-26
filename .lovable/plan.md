

# Fix Mini-Scheduler UX: Stable Sorting + Intuitive Click Behavior

## Problems Identified

### Problem 1: Instructor list reorders after slot selection
When you click a slot for an instructor (e.g., Dominique Clarke), the `handleSlotSelect` callback updates `selectedStartTime` and `selectedDuration` in the wizard state. The `sortedInstructors` memo in `MiniSchedulerGrid.tsx` depends on `selectedStartTime` and `selectedDuration` (line 345), which triggers a re-sort using `isAvailableForSelectedTime()`. This causes instructors to jump positions after selection -- very disorienting.

### Problem 2: Single click selects 4 slots (entire duration block)
When you click one cell, the drag handler fires `onSlotSelect` with the selected duration (e.g., if duration is set to 1h, it should select 1 slot). However, the `isWithinSelectedDuration` highlight (line 593) highlights ALL slots matching the selected time window across the instructor's row, creating the visual impression of 4 slots being selected. Additionally, if `selectedDuration` was previously set to a longer value, the hover preview (`isInHoverPreview`) shows a multi-slot block.

### Problem 3: Multi-select requires Ctrl+Click
Currently, selecting multiple cells requires Ctrl+Click (line 654). The user wants plain left-click to allow marking multiple cells.

---

## Solution

### Fix 1: Freeze instructor order once selected

**File: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`**

- Add a `useRef` to capture and freeze the instructor sort order after the initial render (or after dates/sport/language change).
- Once sorted, the list stays stable regardless of `selectedStartTime` or `selectedDuration` changes.
- Only re-sort when meaningful filter criteria change (dates, sport, language, instructor data).
- Pin the selected instructor to its current position (don't move it to top or let it drift down).

Implementation: Split the `sortedInstructors` memo into two stages:
1. A "base sort" memo that depends only on `instructors, sport, language, selectedDates, bookings, absences, preferredTeacher, bookingHistory` (NOT `selectedStartTime` or `selectedDuration`).
2. The availability-for-time check becomes a visual indicator (dimming) rather than a re-sort trigger.

### Fix 2: Single-slot click behavior (no phantom multi-select)

**File: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`**

- Change click behavior: a single click on a free slot selects ONLY that 1-hour cell, not the entire duration block.
- The `isWithinSelectedDuration` highlight should only apply AFTER the user has explicitly set a duration via the dropdown -- not as an automatic expansion of a click.
- Remove the duration-based hover preview that shows multiple slots highlighted. Instead, show a subtle single-cell hover.

### Fix 3: Plain click for multi-select (no Ctrl required)

**File: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`**

Change the click model to a toggle-based approach:
- **Plain click** on a free slot toggles it selected/unselected (adds/removes from selection).
- Clicking a slot for the **same instructor** adds to the selection.
- Clicking a slot for a **different instructor** is allowed for multi-instructor scenarios (existing behavior for multi-group proposals).
- A "Clear Selection" action remains available.
- The drag behavior (mousedown + drag across slots) continues to work for selecting contiguous time ranges.

**File: `src/components/bookings/wizard/Step2ProductAllocation.tsx`**

- Update `handleSlotSelect` to work with the new toggle model.
- When a slot is clicked, it gets added to `miniSchedulerSelections` directly (like the current Ctrl+Click path does).
- The "selected instructor" indicator updates to show the most recently clicked instructor.
- The time/duration dropdowns sync from the selection (most common time becomes the default).

---

## Technical Details

### Instructor Sort Stability

```text
// Before: sortedInstructors depends on selectedStartTime, selectedDuration
useMemo(() => { ... }, [instructors, ..., selectedStartTime, selectedDuration]);

// After: Remove selectedStartTime and selectedDuration from deps
// Use dimming (opacity) instead of re-sorting for unavailable instructors
useMemo(() => { ... }, [instructors, sport, language, selectedDates, bookings, absences, preferredTeacher, bookingHistory]);
```

The `isAvailableForSelectedTime` check moves from a sort criterion to a purely visual indicator (the existing `opacity-50` class on line 522 already does this).

### New Click Model

```text
onMouseUp handler changes:
  Before: Ctrl+Click -> multi-select, Plain click -> single select + clear
  After:  Plain click -> toggle in multi-select, always additive
          The "Apply Selection" bar appears when selections.length > 0
          User clicks "Apply" to commit, or continues adding
```

### Files Changed

| File | Change |
|------|--------|
| `src/components/bookings/wizard/MiniSchedulerGrid.tsx` | Remove time-based re-sorting; change click to toggle-select; simplify hover preview to single cell |
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | Update `handleSlotSelect` to use toggle model; keep multi-select action bar |

