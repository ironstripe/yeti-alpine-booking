

# Enhance Scheduler Sorting for Group/Private Bookings

## Overview

Add sorting functionality to the scheduler that prioritizes instructors based on their booking types, and automatically moves instructors with group bookings to the top when the "Gruppen" filter is active.

## Changes

### 1. Add Sort State and UI in SchedulerHeader

**File:** `src/components/scheduler/SchedulerHeader.tsx`

Add a new sort dropdown with options:
- "Name A-Z" (default)
- "Gruppe" - Instructors with group bookings first
- "Privat" - Instructors with private bookings first

```tsx
// New prop
sortBy: string;
onSortChange: (sort: string) => void;

// New select in the right-aligned utilities section
<Select value={sortBy} onValueChange={onSortChange}>
  <SelectTrigger className="w-8 h-8 p-0 md:w-[100px] md:px-2">
    <ArrowUpDown className="h-3.5 w-3.5 md:mr-1" />
    <SelectValue placeholder="Sort" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="name">Name A-Z</SelectItem>
    <SelectItem value="group">Gruppe</SelectItem>
    <SelectItem value="private">Privat</SelectItem>
  </SelectContent>
</Select>
```

### 2. Implement Sorting Logic in SchedulerGrid

**File:** `src/components/scheduler/SchedulerGrid.tsx`

Add new state:
```tsx
const [sortBy, setSortBy] = useState<string>("name");
```

Enhance the `filteredInstructors` useMemo to:

1. **Auto-sort when "Gruppen" filter is active**: When `bookingTypeFilter === "group"`, automatically move instructors with group bookings to top
2. **Apply explicit sort options**: When `sortBy` is "group" or "private", sort accordingly

```tsx
const filteredInstructors = useMemo(() => {
  let filtered = instructors;
  
  // ... existing role filter and compact mode logic ...

  // Determine effective sort
  // Auto-sort by group when group filter is active, otherwise use explicit sortBy
  const effectiveSort = bookingTypeFilter === "group" ? "group" : 
                        bookingTypeFilter === "private" ? "private" : 
                        sortBy;

  // Sort by booking type
  if (effectiveSort === "group") {
    filtered = [...filtered].sort((a, b) => {
      const aHasGroup = bookings.some(bk => bk.instructorId === a.id && bk.type === "group");
      const bHasGroup = bookings.some(bk => bk.instructorId === b.id && bk.type === "group");
      if (aHasGroup && !bHasGroup) return -1;
      if (!aHasGroup && bHasGroup) return 1;
      // Secondary: count of group bookings
      const aGroupCount = bookings.filter(bk => bk.instructorId === a.id && bk.type === "group").length;
      const bGroupCount = bookings.filter(bk => bk.instructorId === b.id && bk.type === "group").length;
      return bGroupCount - aGroupCount;
    });
  } else if (effectiveSort === "private") {
    filtered = [...filtered].sort((a, b) => {
      const aHasPrivate = bookings.some(bk => bk.instructorId === a.id && bk.type === "private");
      const bHasPrivate = bookings.some(bk => bk.instructorId === b.id && bk.type === "private");
      if (aHasPrivate && !bHasPrivate) return -1;
      if (!aHasPrivate && bHasPrivate) return 1;
      const aPrivateCount = bookings.filter(bk => bk.instructorId === a.id && bk.type === "private").length;
      const bPrivateCount = bookings.filter(bk => bk.instructorId === b.id && bk.type === "private").length;
      return bPrivateCount - aPrivateCount;
    });
  }
  // "name" sort: keep default alphabetical order from DB query

  // Planning mode sort (takes precedence if active)
  if (isPlanningMode) {
    // ... existing planning mode sort logic ...
  }
  
  return filtered;
}, [instructors, bookings, absences, compactMode, roleFilter, isPlanningMode, bookingTypeFilter, sortBy]);
```

### 3. Pass Sort Props to Header

**File:** `src/components/scheduler/SchedulerGrid.tsx`

```tsx
<SchedulerHeader
  // ... existing props ...
  sortBy={sortBy}
  onSortChange={setSortBy}
/>
```

## Behavior Summary

| Filter Active | Sort Selection | Result |
|--------------|----------------|--------|
| "Alle" | "Name" | Default alphabetical |
| "Alle" | "Gruppe" | Group-assigned instructors first |
| "Alle" | "Privat" | Private-booked instructors first |
| "Gruppe" | Any | Auto-sorts group instructors to top |
| "Privat" | Any | Auto-sorts private-booked instructors to top |

## Files Modified

1. `src/components/scheduler/SchedulerHeader.tsx` - Add sort dropdown UI and props
2. `src/components/scheduler/SchedulerGrid.tsx` - Add sort state and sorting logic

