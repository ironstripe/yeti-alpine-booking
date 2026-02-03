
# Fix: Show Group Courses in Capacity Page Even Without Enrollments

## Problem

The Capacity page shows "no groups created yet" because:
1. No `training_groups` records exist for the week
2. The fallback query filters out courses without enrollments (line 187: `filter(g => g.participantCount > 0)`)

The Wochenplanung creates `group_course_instances` with instructors, but the Capacity page doesn't consider these as "groups to display" unless there are enrolled participants.

## Solution

Update `useGroupCapacityData.ts` to show courses that have instances for the week, regardless of whether participants are enrolled. This aligns with the Wochenplanung behavior.

## Implementation

### File: `src/hooks/useGroupCapacityData.ts`

**Changes:**

1. **Remove the participant filter** (line 187) - show all courses with instances, not just those with enrollments

2. **Add instance-based instructor info** - If instances have instructors assigned (from Wochenplanung), use that info

3. **Update the fallback query** to also fetch instructor assignments from instances:

```typescript
// Lines 100-130 - Update the fallback query
const { data: courses, error: coursesError } = await supabase
  .from('group_courses')
  .select(`
    id,
    name,
    color,
    min_participants,
    max_participants,
    group_course_instances!inner (
      id,
      date,
      instructor_id,
      group_course_enrollments (
        id,
        participant_id,
        customer_participants (
          id,
          first_name,
          last_name,
          birth_date
        )
      )
    )
  `)
  .eq('course_type', 'weekly')
  .eq('is_active', true)
  .gte('group_course_instances.date', weekStartStr)
  .lte('group_course_instances.date', weekEndStr);
```

4. **Extract instructor from first instance** (if assigned):

```typescript
// In the transform section, get instructor from instances
const firstInstanceWithInstructor = course.group_course_instances?.find(
  inst => inst.instructor_id
);

return {
  // ... existing fields ...
  instructorId: firstInstanceWithInstructor?.instructor_id || null,
  instructorName: null, // Would need separate query to get name
  // ...
};
```

5. **Remove the participantCount > 0 filter** (line 187):

```typescript
// Change from:
}).filter(g => g.participantCount > 0);

// To:
}); // Show all courses with instances
```

## Changes Summary

| Change | Description |
|--------|-------------|
| Remove participant filter | Show courses with instances even if no enrollments |
| Fetch instructor_id from instances | Get instructor assignment from Wochenplanung |
| Update capacity status logic | Handle 0 participants as "underbooked" or "empty" state |

## Technical Notes

- This aligns the Capacity page with what Wochenplanung shows
- Empty groups (0 participants) will be shown as "ready to enroll"
- The instructor assigned in Wochenplanung will be reflected in capacity view
- Stats will update to count these empty groups appropriately
