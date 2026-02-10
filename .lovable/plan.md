

# Fix: Show Correct Per-Day Instructor Assignments in Capacity View

## Root Cause

The capacity view (`useGroupCapacityData.ts`, line 162-165) picks the **first instance** with an assigned instructor to display as the course's instructor for the whole week:

```typescript
const firstInstanceWithInstructor = course.group_course_instances?.find(
  (inst: any) => inst.instructor_id
);
const instructorId = firstInstanceWithInstructor?.instructor_id || null;
```

Since each day of the week can have a **different instructor** (assigned in Wochenplanung), this produces misleading results. The scheduler correctly shows Ivan for a specific day, but clicking through to the capacity view shows Gordon because Gordon happens to be on the first instance found.

## Solution

Replace the single `instructorName` display with a list of **all unique instructors** assigned across the week's instances. This gives an accurate overview without requiring a full per-day breakdown.

---

## Changes

### File 1: `src/hooks/useGroupCapacityData.ts`

**In the no-training-groups branch (line 155-215):**

- Instead of finding the first instance with an instructor, collect **all unique instructor IDs** from the week's instances
- Set `instructorId` to the most frequently assigned instructor (primary)
- Add a new field `allInstructorNames` (array of strings) with all unique instructor names for the week

**In the `GroupCapacityInfo` interface (line 15-37):**
- Add `allInstructorNames: string[]` field

**In the training-groups branch (~line 280-310):**
- Also populate `allInstructorNames` from the instances for that course

### File 2: `src/components/group-capacity/GroupCapacityCard.tsx`

**Line 50-55 -- Update instructor display:**

- Instead of showing a single `group.instructorName`, show all unique instructors:
  - If 1 instructor: show name as before
  - If 2+ instructors: show comma-separated names (e.g., "Ivan Wachter, Graeme Gordon")
  - If none: show "Kein Lehrer zugewiesen"

---

## Technical Details

The key change in the data hook:

```typescript
// Collect all unique instructor IDs from this week's instances
const weekInstructorIds = new Set<string>();
course.group_course_instances?.forEach((inst: any) => {
  if (inst.instructor_id) weekInstructorIds.add(inst.instructor_id);
});

// Pick most frequent as primary
const instructorFrequency: Record<string, number> = {};
course.group_course_instances?.forEach((inst: any) => {
  if (inst.instructor_id) {
    instructorFrequency[inst.instructor_id] = (instructorFrequency[inst.instructor_id] || 0) + 1;
  }
});
const primaryInstructorId = Object.entries(instructorFrequency)
  .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

// Build all instructor names
const allInstructorNames = Array.from(weekInstructorIds)
  .map(id => instructorMap.get(id))
  .filter(Boolean) as string[];
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useGroupCapacityData.ts` | Add `allInstructorNames` to interface; collect all unique instructors from instances |
| `src/components/group-capacity/GroupCapacityCard.tsx` | Display all instructor names instead of single name |

## Testing

- Assign different instructors to different days of the same course in Wochenplanung
- Open the Capacity tab -- verify both instructor names appear
- Click a group course block in the Scheduler -- verify the capacity card shows the correct instructor(s)
- Verify single-instructor courses still display correctly
