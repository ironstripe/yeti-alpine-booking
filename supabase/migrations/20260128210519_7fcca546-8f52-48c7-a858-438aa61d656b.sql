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
-- Step 2: Add foreign key constraint (if not exists - it was already added)
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