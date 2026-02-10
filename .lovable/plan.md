
# Fix: Merge Groups Instructor Assignment Bug

## Problem

When merging two groups that each have a different instructor, the merged group sometimes shows a third (wrong) instructor. The root cause is in the database function `merge_training_groups`:

```sql
instructor_id = COALESCE(p_instructor_id, instructor_id),
assistant_instructor_id = COALESCE(p_assistant_instructor_id, assistant_instructor_id),
```

`COALESCE` means: "if the parameter is NULL, keep the old value." But the dialog sends `undefined` (which becomes NULL) when the user picks "Kein Lehrer" or doesn't change the selection. So the old instructor on the target group is never overwritten -- it sticks around even when the user chose a different one or none at all.

Additionally, the dialog sends `instructorId || undefined` which converts empty string to undefined/NULL, triggering the COALESCE fallback.

## Solution

### 1. Fix the database function (SQL migration)

Replace `COALESCE` logic with always-set logic. The function should **always** update `instructor_id` and `assistant_instructor_id` on the target group, even if the values are NULL (which means "no instructor"):

```sql
UPDATE training_groups
SET 
  custom_name = COALESCE(p_new_group_name, custom_name),
  instructor_id = p_instructor_id,
  assistant_instructor_id = p_assistant_instructor_id,
  updated_at = NOW()
WHERE id = p_target_group_id;
```

Remove the `IF` guard so the update always runs (ensuring instructor fields are set to exactly what the user chose).

### 2. Fix the dialog's merge call

In `MergeGroupsDialog.tsx` (line 127-133), send explicit values instead of converting empty strings to undefined:

- `instructorId: instructorId || null` -- send null explicitly when no instructor selected
- `assistantInstructorId: assistantId || null` -- same for assistant

### 3. Update the hook to pass null instead of undefined

In `useGroupCapacityData.ts`, the `useMergeGroups` mutation should pass `null` instead of `undefined` for unset instructor fields so the RPC receives actual NULL values that get written to the database.

## Changes

| File | Change |
|------|--------|
| New SQL migration | Rewrite `merge_training_groups` to always set instructor fields (no COALESCE) |
| `src/components/group-capacity/MergeGroupsDialog.tsx` | Send `null` instead of `undefined` for empty instructor selections |
| `src/hooks/useGroupCapacityData.ts` | Pass `null` instead of `undefined` in `useMergeGroups` mutation params |

## Technical Details

The updated SQL function:

```sql
CREATE OR REPLACE FUNCTION merge_training_groups(...)
BEGIN
  -- Always update target group with the user's chosen values
  UPDATE training_groups
  SET 
    custom_name = COALESCE(p_new_group_name, custom_name),
    instructor_id = p_instructor_id,
    assistant_instructor_id = p_assistant_instructor_id,
    updated_at = NOW()
  WHERE id = p_target_group_id;

  -- Move participants from non-target source groups...
  -- Mark source groups as merged...
END;
```

The key difference: `instructor_id = p_instructor_id` (direct assignment) vs `instructor_id = COALESCE(p_instructor_id, instructor_id)` (fallback to old value). This ensures the merged group always has exactly the instructor the user selected in the dialog.
