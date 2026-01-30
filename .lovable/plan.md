
# Fix: Open Bookings Not Showing in Dashboard

## Problem

The dashboard "Offene Buchungen" box shows 0 bookings while the database contains 10 unpaid tickets. The query lacks any automatic refresh mechanism, causing it to serve stale cached data indefinitely.

## Root Cause

| Issue | Details |
|-------|---------|
| No `refetchInterval` | Data never refreshes automatically |
| No `staleTime` | Cache treated as fresh indefinitely |
| No realtime subscription | Changes to tickets don't trigger refetch |
| Cached empty state | Previous empty result persists |

## Solution

Add refresh behavior to match other dashboard components:

```text
File: src/components/dashboard/OpenBookingsBox.tsx

Add to useQuery configuration:
- staleTime: 30000 (30 seconds - match useDashboardStats)
- refetchInterval: 60000 (60 seconds - keep data fresh)
- refetchOnWindowFocus: true (refresh when user returns)
```

## Code Change

```typescript
const { data: openBookings, isLoading } = useQuery({
  queryKey: ["open-bookings-dashboard"],
  queryFn: async (): Promise<OpenBooking[]> => {
    // ... existing query logic
  },
  staleTime: 30000,           // ADD: Consider fresh for 30 seconds
  refetchInterval: 60000,     // ADD: Refresh every 60 seconds
  refetchOnWindowFocus: true, // ADD: Refresh on tab focus
});
```

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/dashboard/OpenBookingsBox.tsx` |

## Expected Result

After implementation:
- Dashboard will show 10 open bookings immediately after refresh
- Data will auto-update every 60 seconds
- Returning to the tab will trigger a refresh
- Consistent behavior with other dashboard components
