

# Backend RPC Functions for Group Course Planning

## Overview

This plan creates three PostgreSQL RPC functions to handle the weekly lifecycle of group courses: generating instances, assigning instructors, and copying assignments from the previous week. These functions will be callable from the frontend and provide atomic, secure operations for group course planning.

---

## Current State Analysis

**Existing Infrastructure:**
- `is_admin_or_office(uuid)`: Function that checks if user has admin or office role ✓
- `has_role(uuid, app_role)`: Function to check specific roles ✓
- `user_roles` table with `app_role` enum (admin, office, teacher) ✓
- `group_course_instances` table with unique constraint on `(course_id, date, start_time)` ✓
- Frontend already uses `useGenerateInstances` hook that performs instance generation client-side

**Why Move to RPC Functions:**
1. **Atomicity**: All operations complete or fail as a unit
2. **Security**: Authorization checked at database level
3. **Performance**: Single round-trip instead of multiple queries
4. **Consistency**: Business logic centralized in database

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Database Migration | Create | Add three RPC functions |
| `src/hooks/useGroupCourses.ts` | Modify | Use RPC calls instead of client-side logic |

---

## Database Migration: RPC Functions

### Function 1: `generate_group_course_instances_for_week`

Generates all instances for active group courses for a given week based on their schedules.

```sql
-- Function: generate_group_course_instances_for_week
--
-- Purpose: Creates group_course_instances records for all active courses
--          based on their schedules for a specific week.
--
-- Parameters:
--   p_week_start_date: The Monday of the target week (DATE)
--
-- Returns: JSONB with status, message, and instances_created count
--
-- Security: Only admin or office users can execute

CREATE OR REPLACE FUNCTION public.generate_group_course_instances_for_week(
  p_week_start_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_end_date DATE;
  v_instance_count INT := 0;
  v_schedule_record RECORD;
  v_instance_date DATE;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can generate instances.'
    );
  END IF;

  -- Calculate week boundaries (Monday to Sunday)
  v_week_end_date := p_week_start_date + 6;

  -- Loop through all active schedules for active group courses
  FOR v_schedule_record IN
    SELECT 
      s.id AS schedule_id,
      s.course_id,
      s.day_of_week,
      s.start_time,
      s.end_time
    FROM public.group_course_schedules s
    JOIN public.group_courses c ON s.course_id = c.id
    WHERE c.is_active = TRUE
      AND s.is_active = TRUE
      AND c.course_type = 'weekly'  -- Only generate for weekly courses
  LOOP
    -- Calculate the actual date: week_start (Monday=0) + day_of_week
    -- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
    -- Adjust calculation: if day_of_week=0 (Sunday), it's +6 from Monday
    IF v_schedule_record.day_of_week = 0 THEN
      v_instance_date := p_week_start_date + 6;
    ELSE
      v_instance_date := p_week_start_date + (v_schedule_record.day_of_week - 1);
    END IF;

    -- Insert the instance if it doesn't already exist
    INSERT INTO public.group_course_instances (
      course_id,
      schedule_id,
      date,
      start_time,
      end_time,
      instructor_id,
      assistant_instructor_id,
      status,
      current_participants,
      notes
    )
    VALUES (
      v_schedule_record.course_id,
      v_schedule_record.schedule_id,
      v_instance_date,
      v_schedule_record.start_time,
      v_schedule_record.end_time,
      NULL,
      NULL,
      'scheduled',
      0,
      NULL
    )
    ON CONFLICT (course_id, date, start_time) DO NOTHING;

    -- Check if a row was inserted
    IF FOUND THEN
      v_instance_count := v_instance_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Week generation complete.',
    'instances_created', v_instance_count,
    'week_start', p_week_start_date,
    'week_end', v_week_end_date
  );
END;
$$;
```

### Function 2: `assign_instructor_to_course_week`

Assigns a main instructor (and optionally an assistant) to all instances of a specific course for a given week.

