
# Plan: Make First Column of Scheduler Dynamically Resizable

## Overview

The scheduler's instructor column (currently fixed at `w-28` = 112px) will be made resizable by dragging its right edge. This requires:
1. Managing column width state in SchedulerGrid
2. Passing width to all child components
3. Adding a drag handle between the instructor column and the time grid
4. Persisting width preference in localStorage

## Technical Approach

Since the scheduler uses a custom table-like layout (not `react-resizable-panels`), we'll implement a custom resize handle that tracks mouse drag to adjust width.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerGrid.tsx` | Add `instructorColumnWidth` state + persistence |
| `src/components/scheduler/StickyTimeHeader.tsx` | Accept `instructorColumnWidth` prop, replace fixed `w-28` |
| `src/components/scheduler/SingleDayInstructorRow.tsx` | Accept `instructorColumnWidth` prop, replace fixed `w-28` |
| `src/components/scheduler/InstructorWeekBlock.tsx` | Accept `instructorColumnWidth` prop, replace fixed `w-28` |
| `src/components/scheduler/InstructorFocusView.tsx` | Pass through `instructorColumnWidth`, update skeleton |
| `src/components/scheduler/ColumnResizeHandle.tsx` | **NEW** - Custom resize handle component |

---

## Implementation Details

### 1. New Component: ColumnResizeHandle

Create a draggable resize handle that sits on the right edge of the instructor column:

```typescript
// src/components/scheduler/ColumnResizeHandle.tsx
interface ColumnResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}

export function ColumnResizeHandle({ onResize, onResizeEnd }: ColumnResizeHandleProps) {
  // Track mouse drag
  // Show visual indicator (thin line with grip icon on hover)
  // Call onResize with delta during drag
  // Call onResizeEnd when mouse up
}
```

**Visual Design:**
- Default: 2px transparent border that shows slate-300 on hover
- Dragging: Blue highlight line
- Cursor: `col-resize`
- Optional grip icon appears on hover

### 2. State Management in SchedulerGrid

Add state and localStorage persistence:

```typescript
// Constants
const MIN_INSTRUCTOR_COL_WIDTH = 80;  // Minimum readable width
const MAX_INSTRUCTOR_COL_WIDTH = 200; // Maximum to prevent overflow
const DEFAULT_INSTRUCTOR_COL_WIDTH = 112; // Current w-28 = 7rem = 112px
const STORAGE_KEY = 'scheduler-instructor-col-width';

// State with persistence
const [instructorColumnWidth, setInstructorColumnWidth] = useState(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? parseInt(saved, 10) : DEFAULT_INSTRUCTOR_COL_WIDTH;
});

// Resize handler with bounds clamping
const handleColumnResize = useCallback((deltaX: number) => {
  setInstructorColumnWidth(prev => 
    Math.max(MIN_INSTRUCTOR_COL_WIDTH, 
      Math.min(MAX_INSTRUCTOR_COL_WIDTH, prev + deltaX)
    )
  );
}, []);

// Persist on resize end
const handleResizeEnd = useCallback(() => {
  localStorage.setItem(STORAGE_KEY, instructorColumnWidth.toString());
}, [instructorColumnWidth]);
```

### 3. Update StickyTimeHeader

Replace fixed width with dynamic:

```typescript
interface StickyTimeHeaderProps {
  slotWidth: number;
  showDayColumn?: boolean;
  instructorColumnWidth: number; // NEW
}

// Replace w-28 with inline style
<div 
  className="shrink-0 border-r border-slate-300 px-2 py-1.5 ..."
  style={{ width: `${instructorColumnWidth}px` }}
>
  Lehrer
</div>

// Update sticky left position for day column
{showDayColumn && (
  <div 
    className="w-14 shrink-0 ..."
    style={{ left: `${instructorColumnWidth}px` }}
  >
    Tag
  </div>
)}
```

### 4. Update SingleDayInstructorRow

```typescript
interface SingleDayInstructorRowProps {
  // ... existing
  instructorColumnWidth: number; // NEW
}

// Replace w-28 with dynamic width
<div 
  className="shrink-0 border-r border-slate-300 px-2 py-1 flex ..."
  style={{ width: `${instructorColumnWidth}px` }}
>
```

### 5. Update InstructorWeekBlock

More complex because day column has `sticky left-28`:

```typescript
interface InstructorWeekBlockProps {
  // ... existing
  instructorColumnWidth: number; // NEW
}

// Instructor column
<div 
  className="shrink-0 border-r border-slate-300 sticky left-0 z-20"
  style={{ width: `${instructorColumnWidth}px` }}
>

// Day column sticky position
<div 
  className="w-14 shrink-0 border-r ... sticky z-10"
  style={{ left: `${instructorColumnWidth}px` }}
>
```

### 6. Update InstructorFocusView

Pass through the width and update skeleton placeholders:

```typescript
interface InstructorFocusViewProps {
  // ... existing
  instructorColumnWidth: number; // NEW
}

// Pass to child components
<SingleDayInstructorRow
  instructorColumnWidth={instructorColumnWidth}
  // ...
/>

<InstructorWeekBlock
  instructorColumnWidth={instructorColumnWidth}
  // ...
/>

// Update skeleton widths
<div 
  className="shrink-0 border-r border-slate-300 px-2 py-2"
  style={{ width: `${instructorColumnWidth}px` }}
>
```

---

## Visual Behavior

```text
Before resize:
┌──────────────┬────────────────────────────────────┐
│ Lehrer       │ 09:00 │ 10:00 │ 11:00 │ ...       │
├──────────────┼────────────────────────────────────┤
│ Max M. ⛷️   ║ [Booking blocks...]                │
│ Anna S. 🏂  ║                                    │
└──────────────┴────────────────────────────────────┘
              ↑
         Resize handle (hover to show, drag to resize)

After dragging wider:
┌────────────────────┬──────────────────────────────┐
│ Lehrer             │ 09:00 │ 10:00 │ 11:00 │ ... │
├────────────────────┼──────────────────────────────┤
│ Max Mueller ⛷️    ║ [Booking blocks...]          │
│ Anna Schmidt 🏂   ║                              │
└────────────────────┴──────────────────────────────┘
```

---

## Implementation Order

1. Create `ColumnResizeHandle.tsx` component
2. Add state + handlers to `SchedulerGrid.tsx`
3. Update `StickyTimeHeader.tsx` to accept dynamic width
4. Update `SingleDayInstructorRow.tsx` to accept dynamic width
5. Update `InstructorWeekBlock.tsx` to accept dynamic width + adjust day column sticky position
6. Update `InstructorFocusView.tsx` to pass through width + update skeletons

---

## Technical Notes

- **Bounds**: Width clamped between 80px and 200px
- **Persistence**: Saved to localStorage as `scheduler-instructor-col-width`
- **Performance**: Resize uses inline styles for smooth animation
- **Accessibility**: Handle is keyboard focusable with arrow key support (optional enhancement)
- **Mobile**: Resize handle hidden on touch devices (column uses default width)
