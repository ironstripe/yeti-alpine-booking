
# YETI Scheduler Redesign - Phase 1 Implementation Plan

## Overview
This plan covers the scheduler redesign focusing on improved usability and visual clarity. The implementation follows a phased approach to ensure existing functionality remains intact.

---

## Phase 1: SchedulerHeader View Switcher Update

### Changes Required

**File: `src/components/scheduler/SchedulerHeader.tsx`**

Update the view mode toggle buttons (lines 150-176) to replace cryptic labels with descriptive text and icons:

```text
Current: "1T" | "3T" | "7T"
New:     "Tag" (Calendar icon) | "3 Tage" (CalendarRange icon) | "Woche" (CalendarDays icon)
```

**Implementation Details:**
- Import `Calendar`, `CalendarRange`, `CalendarDays` from lucide-react
- Replace button text with icon + descriptive label
- Adjust button sizing to accommodate longer text (`px-3` instead of `px-2`)

---

## Phase 2: Default View Change

**File: `src/components/scheduler/SchedulerGrid.tsx`**

Change the default view mode from "weekly" to "daily" (line 37):

```typescript
// Current
const [viewMode, setViewMode] = useState<ViewMode>("weekly");

// New
const [viewMode, setViewMode] = useState<ViewMode>("daily");
```

---

## Phase 3: New Color Scheme for Time Blocks

### Color Mapping

| Block Type | Current Color | New Color |
|------------|---------------|-----------|
| Group Course | Blue (`bg-blue-600`) | Blue (`bg-blue-600`) - *No change* |
| Private (Paid) | Green (`bg-emerald-500`) | Green (`bg-emerald-500`) - *No change* |
| Private (Unpaid) | Red (`bg-rose-500`) | **Orange** (`bg-orange-500`) |
| Absence/Not Available | Dark Gray (`bg-gray-700`) | **Light Gray** (`bg-gray-300`) |

### Files to Modify

**File: `src/lib/scheduler-utils.ts`** - Update `getBookingBarClasses`:

```typescript
export function getBookingBarClasses(type: "private" | "group", isPaid: boolean): string {
  if (type === "group") {
    return "bg-blue-600 text-white border-blue-700";
  }
  return isPaid 
    ? "bg-emerald-500 text-white border-emerald-600" 
    : "bg-orange-500 text-white border-orange-600"; // Changed from rose to orange
}
```

**File: `src/components/scheduler/BlockingBar.tsx`** - Update absence styling:

```typescript
// Change from:
isPending
  ? "bg-gray-600 text-gray-300 border-dashed border-amber-500/50"
  : "bg-gray-700 text-gray-200 border-gray-600"

// To:
isPending
  ? "bg-gray-200 text-gray-600 border-dashed border-amber-500"
  : "bg-gray-300 text-gray-700 border-gray-400"
```

**File: `src/components/scheduler/SchedulerGrid.tsx`** - Update legend colors:

- Change "Offen" legend from `bg-rose-500` to `bg-orange-500`
- Change "Abwesend" legend from `bg-gray-700` to `bg-gray-300`

---

## Phase 4: Instructor Row Simplification

### Changes Required

**Remove row background colors** - The colored indicator dot stays, but remove any row-based coloring based on instructor type.

**Add Availability Status Badge:**

| Status | Badge | Criteria |
|--------|-------|----------|
| Available | ● Green | No absences, has capacity |
| Limited | ○ Yellow | Partial day absence or heavily booked |
| Not Available | – Gray | Full-day absence |

**Filter Office Staff:**
Add role filter in `useSchedulerData.ts` to exclude `role === 'office'`:

```typescript
.select("*")
.eq("status", "active")
.not("role", "eq", "office") // Add this filter
```

**Files to Modify:**
- `src/components/scheduler/SingleDayInstructorRow.tsx`
- `src/components/scheduler/InstructorWeekBlock.tsx`
- `src/hooks/useSchedulerData.ts`

---

## Phase 5: Group Course Capacity Display

### Data Fetching Changes

**File: `src/hooks/useSchedulerData.ts`**

Add participant count query for group courses:

```typescript
// Extend group query to include participant count
const { data, error } = await supabase
  .from("groups")
  .select(`
    *,
    ticket_items!inner(count)
  `)
  .lte("start_date", endDateStr)
  .gte("end_date", startDateStr)
  .not("instructor_id", "is", null);

// Alternative: Use a separate count query
const countQuery = await supabase
  .from("ticket_items")
  .select("group_id, count", { count: "exact" })
  .in("group_id", groupIds)
  .neq("status", "cancelled");
```

**File: `src/lib/scheduler-utils.ts`**