```sql
-- Function: assign_instructor_to_course_week
--
-- Purpose: Assigns instructor(s) to all instances of a course for a week
--
-- Parameters:
--   p_course_id: The group course ID
--   p_week_start_date: The Monday of the target week
--   p_instructor_id: The main instructor to assign
--   p_assistant_instructor_id: Optional assistant instructor (NULL to keep/clear)
--
-- Returns: JSONB with status, message, and instances_updated count

CREATE OR REPLACE FUNCTION public.assign_instructor_to_course_week(
  p_course_id UUID,
  p_week_start_date DATE,
  p_instructor_id UUID,
  p_assistant_instructor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_end_date DATE;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can assign instructors.'
    );
  END IF;

  v_week_end_date := p_week_start_date + 6;

  -- Update all instances for the given course in the given week
  UPDATE public.group_course_instances
  SET 
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id
  WHERE course_id = p_course_id
    AND date >= p_week_start_date
    AND date <= v_week_end_date;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments updated.',
    'instances_updated', v_updated_count,
    'course_id', p_course_id,
    'instructor_id', p_instructor_id,
    'assistant_instructor_id', p_assistant_instructor_id
  );
END;
$$;
```

### Function 3: `copy_instructor_assignments_from_previous_week`

Copies all instructor assignments from the previous week to a target week. This is a major time-saver for weekly scheduling.

```sql
-- Function: copy_instructor_assignments_from_previous_week
--
-- Purpose: Copies instructor assignments from the previous week to target week
--          for all courses that had assignments
--
-- Parameters:
--   p_target_week_start_date: The Monday of the week to copy TO
--
-- Returns: JSONB with status, message, and courses_copied count

CREATE OR REPLACE FUNCTION public.copy_instructor_assignments_from_previous_week(
  p_target_week_start_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_week_start DATE;
  v_source_week_end DATE;
  v_target_week_end DATE;
  v_assignment_record RECORD;
  v_copied_count INT := 0;
  v_updated_count INT;
BEGIN
  -- Security: Only admin or office can run this
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Permission denied. Only admin or office staff can copy assignments.'
    );
  END IF;

  v_source_week_start := p_target_week_start_date - 7;
  v_source_week_end := v_source_week_start + 6;
  v_target_week_end := p_target_week_start_date + 6;

  -- Loop through distinct course assignments from the source week
  FOR v_assignment_record IN
    SELECT DISTINCT 
      course_id,
      instructor_id,
      assistant_instructor_id
    FROM public.group_course_instances
    WHERE date >= v_source_week_start
      AND date <= v_source_week_end
      AND instructor_id IS NOT NULL
  LOOP
    -- Apply the assignment to all instances of this course in target week
    UPDATE public.group_course_instances
    SET 
      instructor_id = v_assignment_record.instructor_id,
      assistant_instructor_id = v_assignment_record.assistant_instructor_id
    WHERE course_id = v_assignment_record.course_id
      AND date >= p_target_week_start_date
      AND date <= v_target_week_end;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count > 0 THEN
      v_copied_count := v_copied_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Instructor assignments copied from previous week.',
    'courses_copied', v_copied_count,
    'source_week', v_source_week_start,
    'target_week', p_target_week_start_date
  );
END;
$$;
```

---

## Frontend Hook Updates

### `src/hooks/useGroupCourses.ts`

Update the existing hooks to use the new RPC functions:

