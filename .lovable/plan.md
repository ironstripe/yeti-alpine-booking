
# Fix Scheduler Date Range Adaptation

## Problem
When pressing the "Today" button (Target icon), the scheduler jumps to today's date but keeps the current view mode (e.g., weekly), showing 7 days instead of just today. Users expect pressing "Today" to show only that day.

## Root Cause
The `goToToday` function in `SchedulerHeader.tsx` only updates the date, not the view mode:

```typescript
const goToToday = () => onDateChange(new Date());
```

The view mode remains unchanged (default: `weekly`), so `getDaysForViewMode("weekly")` returns 7, and the grid renders 7 days.

## Solution
Modify the "Today" button to also switch to daily view mode, making the behavior intuitive.

---

## Technical Implementation

### File: `src/components/scheduler/SchedulerHeader.tsx`

**Change 1:** Update the `goToToday` function to also change the view mode

**Current code (line 79):**
```typescript
const goToToday = () => onDateChange(new Date());
```

**New code:**
```typescript
const goToToday = () => {
  onDateChange(new Date());
  onViewModeChange("daily");
};
```

This ensures that when users click "Today":
1. The date is set to today
2. The view mode switches to "daily" (1 day)

---

## Alternative Consideration

If users sometimes want to keep the current view mode when jumping to today, we could:
- **Option A (Recommended):** Always switch to daily view when pressing "Today" (clear expectation)
- **Option B:** Add a separate "Today" button that keeps the current view mode, and rename the current one to "Go to Today (Daily)"

The recommended approach (Option A) is simpler and matches user expectations based on the reported issue.

---

## Expected Behavior After Fix

| Action | Before | After |
|--------|--------|-------|
| Press "Today" while in Weekly view | Shows 7 days starting from today | Shows only today (1 day) |
| Press "Today" while in 3-Day view | Shows 3 days starting from today | Shows only today (1 day) |
| Press "Today" while in Daily view | Shows today | Shows today (no change) |

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/scheduler/SchedulerHeader.tsx` | Update `goToToday` to also call `onViewModeChange("daily")` |
