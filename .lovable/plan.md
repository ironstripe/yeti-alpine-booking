
# Add Navigation from Absence Blocks to Instructor Absence Details

## Problem

Currently, the absence/unavailability blocks (gray bars) in the scheduler are not interactive. Users need to be able to click on them to quickly navigate to the instructor's profile and view/manage their absences.

## Solution

Make the `BlockingBar` component clickable to navigate to the instructor's detail page with automatic focus on the absences section (expanded history).

## Implementation

### File: `src/components/scheduler/BlockingBar.tsx`

**Changes:**

1. Add `useNavigate` from react-router-dom
2. Add click handler to navigate to instructor detail with `absences=open` query param
3. Change cursor from `cursor-not-allowed` to `cursor-pointer`
4. Update tooltip to indicate clickability

```typescript
import { useNavigate } from "react-router-dom";

export function BlockingBar({ absence, slotWidth }: BlockingBarProps) {
  const navigate = useNavigate();
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to instructor detail with absences section open
    navigate(`/instructors/${absence.instructorId}?absences=open`);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          onClick={handleClick}
          className={cn(
            "absolute top-0.5 bottom-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            "flex items-center gap-0.5",
            "cursor-pointer hover:ring-2 hover:ring-gray-500", // Change from cursor-not-allowed
            // ... existing styles
          )}
          // ... rest of component
        >
```

### File: `src/components/instructors/detail/AbsenceRequestCard.tsx`

**Changes:**

1. Accept optional `defaultHistoryOpen` prop
2. Read URL query param `absences=open` to auto-expand history
3. Use `useSearchParams` to detect when to auto-open

```typescript
import { useSearchParams } from "react-router-dom";

export function AbsenceRequestCard({ instructorId, isTeacherView = false }: AbsenceRequestCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldOpenHistory = searchParams.get("absences") === "open";
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(shouldOpenHistory);
  
  // Clear the query param after opening
  useEffect(() => {
    if (shouldOpenHistory) {
      setIsHistoryOpen(true);
      // Remove the query param to clean up URL
      searchParams.delete("absences");
      setSearchParams(searchParams, { replace: true });
    }
  }, [shouldOpenHistory]);
```

### File: `src/components/scheduler/BlockingBar.tsx` - Updated Tooltip

```typescript
<TooltipContent side="top">
  <div className="space-y-1">
    {/* ... existing content ... */}
    <p className="text-xs text-muted-foreground italic mt-1">
      Klicken für Abwesenheitsdetails
    </p>
  </div>
</TooltipContent>
```

## Changes Summary

| File | Change |
|------|--------|
| `BlockingBar.tsx` | Add click handler, change cursor, add hover effect, update tooltip |
| `AbsenceRequestCard.tsx` | Read query param, auto-expand history section |

## Technical Notes

- Uses query param `?absences=open` for deep linking
- Query param is cleaned up after history expansion to keep URL clean
- Click propagation is stopped to prevent triggering slot click events
- Hover effect (ring) provides visual feedback that the block is clickable
- Consistent with BookingBar behavior pattern (click to see details)
