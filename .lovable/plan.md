
# Fix: Open Bookings Filter from Dashboard Link

## Summary

The dashboard's "Alle anzeigen" button navigates to `/bookings?status=open`, but the Bookings page doesn't read URL parameters. The fix adds URL parameter parsing to initialize the payment status filter.

---

## Current Behavior

| Action | Result |
|--------|--------|
| Click "Alle anzeigen" in Open Bookings | Navigates to `/bookings?status=open` |
| Bookings page loads | Ignores `?status=open`, shows ALL bookings |

---

## Solution

Read URL parameters on Bookings page mount and initialize the `paymentStatus` filter accordingly.

### URL Parameter Mapping

| URL Param | Filter Applied |
|-----------|---------------|
| `?status=open` | `paymentStatus: ["open", "partial"]` (unpaid bookings) |
| `?status=paid` | `paymentStatus: ["paid"]` |
| No param | Default (no filter) |

---

## Changes

### File: `src/pages/Bookings.tsx`

1. **Import hooks** - Add `useSearchParams` from `react-router-dom`

2. **Read URL params** - Parse `status` parameter on mount

3. **Initialize filter state** - Set `paymentStatus` based on URL param

```typescript
import { useSearchParams } from "react-router-dom";

const Bookings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filters from URL params
  const initialFilters = useMemo(() => {
    const statusParam = searchParams.get("status");
    if (statusParam === "open") {
      return { ...defaultFilters, paymentStatus: ["open", "partial"] };
    }
    return defaultFilters;
  }, []);
  
  const [filters, setFilters] = useState<TicketFilters>(initialFilters);
  // ...
};
```

4. **Clear URL param when filters change** - Remove `?status=open` when user manually changes filters

---

## Expected Result

| Before | After |
|--------|-------|
| "Alle anzeigen" → Shows all 500+ bookings | "Alle anzeigen" → Shows only unpaid bookings |
| URL param ignored | URL param initializes payment filter |
| No visual filter indication | Filter chips show "Offen", "Teilbezahlt" selected |

---

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/pages/Bookings.tsx` |
