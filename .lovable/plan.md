
# Fix: Exclude Dragged Booking from Drop Zone Occupancy Check

## Problem

When dragging a booking to move it to a new time slot, the system incorrectly considers the destination slot as "occupied" because the **booking being dragged** is still counted in the occupancy calculation.

**Example scenario:**
- Booking "Lukas Thot" with Graham is at 10:00-12:00
- User tries to drag this booking to 11:00 slot
- The 11:00 slot's `isOccupied` check sees the 10:00-12:00 booking overlapping with 11:00
- Result: Drop is rejected even though the slot would be free after the move

## Root Cause

In `EmptySlot.tsx` (lines 48-58), the occupancy check includes ALL bookings:

```typescript
const isOccupied = useMemo(() => {
  return bookings.some((b) => {
    if (b.instructorId !== instructorId || b.date !== date) return false;
    // BUG: Does not exclude the booking currently being dragged
    return slotMin < bookingEnd && slotEnd > bookingStart;
  });
}, [bookings, instructorId, date, timeSlot]);
```

## Solution

Share the active drag booking ID from `DndKitProvider` via React Context, then exclude it from the occupancy check in `EmptySlot`.

## Technical Changes

### 1. Create Context for Active Drag State

**New file:** `src/contexts/DndKitDragContext.tsx`

```typescript
import { createContext, useContext } from "react";

interface DndKitDragContextValue {
  activeDragBookingId: string | null;
}

export const DndKitDragContext = createContext<DndKitDragContextValue>({
  activeDragBookingId: null,
});

export const useDndKitDrag = () => useContext(DndKitDragContext);
```

### 2. Update DndKitProvider to Expose Active Booking ID

**File:** `src/components/scheduler/DndKitProvider.tsx`

- Import the new context
- Wrap children with context provider
- Pass `activeBooking?.id` as context value

### 3. Update EmptySlot to Exclude Dragged Booking

**File:** `src/components/scheduler/EmptySlot.tsx`

- Import `useDndKitDrag` hook
- Modify `isOccupied` calculation to skip the active drag booking:

```typescript
const { activeDragBookingId } = useDndKitDrag();

const isOccupied = useMemo(() => {
  const slotMin = timeToMinutes(timeSlot);
  const slotEnd = slotMin + 60;
  
  return bookings.some((b) => {
    // Skip the booking currently being dragged
    if (b.id === activeDragBookingId) return false;
    
    if (b.instructorId !== instructorId || b.date !== date) return false;
    const bookingStart = timeToMinutes(b.timeStart);
    const bookingEnd = timeToMinutes(b.timeEnd);
    return slotMin < bookingEnd && slotEnd > bookingStart;
  });
}, [bookings, instructorId, date, timeSlot, activeDragBookingId]);
```

## Files Summary

| File | Action |
|------|--------|
| `src/contexts/DndKitDragContext.tsx` | Create |
| `src/components/scheduler/DndKitProvider.tsx` | Edit |
| `src/components/scheduler/EmptySlot.tsx` | Edit |

## Expected Result

After this fix:
- Dragging a booking will allow dropping on any slot not occupied by OTHER bookings
- The booking's original position will not block valid drop targets
- Slots occupied by different bookings will still correctly show as blocked
