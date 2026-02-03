
# Fix Group Course Loading Performance

## Problem

The training planning view takes 6+ seconds to load because of:
1. Sequential database queries instead of parallel
2. Missing index for date-range queries
3. Expensive inline instructor JOINs on 400+ instances

## Solution

### 1. Add Database Index for Date Range Queries

```sql
CREATE INDEX idx_group_course_instances_date 
ON public.group_course_instances (date);
```

This allows efficient date-range filtering without requiring course_id.

### 2. Parallelize Queries in `useGroupCourses`

**File:** `src/hooks/useGroupCourses.ts`

Change sequential queries to parallel using `Promise.all()`:

```typescript
// BEFORE: Sequential (slow)
const { data: courses } = await supabase.from('group_courses')...
const { data: schedules } = await supabase.from('group_course_schedules')...
const { data: courseDates } = await supabase.from('training_course_dates')...
const { data: instances } = await supabase.from('group_course_instances')...

// AFTER: Parallel (fast)
const [coursesResult, schedulesResult, courseDatesResult, instancesResult] = 
  await Promise.all([
    supabase.from('group_courses')...,
    supabase.from('group_course_schedules')...,
    supabase.from('training_course_dates')...,
    supabase.from('group_course_instances')...
  ]);
```

### 3. Parallelize Queries in `useGroupPlanningData`

**File:** `src/hooks/useGroupPlanningData.ts`

Current flow:
1. Fetch courses → Wait
2. Extract course IDs
3. Fetch schedules → Wait
4. Fetch instances → Wait

Optimized flow:
1. Fetch courses + schedules + instances in parallel (filter instances by date only)
2. Then filter by course IDs client-side

```typescript
// Fetch all data in parallel - instances filtered by date only
const [coursesResult, schedulesResult, instancesResult] = await Promise.all([
  supabase.from('group_courses')
    .select('...')
    .eq('is_active', true)
    .eq('course_type', 'weekly'),
  supabase.from('group_course_schedules')
    .select('...')
    .eq('is_active', true),
  supabase.from('group_course_instances')
    .select('...')
    .gte('date', weekStartStr)
    .lte('date', weekEndStr)
]);

// Filter client-side
const courseIds = new Set(courses.map(c => c.id));
const relevantInstances = instances.filter(i => courseIds.has(i.course_id));
```

### 4. Separate Instructor Fetch (Optional Optimization)

If JOINs remain slow, fetch instructors separately and merge client-side:

```typescript
// Fetch instances without instructor JOINs
const { data: instances } = await supabase
  .from('group_course_instances')
  .select('id, course_id, date, start_time, end_time, instructor_id, assistant_instructor_id, current_participants')
  .gte('date', weekStartStr)
  .lte('date', weekEndStr);

// Fetch instructors in bulk
const instructorIds = [...new Set([
  ...instances.map(i => i.instructor_id),
  ...instances.map(i => i.assistant_instructor_id)
].filter(Boolean))];

const { data: instructors } = await supabase
  .from('instructors')
  .select('id, first_name, last_name')
  .in('id', instructorIds);

// Build lookup map and merge client-side
const instructorMap = new Map(instructors.map(i => [i.id, i]));
```

## Changes Summary

| File/Area | Change |
|-----------|--------|
| Database | Add `idx_group_course_instances_date` index |
| `useGroupCourses.ts` | Parallelize 4 queries with `Promise.all()` |
| `useGroupPlanningData.ts` | Parallelize 3 queries, fetch instances by date-range first |

## Expected Improvement

- **Before**: 6-10 seconds (sequential queries + slow JOINs)
- **After**: 1-2 seconds (parallel queries + indexed date filter)
