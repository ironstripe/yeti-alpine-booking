

# Fix: Show Group Course Instances in Scheduler

## Problem

The scheduler fetches group courses from the **legacy `groups` table** which is empty. Meanwhile, the Wochenplanung system creates instructor assignments in the **`group_course_instances` table** which has all the correct data.

**Data mismatch:**
- `groups` table: Empty for Feb 9+
- `group_course_instances`: Has "Blue Prince/Princess", "Black Academy", etc. with instructors assigned

## Solution

Update `useSchedulerData.ts` to fetch from `group_course_instances` joined with `group_courses` instead of the legacy `groups` table.

## Implementation

### File: `src/hooks/useSchedulerData.ts`

**Replace the groups query (lines 117-131) with:**

```typescript
// Fetch group course instances for the date range
const groupInstancesQuery = useQuery({
  queryKey: ["scheduler-group-instances", startDateStr, endDateStr],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("group_course_instances")
      .select(`
        id,
        course_id,
        date,
        start_time,
        end_time,
        instructor_id,
        current_participants,
        status,
        group_courses!inner (
          name,
          color,
          max_participants,
          meeting_point
        )
      `)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .not("instructor_id", "is", null);

    if (error) throw error;
    return data;
  },
});
```

**Replace the group bookings transformation (lines 193-249) with:**

```typescript
// Add group course instances as bookings
const groupBookings: SchedulerBooking[] = (groupInstancesQuery.data || [])
  .filter((g) => !instructorId || g.instructor_id === instructorId)
  .map((g) => {
    const course = g.group_courses as unknown as {
      name: string;
      color: string;
      max_participants: number;
      meeting_point: string | null;
    };
    
    return {
      id: `group-instance-${g.id}`,
      instructorId: g.instructor_id!,
      date: g.date,
      timeStart: g.start_time,
      timeEnd: g.end_time,
      type: "group" as const,
      isPaid: true,
      ticketId: g.course_id,
      participantName: course.name,
      status: g.status || "scheduled",
      currentParticipants: g.current_participants || 0,
      maxParticipants: course.max_participants || undefined,
      meetingPoint: course.meeting_point || undefined,
    };
  });
```

**Update hasGroupCourse derivation (lines 152-155):**

```typescript
const hasGroupCourse = (groupInstancesQuery.data || []).some(
  (g) => g.instructor_id === instructor.id
);
```

**Update realtime subscription (lines 59-63):**

```typescript
// Realtime subscription for group course instances
useRealtimeSubscription<Tables<"group_course_instances">>({
  table: "group_course_instances",
  queryKey: ["scheduler-group-instances", startDateStr, endDateStr],
});
```

**Update loading/error states (lines 272-281):**

Replace `groupsQuery` references with `groupInstancesQuery`.

## Changes Summary

| Change | Description |
|--------|-------------|
| Query target | `group_course_instances` instead of `groups` |
| Data join | Join with `group_courses` for name, color, etc. |
| Booking ID | Use `group-instance-{id}` format |
| Time fields | Direct from instance (`start_time`, `end_time`) |
| Realtime | Subscribe to `group_course_instances` table |

## Technical Notes

- Each `group_course_instance` represents a single time slot (morning OR afternoon)
- No need to expand date ranges - instances are already per-day
- Color comes from the parent `group_courses` record
- Legacy `groups` table query can be removed entirely

