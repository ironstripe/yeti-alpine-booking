
# Enable Navigation from Group Course Blocks to Training Details

## Problem

Currently, clicking a group course block in the scheduler opens the `BookingDetailDialog`, which is designed for private bookings and doesn't work correctly for group courses (it tries to fetch from `ticket_items` with an invalid ID like `group-instance-xyz`).

## Solution

Modify `BookingBar.tsx` to:
1. **Group courses**: Navigate directly to the Training Capacity page with the course filter
2. **Private bookings**: Keep the existing dialog behavior

## Implementation

### File: `src/components/scheduler/BookingBar.tsx`

**Changes:**
1. Import `useNavigate` from react-router-dom
2. Update `handleClick` to navigate for group courses instead of opening dialog

```typescript
import { useNavigate } from "react-router-dom";

export function BookingBar({ booking, slotWidth, instructorSpecialization, isPlanningMode = false }: BookingBarProps) {
  const navigate = useNavigate();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isPrivate = booking.type === "private";
  const isGroup = booking.type === "group";
  
  // ... existing code ...

  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging) {
      e.stopPropagation();
      
      if (isGroup) {
        // Navigate to Training Capacity page with course filter
        // booking.ticketId contains the course_id for group instances
        navigate(`/trainings/capacity?course=${booking.ticketId}`);
      } else if (isPrivate) {
        // Open detail dialog for private bookings
        setIsDetailOpen(true);
      }
      // Office shifts: no action for now
    }
  };
  
  // ... rest of component ...
  
  // Only render dialog for private bookings
  {isPrivate && (
    <BookingDetailDialog
      open={isDetailOpen}
      onOpenChange={setIsDetailOpen}
      ticketItemId={booking.id}
    />
  )}
```

**Update tooltip hint:**
```typescript
<p className="text-xs text-muted-foreground italic mt-1">
  {isPrivate 
    ? "Ziehen zum Verschieben, klicken für Details" 
    : isGroup 
      ? "Klicken für Kursdetails" 
      : "Klicken für Details"}
</p>
```

## Changes Summary

| Change | Description |
|--------|-------------|
| Add navigation hook | Import and use `useNavigate` |
| Conditional click handler | Navigate to `/trainings/capacity?course={id}` for groups |
| Conditional dialog render | Only render `BookingDetailDialog` for private bookings |
| Updated tooltip | Show "Klicken für Kursdetails" for group courses |

## Technical Notes

- `booking.ticketId` for group instances contains the `course_id` (training ID)
- The capacity page already supports a `course` query parameter for filtering
- Private bookings continue to use `booking.id` (ticket_item ID) for the dialog
- Office shifts currently have no click action (can be extended later)
