

# Unified Day×Time Selection Grid for Booking Wizard

## Problem Summary

The current booking wizard separates date selection (calendar) from time selection (dropdowns), making it impossible to visually select time blocks that span multiple days. Users expect a scheduler-like experience where they can drag across days to select time slots.

## Solution Architecture

Create a new **BookingTimeGrid** component that combines date and time selection into a single unified grid, similar to the main scheduler but optimized for booking creation.

---

## Technical Changes

### 1. New Component: BookingTimeGrid

**New File**: `src/components/bookings/wizard/BookingTimeGrid.tsx`

A visual grid where:
- **X-axis (columns)**: Days (the selected dates from the RangeDatePicker)
- **Y-axis (rows)**: Hours (09:00 - 16:00)
- **Cells**: Clickable/draggable to select time blocks

Features:
- **Click a cell**: Start selection at that day/hour
- **Drag horizontally**: Select same hours across multiple days (e.g., 10:00-12:00 on Mon, Tue, Wed)
- **Drag vertically**: Extend duration on a single day
- **Drag diagonally**: Different durations per day (advanced)
- **Shift+Click**: Copy first day's selection to clicked day
- **Visual feedback**: Blue highlight for selection, green for available, red for conflicts

```text
Grid Layout:
         │ Mo 10. │ Di 11. │ Mi 12. │ Do 13. │ Fr 14. │
─────────┼────────┼────────┼────────┼────────┼────────┤
09:00    │   ○    │   ○    │   ○    │   ○    │   ○    │
10:00    │  [▓▓]  │  [▓▓]  │  [▓▓]  │   ○    │   ○    │ ← Dragged selection
11:00    │  [▓▓]  │  [▓▓]  │  [▓▓]  │   ○    │   ○    │
12:00    │   ○    │   ○    │   ○    │   ○    │   ○    │
13:00    │   ○    │   ○    │   ○    │   ○    │   ○    │
14:00    │   ○    │   ○    │   ○    │   ○    │   ○    │
15:00    │   ○    │   ○    │   ○    │   ○    │   ○    │

Legend: ○ = Available, ▓ = Selected, ● = Blocked
```

### 2. State Management for Multi-Day Time Selection

**File**: `src/contexts/BookingWizardContext.tsx`

Add new selection state that tracks per-day time selections:

```typescript
interface TimeSelection {
  date: string;
  startTime: string;
  endTime: string;
}

interface BookingWizardState {
  // ... existing fields ...
  
  // NEW: Per-day time selections (replaces simple timeSlot for periods)
  timeSelections: TimeSelection[];
}
```

Add actions:
```typescript
setTimeSelections: (selections: TimeSelection[]) => void;
addTimeSelection: (selection: TimeSelection) => void;
removeTimeSelection: (date: string) => void;
```

### 3. Drag Selection Logic

Implement drag handling similar to `SchedulerSelectionContext`:

```typescript
interface DragState {
  isActive: boolean;
  startDate: string | null;
  startHour: number | null;
  currentDate: string | null;
  currentHour: number | null;
  mode: 'horizontal' | 'vertical' | 'diagonal';
}

// On drag end, calculate selections:
// - Horizontal drag: Same time range across selected days
// - Vertical drag: Different time range on single day
// - Diagonal: Per-day time variations
```

### 4. Integration into Step 2

**File**: `src/components/bookings/wizard/Step2ProductDates.tsx`

After date selection, show the BookingTimeGrid:

```tsx
{state.productType === "private" && state.selectedDates.length > 0 && (
  <>
    <Separator className="my-4" />
    <div className="space-y-3">
      <Label className="text-base font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Zeitauswahl
      </Label>
      <p className="text-sm text-muted-foreground">
        Klicken oder ziehen Sie, um Zeitblöcke auszuwählen. 
        Shift+Klick kopiert die Auswahl auf andere Tage.
      </p>
      <BookingTimeGrid
        selectedDates={state.selectedDates}
        timeSelections={state.timeSelections}
        onSelectionChange={setTimeSelections}
        minDuration={60} // 1 hour minimum
        maxDuration={240} // 4 hours maximum
      />
    </div>
  </>
)}
```

### 5. Visual Design

The grid will follow the scheduler's visual language:

| State | Color | Border |
|-------|-------|--------|
| Available | `bg-emerald-50` | Light |
| Selected | `bg-primary/30` | `ring-primary` |
| Dragging Preview | `bg-blue-100` | Dashed |
| Blocked (conflict) | `bg-rose-100` | None |
| Hover | `bg-slate-100` | None |

Selection summary shown below grid:
```
Ausgewählt: Mo-Mi 10:00-12:00 (2h × 3 Tage = 6h total)
```

### 6. Interaction Patterns

**Pattern A: Uniform Time (Most Common)**
1. Click first cell (Mon 10:00)
2. Drag right to Wed 10:00
3. Drag down to extend to 12:00
4. Result: Mon-Wed, 10:00-12:00 (same time each day)

**Pattern B: Shift+Click Extension**
1. Select Mon 10:00-12:00
2. Shift+Click on Fri 10:00
3. Result: Mon 10:00-12:00 copied to Fri

**Pattern C: Per-Day Variation**
1. Select Mon 10:00-12:00
2. Select Wed 14:00-16:00 (new selection, not extending)
3. Result: Two different time slots on different days

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/bookings/wizard/BookingTimeGrid.tsx` | Create | New unified day×time selection grid |
| `src/contexts/BookingWizardContext.tsx` | Modify | Add `timeSelections` state and actions |
| `src/components/bookings/wizard/Step2ProductDates.tsx` | Modify | Integrate BookingTimeGrid after date selection |
| `src/hooks/useCreateBooking.ts` | Modify | Use `timeSelections` instead of single `timeSlot` |

---

## Implementation Order

1. **Phase A**: Add `timeSelections` state to BookingWizardContext
2. **Phase B**: Create `BookingTimeGrid` component with basic click selection
3. **Phase C**: Implement drag selection (horizontal first)
4. **Phase D**: Add vertical and diagonal drag support
5. **Phase E**: Implement Shift+Click for day copying
6. **Phase F**: Integrate into Step2ProductDates
7. **Phase G**: Update creation logic to use new selections
8. **Phase H**: Remove/hide old dropdown time selectors when grid is active

---

## Expected Behavior

| Action | Result |
|--------|--------|
| Click single cell | Select 1-hour block on that day |
| Drag horizontally | Select same hour range across days |
| Drag vertically | Extend duration on single day |
| Shift+Click | Copy first day's selection to clicked day |
| Click selected cell | Deselect that day |
| Visual feedback | Blue preview while dragging, green when committed |

---

## Compatibility

- Works alongside existing `PeriodDayPlanner` (Step 3) for instructor overrides
- `timeSelections` can populate `dayTimeOverrides` automatically
- Single-day bookings still work (grid shows one column)
- Existing dropdown time selection remains as fallback/simple mode

