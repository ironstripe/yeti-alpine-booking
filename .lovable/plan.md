

# Fix: Database Constraint Error - skill_level_id NOT NULL

## Problem

The error is:
```
null value in column "skill_level_id" of relation "group_courses" violates not-null constraint
```

**Root cause**: The database migration only added the new columns (`next_training_id`, `sort_order`) but did NOT alter the `skill_level_id` column to be nullable or drop it. The database still has a NOT NULL constraint on `skill_level_id`, but the frontend code was updated to stop sending this field.

---

## Solution

Create a new migration to make the `skill_level_id` column nullable (or drop it entirely). Making it nullable is safer for backwards compatibility.

---

## Database Migration Required

```sql
-- Make skill_level_id nullable since trainings ARE the levels now
-- and we no longer require this mapping
ALTER TABLE group_courses 
  ALTER COLUMN skill_level_id DROP NOT NULL;
```

**Or** if we want to fully remove it (more aggressive but cleaner):

```sql
-- Drop the redundant skill_level_id column entirely
ALTER TABLE group_courses DROP COLUMN IF EXISTS skill_level_id;
```

---

## Recommended Approach

I recommend making the column **nullable** rather than dropping it immediately. This provides:
1. Backwards compatibility with any existing data
2. A safer migration path
3. Ability to clean up the column later after verifying everything works

---

## Files to Modify

| Change | Description |
|--------|-------------|
| New Migration | `ALTER TABLE group_courses ALTER COLUMN skill_level_id DROP NOT NULL` |

---

## Testing Checklist

After the fix:
1. Navigate to `/trainings`
2. Click "Neues Training" button
3. Fill in the form and submit
4. Verify the training is created successfully
5. Edit an existing training and save
6. Duplicate a training and save

