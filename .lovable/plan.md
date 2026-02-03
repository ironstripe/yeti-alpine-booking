
# Add Course Type Filter to Scheduler (Private vs Group)

## Problem

The scheduler currently lacks the ability to filter bookings by type. Users need to quickly see only private lessons or only group courses to focus on specific booking types.

## Solution

Add a new filter dropdown in the scheduler header to filter bookings by type: "Alle" (All), "Privat" (Private), or "Gruppe" (Group).

## Implementation

### File: `src/components/scheduler/SchedulerGrid.tsx`

**Changes:**

1. Add new state for booking type filter:
```typescript
const [bookingTypeFilter, setBookingTypeFilter] = useState<string | null>(null);
```

2. Filter bookings based on type before passing to child components:
```typescript
const filteredBookings = useMemo(() => {
  if (!bookingTypeFilter) return bookings;
  return bookings.filter(b => b.type === bookingTypeFilter);
}, [bookings, bookingTypeFilter]);
```

3. Pass new props to SchedulerHeader:
```typescript
bookingTypeFilter={bookingTypeFilter}
onBookingTypeFilterChange={setBookingTypeFilter}
```

4. Use `filteredBookings` instead of `bookings` in:
   - `InstructorFocusView` component
   - Compact mode filtering logic
   - Conflict checking (keep original `bookings` for this)

### File: `src/components/scheduler/SchedulerHeader.tsx`

**Changes:**

1. Add new props to interface:
```typescript
bookingTypeFilter: string | null;
onBookingTypeFilterChange: (filter: string | null) => void;
```

2. Add new Select dropdown next to existing filters:
```tsx
{/* Booking Type Filter - NEW */}
<Select 
  value={bookingTypeFilter || "all"} 
  onValueChange={(v) => onBookingTypeFilterChange(v === "all" ? null : v)}
>
  <SelectTrigger className="w-8 h-8 p-0 md:w-[100px] md:px-2 [&>span]:hidden md:[&>span]:inline">
    <CalendarCheck className="h-3.5 w-3.5 md:mr-1" />
    <SelectValue placeholder="Typ" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Alle</SelectItem>
    <SelectItem value="private">Privat</SelectItem>
    <SelectItem value="group">Gruppe</SelectItem>
  </SelectContent>
</Select>
```

3. Add `CalendarCheck` icon import from lucide-react

## Changes Summary

| File | Change |
|------|--------|
| `SchedulerGrid.tsx` | Add `bookingTypeFilter` state, filter bookings, pass props |
| `SchedulerHeader.tsx` | Add props interface, add Select dropdown UI |

## Technical Notes

- Filter is applied after data fetch, keeping API calls unchanged
- Conflict checking continues to use all bookings (so you can see if a slot is truly available)
- Compact mode considers filtered bookings (instructors without visible bookings can be hidden)
- The filter persists during date/view changes (same as other filters)
