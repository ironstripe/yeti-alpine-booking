
# Fix Group Course Selection and Date Pre-filling in Booking Wizard

## Problems Identified

1. **Group course dropdown empty or not selecting courses** - The `ParticipantBookingCard` component's group course query works correctly, but the auto-select logic doesn't trigger because the calendar month doesn't navigate to show prefilled dates, making users think dates aren't selected.

2. **Dates not visually pre-filled in participant calendars** - When `initializeParticipantBookings()` runs, it copies `state.selectedDates` to each participant's `booking.dates`. However, the calendar's visible month (`selectedMonth`) starts at `new Date()` (today), which may be a different month than the prefilled dates. Users see an empty-looking calendar.

3. **No auto-navigation to prefilled date month** - `Step2ProductAllocation` has logic to auto-navigate the calendar to the month of prefilled dates (lines 266-278), but `ParticipantBookingCard` lacks this logic.

---

## Implementation Plan

### 1. Add Calendar Month Auto-Navigation to ParticipantBookingCard

**File:** `src/components/bookings/wizard/ParticipantBookingCard.tsx`

Add a `useEffect` that navigates the calendar to the first prefilled date's month:

```typescript
// Auto-navigate calendar to month of prefilled dates
useEffect(() => {
  if (booking.dates.length > 0) {
    const firstDate = parseISO(booking.dates[0]);
    const currentMonthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const dateMonthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    
    if (currentMonthStart.getTime() !== dateMonthStart.getTime()) {
      setSelectedMonth(firstDate);
    }
  }
}, [booking.dates]); // Only run when dates change
```

This ensures when a participant card is rendered with prefilled dates, the calendar immediately shows the correct month.

### 2. Improve Group Course Query to Handle Edge Cases

**File:** `src/components/bookings/wizard/ParticipantBookingCard.tsx`

The current query works, but add better error handling and logging to diagnose issues:

```typescript
const { data: groupCourses = [], isLoading: coursesLoading } = useQuery({
  queryKey: ["group-courses-for-booking-card", booking.dates, age],
  queryFn: async () => {
    if (booking.dates.length === 0) return [];

    const { data: coursesData, error } = await supabase
      .from("group_courses")
      .select(`
        id,
        name,
        skill_level,
        max_participants,
        color,
        meeting_point,
        course_type,
        min_age,
        max_age
      `)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching group courses:", error);
      throw error;
    }
    
    if (!coursesData || coursesData.length === 0) {
      console.log("No active group courses found");
      return [];
    }
    
    // Filter by age if participant has birth date
    const filtered = coursesData.filter((course) => {
      if (age !== null && course.min_age != null && course.max_age != null) {
        return age >= course.min_age && age <= course.max_age;
      }
      return true; // Include courses without age restrictions
    });
    
    console.log(`Found ${filtered.length} age-appropriate courses for age ${age}`);
    
    // ... rest of enrollment counting logic
  },
  enabled: booking.dates.length > 0 && booking.productType === "group",
});
```

### 3. Show Loading State in Group Selector

**File:** `src/components/bookings/wizard/ParticipantBookingCard.tsx`

Add a loading indicator when courses are being fetched:

```typescript
{booking.productType === "group" && (
  <div className="space-y-2">
    <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
      <Users className="h-3 w-3" />
      Gruppe
    </Label>
    
    {coursesLoading ? (
      <div className="text-xs text-muted-foreground">Laden...</div>
    ) : groupCourses.length === 0 ? (
      <div className="text-xs text-amber-600">
        Keine passenden Gruppen für Alter {age} J. gefunden
      </div>
    ) : (
      <Select ... />
    )}
  </div>
)}
```

### 4. Add Key to Include Age in Query Cache

**File:** `src/components/bookings/wizard/ParticipantBookingCard.tsx`

Include participant age in the query key to ensure proper caching per participant:

```typescript
queryKey: ["group-courses-for-booking-card", booking.dates, age],
```

This is already partially done but should be verified.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Add useEffect for calendar month auto-navigation; Add loading state for group selector; Improve empty state messaging |

---

## Expected Outcome

After these changes:

1. **Calendar shows correct month** - When participant cards are initialized with prefilled dates, each calendar will immediately navigate to show those dates visually.

2. **Group courses load and auto-select** - The dropdown will show available courses filtered by participant age, with the recommended course auto-selected based on skill level.

3. **Clear feedback** - Users will see loading states and informative messages when no suitable courses are found (e.g., adult trying to book group course).

---

## Technical Notes

- The `initializeParticipantBookings` function already correctly copies `state.selectedDates` to each participant
- The group course auto-select logic in the existing `useEffect` (lines 174-182) works correctly once courses are loaded
- The age-based filtering is already implemented but may exclude all courses if the participant's age doesn't match any course's age range
