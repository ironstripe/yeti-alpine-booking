
# Extend InstructorSchedule with "All Instructors" View

## Overview

This plan extends the existing `InstructorSchedule.tsx` page to support viewing all instructors' bookings. When in "Alle Lehrer" mode, instructors can see a color-coded weekly view of all bookings across the school, with privacy restrictions that hide sensitive customer information for other instructors' bookings.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/InstructorSchedule.tsx` | Modify | Add view mode toggle, color-coding, and instructor legend |

---

## Technical Implementation

### 1. Add View Mode State and Toggle UI

Add state to track current view mode and a Select dropdown at the top of the page:

```typescript
// New imports
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, Users } from "lucide-react";

// New state
const [viewMode, setViewMode] = useState<'my-bookings' | 'all-instructors'>('my-bookings');
const [legendOpen, setLegendOpen] = useState(false);
```

UI placement: Above the week navigation, full-width dropdown.

### 2. Fetch All Instructors

New query to fetch all instructors (for color mapping and legend):

```typescript
const { data: allInstructors } = useQuery({
  queryKey: ['all-instructors'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('instructors')
      .select('id, first_name, last_name')
      .eq('status', 'active')
      .order('first_name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },
  enabled: viewMode === 'all-instructors',
});
```

### 3. Color Palette for Instructors

Define a consistent color palette (10 distinct colors that cycle):

```typescript
const INSTRUCTOR_COLORS = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-black' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
];

const getInstructorColor = (instructorId: string) => {
  if (!allInstructors) return INSTRUCTOR_COLORS[0];
  const index = allInstructors.findIndex((i) => i.id === instructorId);
  return INSTRUCTOR_COLORS[index % INSTRUCTOR_COLORS.length];
};
```

### 4. Update Week Schedule Query

Modify the existing query to conditionally fetch all instructors' bookings:

```typescript
const { data: weekData, isLoading } = useQuery({
  queryKey: ["instructor-week-schedule", instructorId, weekOffset, viewMode],
  queryFn: async () => {
    if (!instructorId) return [];

    // Build base query with instructor join for "all instructors" mode
    let query = supabase
      .from("ticket_items")
      .select(`
        id,
        date,
        time_start,
        time_end,
        ticket_id,
        instructor_id,
        products (name, type),
        tickets (ticket_number),
        instructors (first_name, last_name)
      `)
      .gte("date", format(weekStart, "yyyy-MM-dd"))
      .lte("date", format(weekEnd, "yyyy-MM-dd"))
      .not("instructor_id", "is", null)
      .order("date", { ascending: true })
      .order("time_start", { ascending: true });

    // Filter by instructor only in "my-bookings" mode
    if (viewMode === 'my-bookings') {
      query = query.eq("instructor_id", instructorId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  enabled: !!instructorId,
});
```

### 5. Update Week Grid Slot Rendering

Modify `isSlotBooked` and slot rendering to show color-coded bookings:

```typescript
const getBookingsForSlot = (date: Date, hour: string) => {
  return (weekData || []).filter((booking: any) => {
    if (booking.date !== format(date, "yyyy-MM-dd") || !booking.time_start) return false;
    const startHour = parseInt(booking.time_start.split(":")[0]);
    const endHour = booking.time_end ? parseInt(booking.time_end.split(":")[0]) : startHour + 1;
    return parseInt(hour) >= startHour && parseInt(hour) < endHour;
  });
};

// In grid rendering, replace simple colored div with:
{weekDays.map((day) => {
  const absent = isDateAbsent(day);
  const slotBookings = getBookingsForSlot(day, hour);
  const hasBookings = slotBookings.length > 0;
  
  return (
    <div
      key={`${day.toISOString()}-${hour}`}
      className={cn(
        "h-8 rounded-sm relative",
        absent && "bg-destructive/20",
        !hasBookings && !absent && "bg-muted/30"
      )}
    >
      {hasBookings && !absent && (
        <div className="absolute inset-0 flex gap-0.5 p-0.5">
          {slotBookings.map((booking: any) => {
            const isOwn = booking.instructor_id === instructorId;
            const color = viewMode === 'all-instructors' && !isOwn
              ? getInstructorColor(booking.instructor_id)
              : { bg: 'bg-primary', text: 'text-primary-foreground' };
            
            return (
              <div
                key={booking.id}
                className={cn(
                  "flex-1 rounded-sm cursor-pointer transition-opacity hover:opacity-80",
                  color.bg
                )}
                onClick={() => handleBookingClick(booking)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
})}
```

### 6. Handle Booking Clicks with Privacy

Add click handler that respects privacy for other instructors' bookings:

```typescript
const handleBookingClick = (booking: any) => {
  const isOwn = booking.instructor_id === instructorId;
  
  if (viewMode === 'all-instructors' && !isOwn) {
    // Show limited info for other instructors' bookings
    toast.info(
      `${booking.instructors?.first_name} ${booking.instructors?.last_name}`,
      {
        description: `${booking.time_start?.slice(0, 5)} - ${booking.time_end?.slice(0, 5)} · ${booking.products?.type === 'private' ? 'Privat' : 'Gruppe'}`,
      }
    );
  } else {
    // For own bookings, could navigate to detail (if route exists)
    // For now, show full product info
    toast.info(booking.products?.name || 'Buchung', {
      description: `${booking.time_start?.slice(0, 5)} - ${booking.time_end?.slice(0, 5)}`,
    });
  }
};
```

### 7. Update List View

Modify the list view to support all-instructors mode:

```typescript
{bookings.map((booking: any) => {
  const isOwn = booking.instructor_id === instructorId;
  const color = viewMode === 'all-instructors' && !isOwn
    ? getInstructorColor(booking.instructor_id)
    : null;
  
  return (
    <div 
      key={booking.id}
      className={cn(
        "flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer",
        color ? `${color.bg} ${color.text}` : "bg-muted/50"
      )}
      onClick={() => handleBookingClick(booking)}
    >
      <div>
        <span className="font-medium">
          {booking.time_start?.slice(0, 5)} - {booking.time_end?.slice(0, 5)}
        </span>
        <span className={cn("ml-2", color?.text || "text-muted-foreground")}>
          {viewMode === 'all-instructors' && !isOwn
            ? `${booking.instructors?.first_name} ${booking.instructors?.last_name?.charAt(0)}.`
            : booking.products?.name || "Lektion"
          }
        </span>
      </div>
    </div>
  );
})}
```

### 8. Add Collapsible Instructor Legend

Add a legend at the bottom when in "all-instructors" mode:

```typescript
{viewMode === 'all-instructors' && allInstructors && allInstructors.length > 0 && (
  <Card className="mt-4">
    <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
      <CollapsibleTrigger asChild>
        <CardContent className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Legende</span>
              <Badge variant="secondary" className="text-xs">
                {allInstructors.length} Lehrer
              </Badge>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              legendOpen && "rotate-180"
            )} />
          </div>
        </CardContent>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {allInstructors.map((instructor, index) => {
            const color = INSTRUCTOR_COLORS[index % INSTRUCTOR_COLORS.length];
            const isCurrentUser = instructor.id === instructorId;
            return (
              <div 
                key={instructor.id} 
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded",
                  isCurrentUser && "bg-primary/5 ring-1 ring-primary/20"
                )}
              >
                <div className={cn("w-3 h-3 rounded-sm flex-shrink-0", color.bg)} />
                <span className={cn(
                  "text-xs truncate",
                  isCurrentUser && "font-medium"
                )}>
                  {instructor.first_name} {instructor.last_name}
                  {isCurrentUser && " (Du)"}
                </span>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  </Card>
)}
```

### 9. Update Week Stats

Show different stats based on view mode:

```typescript
{/* Week Stats */}
<Card className="mt-4">
  <CardContent className="p-4">
    <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
      {viewMode === 'my-bookings' ? 'DIESE WOCHE' : 'ALLE LEHRER DIESE WOCHE'}
    </p>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-2xl font-bold">
          {viewMode === 'my-bookings'
            ? (weekData || []).length
            : (weekData || []).filter((b: any) => b.instructor_id === instructorId).length
          }
        </p>
        <p className="text-sm text-muted-foreground">
          {viewMode === 'my-bookings' ? 'Lektionen' : 'Meine Lektionen'}
        </p>
      </div>
      {/* ... hours calculation for own bookings only ... */}
    </div>
  </CardContent>
</Card>
```

---

## UI Layout (Mobile-First)

```text
┌─────────────────────────────────┐
│ [View Mode Dropdown    ▼]       │  ← Full width select
├─────────────────────────────────┤
│ [◀] KW 05 · 27. Jan - 2. Feb [▶]│  ← Week navigation
├─────────────────────────────────┤
│ [Woche] [Liste]                 │  ← Existing tabs
├─────────────────────────────────┤
│ ┌───┬─────────────────────────┐ │
│ │   │ Mo Di Mi Do Fr Sa So    │ │
│ ├───┼─────────────────────────┤ │
│ │09 │ ██ ░░ ██ ░░ ░░ ░░ ░░    │ │  ← Color-coded blocks
│ │10 │ ██ ██ ██ ░░ ░░ ░░ ░░    │ │
│ │...│ ...                     │ │
│ └───┴─────────────────────────┘ │
│                                 │
│ [🟦 Gebucht] [⬜ Frei] [🟥 Abw] │  ← Base legend (my-bookings)
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 👥 Legende · 8 Lehrer    ▼  │ │  ← Collapsible (all-instructors)
│ │ ─────────────────────────── │ │
│ │ 🟦 Max Müller (Du)          │ │
│ │ 🟩 Anna Schmidt             │ │
│ │ 🟪 Peter Weber              │ │
│ │ 🟧 ...                      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [Diese Woche Stats]             │  ← Filtered to own bookings
└─────────────────────────────────┘
```

---

## Privacy Restrictions

When viewing other instructors' bookings, the following data is **hidden**:

| Data | Visible | Hidden |
|------|---------|--------|
| Instructor name | ✅ | - |
| Time slot | ✅ | - |
| Product type (Privat/Gruppe) | ✅ | - |
| Product name | - | ✅ |
| Customer name | - | ✅ |
| Customer contact | - | ✅ |
| Participant details | - | ✅ |
| Prices | - | ✅ |
| Internal notes | - | ✅ |
| Ticket number | - | ✅ |

This is enforced in the frontend by:
1. Only showing instructor initials on grid slots
2. Showing limited info in toast on click
3. Not navigating to detail pages for other instructors' bookings

---

## German Translations

| English | German |
|---------|--------|
| My Bookings | Meine Buchungen |
| All Instructors | Alle Lehrer |
| Legend | Legende |
| (You) | (Du) |
| Private | Privat |
| Group | Gruppe |
| instructors | Lehrer |
| This Week | Diese Woche |
| All Instructors This Week | Alle Lehrer diese Woche |
| My Lessons | Meine Lektionen |

---

## Data Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│ viewMode state: 'my-bookings' | 'all-instructors'               │
└─────────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐              ┌───────────────────┐
    │ my-bookings   │              │ all-instructors   │
    │               │              │                   │
    │ Query:        │              │ Query:            │
    │ • eq instructor_id           │ • No filter       │
    │ • No instructors join        │ • Join instructors│
    │                              │ • Fetch all instr.│
    └───────────────┘              └───────────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ weekData: ticket_items[]                                    │
    │   • Filtered by date range                                  │
    │   • With products, tickets, instructors                     │
    └─────────────────────────────────────────────────────────────┘
                            │
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Render Grid/List                                            │
    │   • If my-bookings: Primary color for all                   │
    │   • If all-instructors:                                     │
    │     - Own bookings: Primary color                           │
    │     - Other instructors: Color from palette                 │
    │   • Click handler respects privacy                          │
    └─────────────────────────────────────────────────────────────┘
```

---

## Performance Considerations

1. **Query Efficiency**: The all-instructors query fetches all bookings for the week, which could be larger. Indexes on `date` and `instructor_id` are already in place.

2. **Color Mapping**: Colors are determined by instructor index in the sorted list, ensuring consistency across renders.

3. **Lazy Loading**: The `allInstructors` query only runs when `viewMode === 'all-instructors'`.

4. **Cache Keys**: The query key includes `viewMode` to prevent stale data when switching modes.

---

## Existing Patterns Followed

1. **State Management**: Uses `useState` for view mode, consistent with existing `weekOffset` state
2. **Queries**: Follows TanStack Query patterns from existing hooks
3. **UI Components**: Uses shadcn/ui `Select`, `Collapsible`, `Card`, `Badge`
4. **German Labels**: Consistent with existing German UI throughout the portal
5. **Mobile-First**: All new UI elements are touch-friendly and responsive
6. **Toast Notifications**: Uses `sonner` toast for booking info display
