
# Fix: Make Open Bookings Scrollable in Dashboard

## Summary

Enable scrolling within the Open Bookings box to show more items directly in the dashboard view, using the ScrollArea component for a polished experience.

---

## Current Behavior

| Issue | Cause |
|-------|-------|
| Only 3 bookings shown | `slice(0, 3)` limits display |
| No scrolling | No max-height constraint on content |
| Must click "Alle anzeigen" to see more | Design decision, but user wants inline scrolling |

---

## Solution

1. Remove the 3-item limit to show more bookings
2. Add a ScrollArea with max-height for scrolling
3. Keep "Alle anzeigen" button for navigating to full list

---

## Changes

### File: `src/components/dashboard/OpenBookingsBox.tsx`

1. **Import ScrollArea** component
2. **Remove slice limit** - Show all fetched bookings (up to 20 from query)
3. **Wrap content in ScrollArea** with max-height

```typescript
import { ScrollArea } from "@/components/ui/scroll-area";

// In the return statement:
<DashboardTaskCard
  title="Offene Buchungen"
  count={count}
  isEmpty={count === 0}
  emptyMessage="Keine offenen Buchungen"
>
  <ScrollArea className="h-[200px]">
    <div className="space-y-2 pr-2">
      {openBookings?.map((booking) => (  // Remove slice(0, 3)
        // ... booking items
      ))}
    </div>
  </ScrollArea>
  
  {count > 0 && (
    <Button
      variant="ghost"
      size="sm"
      className="w-full h-7 text-xs mt-2"
      onClick={() => navigate("/bookings?status=open")}
    >
      Alle in Buchungsliste anzeigen
      <ChevronRight className="h-3 w-3 ml-1" />
    </Button>
  )}
</DashboardTaskCard>
```

---

## Expected Result

| Before | After |
|--------|-------|
| Shows max 3 bookings | Shows up to 20 with scrolling |
| No scroll capability | Smooth scrollable list |
| "Alle X anzeigen" only way to see more | Inline scrolling + link to full list |

---

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/dashboard/OpenBookingsBox.tsx` |
