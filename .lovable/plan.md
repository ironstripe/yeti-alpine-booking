

# Refactor group_courses Skill Level to Foreign Key

## Overview

This migration refactors the `group_courses` table to replace the generic `skill_level` TEXT field (beginner/intermediate/advanced) with a proper foreign key reference to the `skill_levels` table via `skill_level_id`.

**Current State Analysis:**
- `group_courses.skill_level`: TEXT NOT NULL with values 'beginner', 'intermediate', 'advanced'
- `group_courses.skill_level_id`: TEXT nullable (already exists, but NOT as a foreign key)
- `skill_levels.id`: TEXT primary key (e.g., 'ski_blauer_prinz', 'sb_roter_koenig')
- All 10 existing group courses already have `skill_level_id` populated correctly

---

## Migration Strategy

Since the `skill_level_id` column already exists and is populated, this migration is simpler than creating a new column. The steps are:

1. **Add foreign key constraint** to `skill_level_id` → `skill_levels.id`
2. **Verify data integrity** (all existing skill_level_ids are valid)
3. **Make column NOT NULL** (enforce requirement)
4. **Drop old column** `skill_level` (redundant)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Database Migration | Create | SQL migration to add FK constraint and drop old column |
| `src/types/group-courses.ts` | Modify | Remove `skill_level` field, make `skill_level_id` required |
| `src/hooks/useGroupCourses.ts` | Modify | Remove references to `skill_level` |
| `src/lib/skill-levels.ts` | Modify | Remove `mapSkillLevelToGroupCourseSkill` function |
| `src/lib/level-utils.ts` | Modify | Remove import of mapping function |

---

## Database Migration

```sql
-- ====================================================================
-- Step 1: Verify all skill_level_id values are valid
-- This check ensures we won't create orphan foreign key references
-- ====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.group_courses gc
    WHERE gc.skill_level_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.skill_levels sl WHERE sl.id = gc.skill_level_id
      )
  ) THEN
    RAISE EXCEPTION 'Invalid skill_level_id found in group_courses. Cannot proceed.';
  END IF;
END;
$$;

-- ====================================================================
-- Step 2: Add foreign key constraint
-- Using ON DELETE RESTRICT to prevent accidental skill level deletion
-- ====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'group_courses_skill_level_id_fkey'
  ) THEN
    ALTER TABLE public.group_courses
    ADD CONSTRAINT group_courses_skill_level_id_fkey
      FOREIGN KEY (skill_level_id)
      REFERENCES public.skill_levels(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

-- ====================================================================
-- Step 3: Make skill_level_id NOT NULL
-- Ensures all courses must reference a valid skill level
-- ====================================================================
DO $$
BEGIN
  -- First check if any NULL values exist
  IF EXISTS (SELECT 1 FROM public.group_courses WHERE skill_level_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: some group_courses have NULL skill_level_id';
  END IF;
END;
$$;

ALTER TABLE public.group_courses
  ALTER COLUMN skill_level_id SET NOT NULL;

-- ====================================================================
-- Step 4: Drop the old skill_level text column (now redundant)
-- ====================================================================
ALTER TABLE public.group_courses
  DROP COLUMN IF EXISTS skill_level;

-- ====================================================================
-- Step 5: Create index for foreign key performance
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_group_courses_skill_level_id
  ON public.group_courses(skill_level_id);
```

---

## TypeScript Type Updates

### `src/types/group-courses.ts`

```typescript
// BEFORE
export interface GroupCourse {
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  skill_level_id: string | null;
  // ...
}

// AFTER
export interface GroupCourse {
  skill_level_id: string;  // Required FK to skill_levels.id
  // Remove skill_level entirely
  // ...
}
```

Also update:
- `GroupCourseFormData` interface
- Remove `SKILL_LEVELS` constant (beginner/intermediate/advanced)

---

## Hook Updates

### `src/hooks/useGroupCourses.ts`

**useCreateGroupCourse mutation:**
```typescript
// BEFORE
const insertData = {
  skill_level: formData.skill_level,
  skill_level_id: formData.skill_level_id,
  // ...
};

// AFTER
const insertData = {
  skill_level_id: formData.skill_level_id,  // Only this field
  // ...
};
```

Similar cleanup in `useUpdateGroupCourse`.

---

## Deprecated Code Removal

### `src/lib/skill-levels.ts`

Remove the `mapSkillLevelToGroupCourseSkill` function since the direct FK relationship eliminates the need for lossy category mapping:

```typescript
// REMOVE THIS FUNCTION
export function mapSkillLevelToGroupCourseSkill(levelId: string | null): string {
  if (!levelId) return 'beginner';
  // ...
}
```

### `src/lib/level-utils.ts`

Remove the import:
```typescript
// REMOVE
import { mapSkillLevelToGroupCourseSkill as newMapSkillLevel } from './skill-levels';
```

---

## Data Integrity Verification

Before and after migration checks:

```sql
-- BEFORE MIGRATION: Record current state
SELECT id, name, skill_level, skill_level_id, discipline 
FROM group_courses;

-- Verify all skill_level_ids exist in skill_levels
SELECT gc.id, gc.name, gc.skill_level_id
FROM group_courses gc
LEFT JOIN skill_levels sl ON sl.id = gc.skill_level_id
WHERE sl.id IS NULL;
-- Expected: 0 rows

-- AFTER MIGRATION: Verify constraints
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'group_courses'
  AND column_name = 'skill_level_id';
-- Expected: is_nullable = 'NO'

-- Verify FK exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'group_courses'
  AND constraint_type = 'FOREIGN KEY';
-- Expected: includes 'group_courses_skill_level_id_fkey'

-- Verify old column removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'group_courses'
  AND column_name = 'skill_level';
-- Expected: 0 rows
```

---

## Impact Analysis

### Frontend Forms
Any form that previously showed a dropdown for 'beginner', 'intermediate', 'advanced' now shows the actual skill levels from the `skill_levels` table, filtered by discipline.

### Course Matching Logic
Participant-to-course matching now uses direct ID comparison instead of category mapping:
```typescript
// BEFORE
const courseSkill = mapSkillLevelToGroupCourseSkill(participant.current_ski_level_id);
const matchingCourse = courses.find(c => c.skill_level === courseSkill);

// AFTER
const matchingCourse = courses.find(c => c.skill_level_id === participant.current_ski_level_id);
```

### Backwards Compatibility
Since this is a one-way migration with no rollback, ensure:
1. All UI code is updated before migration
2. No external systems depend on the `skill_level` column

---

## Testing Checklist

1. **Pre-Migration Verification**
   - Record row count: `SELECT COUNT(*) FROM group_courses`
   - Record sample data: `SELECT id, skill_level, skill_level_id FROM group_courses LIMIT 5`

2. **Post-Migration Verification**
   - Row count unchanged
   - `skill_level` column no longer exists
   - `skill_level_id` is NOT NULL
   - Foreign key constraint exists
   - All skill_level_id values reference valid skill_levels

3. **UI Testing**
   - Training/Course list loads correctly
   - Creating new course works with skill level selector
   - Editing existing course shows correct skill level
   - Course-participant matching works correctly