Extend `SchedulerBooking` type:

```typescript
export interface SchedulerBooking {
  // ... existing fields
  currentParticipants?: number;
  maxParticipants?: number;
  meetingPoint?: string;
}
```

**File: `src/components/scheduler/BookingBar.tsx`**

Update tooltip to show capacity for group courses:

```tsx
{booking.type === "group" && (
  <>
    <p className="text-sm text-muted-foreground">
      Kapazität: ({booking.currentParticipants || 0}/{booking.maxParticipants || "?"})
    </p>
    {booking.meetingPoint && (
      <p className="text-sm text-muted-foreground">
        Treffpunkt: {booking.meetingPoint}
      </p>
    )}
  </>
)}
```

---

## Phase 6: Enhanced Drag & Drop Visual Feedback

### Valid/Invalid Drop Zone Indicators

**File: `src/components/scheduler/EmptySlot.tsx`**

Update styling for drag-over states:

```typescript
// Valid drop zone (empty slot)
isOver && !isBlocked && "border-2 border-green-500 bg-green-50"

// Invalid drop zone (occupied or absence)
isOver && isBlocked && "border-2 border-red-500 bg-red-50 cursor-not-allowed"
```

**File: `src/components/scheduler/DndKitProvider.tsx`**

Add drag overlay styling to indicate validity:

```typescript
// Update DragOverlay to show red indicator for invalid zones
{activeBooking && (
  <div className={cn(
    "rounded-md border px-2 py-1 text-xs font-medium shadow-lg",
    overSlot && !overSlot.isBlocked ? "bg-green-500 border-green-600" : "bg-gray-400 border-gray-500",
    "cursor-grabbing opacity-90"
  )}>
    ...
  </div>
)}
```

**File: `src/components/scheduler/SchedulerGrid.tsx`**

Add toast notification for invalid drops:

```typescript
const handleBookingDrop = (...) => {
  if (hasOverlap(...)) {
    toast.error("Dieser Zeitslot ist bereits belegt. Bitte wähle einen freien Slot.");
    return;
  }
  // ... existing logic
};
```

---

## Phase 7: Booking Edit Workflow Enhancement

### BookingDetailDialog Updates

**File: `src/components/scheduler/BookingDetailDialog.tsx`**

1. Ensure "Bearbeiten" button is prominently visible
2. Add conflict warning for instructor reassignment:

```typescript
const hasConflict = useMemo(() => {
  if (!instructorId || !date || !timeStart || !timeEnd) return false;
  return hasOverlap(instructorId, format(date, "yyyy-MM-dd"), timeStart, timeEnd, 
    bookings.filter(b => b.id !== ticketItemId));
}, [instructorId, date, timeStart, timeEnd, bookings, ticketItemId]);
```

3. Show confirmation dialog before saving if conflict exists:

```tsx
{hasConflict && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      Der Lehrer hat bereits eine Buchung zu dieser Zeit.
    </AlertDescription>
  </Alert>
)}
```

---

## Implementation Order

1. **Phase 1**: SchedulerHeader view switcher (quick win)
2. **Phase 2**: Default view to daily (simple change)
3. **Phase 3**: Color scheme update (visual impact)
4. **Phase 4**: Instructor row simplification
5. **Phase 5**: Group course capacity display
6. **Phase 6**: Drag & drop visual feedback
7. **Phase 7**: Booking edit workflow

---

## Files Summary

| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerHeader.tsx` | View switcher buttons with icons |
| `src/components/scheduler/SchedulerGrid.tsx` | Default view to "daily", legend colors |
| `src/lib/scheduler-utils.ts` | Color classes, SchedulerBooking type |
| `src/components/scheduler/BookingBar.tsx` | Tooltip with capacity display |
| `src/components/scheduler/BlockingBar.tsx` | Light gray color for absences |
| `src/components/scheduler/EmptySlot.tsx` | Green/red border feedback |
| `src/components/scheduler/DndKitProvider.tsx` | Drag overlay validity indicator |
| `src/components/scheduler/SingleDayInstructorRow.tsx` | Availability badge, remove row colors |
| `src/components/scheduler/InstructorWeekBlock.tsx` | Availability badge, remove row colors |
| `src/hooks/useSchedulerData.ts` | Filter office staff, fetch participant counts |
| `src/components/scheduler/BookingDetailDialog.tsx` | Conflict warnings |

---

## Technical Notes

- All changes maintain backward compatibility with existing data structures
- Drag & drop restricted to desktop (existing `PointerSensor` constraint)
- Group courses remain non-draggable (existing constraint)
- Realtime subscriptions unchanged
