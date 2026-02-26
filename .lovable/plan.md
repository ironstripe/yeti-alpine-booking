
# Fix: Deselecting slots that span multiple hours

## Problem

When you drag-select a 2+ hour block (e.g., 09:00-11:00), it creates ONE multi-select entry with `startTime="09:00", endTime="11:00"`. When you then click a single cell (e.g., the 09:00 cell) to deselect it, the click generates `startTime="09:00", endTime="10:00"`. The toggle function in `BookingWizardContext.tsx` does an **exact match** on `startTime` AND `endTime` -- so it can't find the 2-hour slot, and instead of removing it, it tries to add a new 1-hour slot on top of it.

This is why deselection "works sometimes" (when you click a slot that was added as a single 1-hour cell) but fails on multi-hour drag selections.

## Solution

Change the toggle matching logic to use **overlap-based matching** instead of exact match. When clicking a cell, find any existing selection that **covers** that cell's hour, and remove it entirely.

### File: `src/contexts/BookingWizardContext.tsx`

**Change the `toggleMiniSchedulerSlot` function** (lines 857-886):

Instead of matching on exact `startTime + endTime`, find any selection where:
- Same `instructorId` and `date`
- The clicked hour falls within the selection's time range (i.e., `selectionStart <= clickedHour < selectionEnd`)

If found, remove the entire multi-hour block. If not found, add a new 1-hour slot as before.

### File: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`

No changes needed -- the existing `onMouseUp` handler already passes the correct single-cell time range to `onMultiSelectToggle`. The fix is entirely in the matching logic.

### Result

- Clicking any cell within a multi-hour selection removes the entire selection block
- Clicking an unselected cell adds a 1-hour slot (existing behavior)
- Single-hour selections continue to toggle normally
