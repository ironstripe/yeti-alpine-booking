
# Fix: Escape Key Not Exiting Fullscreen Mode

## Problem Analysis

The Escape key to exit fullscreen mode doesn't work due to:

1. **Multiple keydown handlers**: Two separate `useEffect` hooks attach keydown listeners to `window`
2. **Stale closure issue**: The `clearSelection` function in the dependency array changes on re-renders, potentially causing the handler to have an outdated `isFullscreen` value
3. **Popover interception**: When date picker, teacher search, or customer search popovers are open, they capture Escape to close themselves first

## Solution

Consolidate all keyboard handling into a single `useEffect` with proper priority:

1. **Fullscreen exit first** (highest priority)
2. **Drag cancellation second**
3. **Selection clearing last** (lowest priority)

### Code Changes

**File:** `src/components/scheduler/SchedulerGrid.tsx`

Remove the second keyboard handler (lines 243-258) and merge its logic into the first handler (lines 173-187):

```typescript
// BEFORE: Two separate handlers
// Handler 1 (lines 173-187)
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && state.drag.isDragging) {
    cancelDrag();
  }
};

// Handler 2 (lines 243-258) - SEPARATE useEffect
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isFullscreen) setIsFullscreen(false);
      else clearSelection();
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [clearSelection, isFullscreen]);

// AFTER: Single consolidated handler
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    // Priority 1: Exit fullscreen (most important)
    if (isFullscreen) {
      e.stopPropagation();
      setIsFullscreen(false);
      return;
    }
    // Priority 2: Cancel drag
    if (state.drag.isDragging) {
      cancelDrag();
      return;
    }
    // Priority 3: Clear selection
    clearSelection();
    setHighlightedInstructorId(null);
  }
};
```

### Updated useEffect Dependencies

```typescript
useEffect(() => {
  // ... mouse handlers unchanged ...

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isFullscreen) {
        e.stopPropagation();
        setIsFullscreen(false);
        return;
      }
      if (state.drag.isDragging) {
        cancelDrag();
        return;
      }
      clearSelection();
      setHighlightedInstructorId(null);
    }
  };

  window.addEventListener("keydown", handleGlobalKeyDown);
  return () => window.removeEventListener("keydown", handleGlobalKeyDown);
}, [
  state.drag.isDragging,
  state.drag.instructorId,
  state.drag.date,
  bookings,
  absences,
  endDrag,
  cancelDrag,
  updateDrag,
  checkSlotConflict,
  isFullscreen,        // Added
  clearSelection,      // Added
  setHighlightedInstructorId // Added (via setter, stable reference)
]);
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/scheduler/SchedulerGrid.tsx` | Consolidate two keyboard handlers into one with proper priority order |

## Technical Notes

- `e.stopPropagation()` prevents popovers from also reacting to Escape when exiting fullscreen
- The consolidated handler ensures `isFullscreen` is always read from the current closure
- Single event listener reduces potential race conditions