```typescript
// Generate instances using RPC
export function useGenerateInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart }: { weekStart: Date }) => {
      const { data, error } = await supabase
        .rpc('generate_group_course_instances_for_week', {
          p_week_start_date: format(weekStart, 'yyyy-MM-dd')
        });

      if (error) throw error;
      if (data?.status === 'error') throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success(`${data.instances_created} Instanzen generiert`);
    },
    onError: (error) => {
      console.error('Error generating instances:', error);
      toast.error('Fehler beim Generieren der Instanzen');
    },
  });
}

// Bulk assign instructor using RPC
export function useBulkAssignInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      courseId, 
      weekStart, 
      instructorId,
      assistantInstructorId
    }: { 
      courseId: string; 
      weekStart: Date;
      instructorId: string;
      assistantInstructorId?: string | null;
    }) => {
      const { data, error } = await supabase
        .rpc('assign_instructor_to_course_week', {
          p_course_id: courseId,
          p_week_start_date: format(weekStart, 'yyyy-MM-dd'),
          p_instructor_id: instructorId,
          p_assistant_instructor_id: assistantInstructorId || null
        });

      if (error) throw error;
      if (data?.status === 'error') throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success(`${data.instances_updated} Instanzen aktualisiert`);
    },
    onError: (error) => {
      console.error('Error bulk assigning instructor:', error);
      toast.error('Fehler beim Zuweisen des Lehrers');
    },
  });
}

// NEW: Copy assignments from previous week
export function useCopyPreviousWeekAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetWeekStart }: { targetWeekStart: Date }) => {
      const { data, error } = await supabase
        .rpc('copy_instructor_assignments_from_previous_week', {
          p_target_week_start_date: format(targetWeekStart, 'yyyy-MM-dd')
        });

      if (error) throw error;
      if (data?.status === 'error') throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success(`Zuweisungen von ${data.courses_copied} Kursen kopiert`);
    },
    onError: (error) => {
      console.error('Error copying assignments:', error);
      toast.error('Fehler beim Kopieren der Zuweisungen');
    },
  });
}
```

---

## Data Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Group Planning Workflow                          │
└────────────────────────────────────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 1. GENERATE      │    │ 2. ASSIGN        │    │ 3. COPY          │
│                  │    │                  │    │                  │
│ generate_group_  │    │ assign_instructor│    │ copy_instructor_ │
│ course_instances │    │ _to_course_week  │    │ assignments_...  │
│ _for_week        │    │                  │    │                  │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     group_course_instances                           │
│  ┌─────────┬───────────┬────────────┬────────────────────────────┐ │
│  │ course  │   date    │ instructor │ assistant                  │ │
│  ├─────────┼───────────┼────────────┼────────────────────────────┤ │
│  │ Blauer  │ 2025-02-03│ NULL       │ NULL       ← After Gen     │ │
│  │ Blauer  │ 2025-02-03│ Max M.     │ Anna S.    ← After Assign  │ │
│  │ Blauer  │ 2025-02-10│ Max M.     │ Anna S.    ← After Copy    │ │
│  └─────────┴───────────┴────────────┴────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

1. **SECURITY DEFINER**: Functions run with owner privileges but include explicit auth checks
2. **`is_admin_or_office` check**: All functions verify user role before proceeding
3. **`SET search_path = public`**: Prevents search path injection attacks
4. **Error responses**: Permission errors return structured JSONB, not SQL exceptions (to be user-friendly)

---

## German Translations for UI

| English | German |
|---------|--------|
| Generate Instances | Instanzen generieren |
| Assign Instructor | Lehrer zuweisen |
| Copy from Previous Week | Von Vorwoche kopieren |
| Permission denied | Zugriff verweigert |
| instances created | Instanzen erstellt |
| instances updated | Instanzen aktualisiert |
| courses copied | Kurse kopiert |

---

## Testing Checklist

1. **generate_group_course_instances_for_week**
   - Call with a future Monday → verify instances created
   - Call again → verify instances_created = 0 (idempotent)
   - Call as teacher → verify permission denied

2. **assign_instructor_to_course_week**
   - Call with course + instructor → verify all week's instances updated
   - Call with assistant → verify assistant_instructor_id set
   - Call as teacher → verify permission denied

3. **copy_instructor_assignments_from_previous_week**
   - Set up source week with assignments
   - Generate target week instances
   - Call copy function → verify assignments copied
   - Call as teacher → verify permission denied

4. **Edge Cases**
   - Empty week (no schedules) → graceful handling
   - Instructor deleted → FK violation handling
   - Overlapping calls → unique constraint prevents duplicates

