
# Show All Instructors in Mini-Scheduler Grid

## Problem
The `MiniSchedulerGrid` currently limits the displayed instructors to 14 via `.slice(0, 14)` on line 504. Any additional instructors are hidden behind a "+N weitere Skilehrer" text note. This prevents users from selecting instructors beyond the top 14.

## Solution
Remove the `.slice(0, 14)` limit so all filtered/sorted instructors are rendered. The existing `ScrollArea` (with `h-[420px]`) already handles vertical scrolling, so all instructors will be accessible by scrolling. Also remove the "+N weitere" overflow message since it will no longer be needed.

## Changes

**File:** `src/components/bookings/wizard/MiniSchedulerGrid.tsx`

1. **Line 504** -- Remove `.slice(0, 14)` from the instructor map:
   - Before: `{sortedInstructors.slice(0, 14).map((instructor, idx) => {`
   - After: `{sortedInstructors.map((instructor, idx) => {`

2. **Lines 741-745** -- Remove the "+N weitere Skilehrer" overflow message entirely, since all instructors are now visible.

## Technical Details
- The `ScrollArea` component already has a fixed height of 420px, which provides smooth vertical scrolling when the instructor list exceeds the visible area.
- The 4-tier ranking algorithm still sorts the most relevant instructors to the top, so users see the best matches first.
- No changes needed to filtering, sorting, or selection logic -- only the rendering limit is removed.
