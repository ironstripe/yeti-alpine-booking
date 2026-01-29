

# Backend Function for Managing Instructor Capabilities

## Overview

Create a new database RPC function `set_instructor_capabilities` that allows admin/office staff to manage the many-to-many relationship between instructors and their teaching capabilities.

## Current State

| Component | Status |
|-----------|--------|
| `instructor_capabilities` table | Exists (created in previous migration) |
| `capabilities` table | Exists with 25 entries |
| `is_admin_or_office()` function | Exists for authorization checks |
| `set_instructor_capabilities` function | Does not exist |

---

## Function Specification

### Signature

| Property | Value |
|----------|-------|
| Name | `set_instructor_capabilities` |
| Parameters | `p_instructor_id UUID`, `p_capability_ids UUID[]` |
| Returns | `void` |
| Language | `plpgsql` |
| Security | `SECURITY DEFINER` |

### Logic Flow

```text
1. Authorization Check
   └── Verify auth.uid() has admin or office role
   └── If not → RAISE EXCEPTION

2. Delete Existing Capabilities
   └── DELETE FROM instructor_capabilities WHERE instructor_id = p_instructor_id

3. Insert New Capabilities
   └── If p_capability_ids is not null/empty:
       └── FOREACH capability_id IN ARRAY:
           └── INSERT INTO instructor_capabilities
```

---

## Implementation Details

### Migration SQL

```sql
CREATE OR REPLACE FUNCTION public.set_instructor_capabilities(
  p_instructor_id UUID,
  p_capability_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capability_id UUID;
BEGIN
  -- 1. Authorization Check
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: You must be admin or office staff to set instructor capabilities.';
  END IF;

  -- 2. Delete Existing Capabilities
  DELETE FROM public.instructor_capabilities
  WHERE instructor_id = p_instructor_id;

  -- 3. Insert New Capabilities (if any provided)
  IF p_capability_ids IS NOT NULL AND array_length(p_capability_ids, 1) > 0 THEN
    FOREACH v_capability_id IN ARRAY p_capability_ids LOOP
      INSERT INTO public.instructor_capabilities (instructor_id, capability_id)
      VALUES (p_instructor_id, v_capability_id);
    END LOOP;
  END IF;
END;
$$;
```

### Why This Approach

- **Delete-then-insert** is simpler and more reliable than complex upserts for many-to-many relationships
- **Idempotent** - calling with the same array produces the same result
- **Empty array or NULL** clears all capabilities (intended behavior)
- **SECURITY DEFINER** allows the function to modify tables even if user doesn't have direct write access

---

## File Changes

| File | Action |
|------|--------|
| `supabase/migrations/[timestamp]_set_instructor_capabilities.sql` | Create new migration |

---

## Usage from Frontend

```typescript
// Example: Set capabilities for an instructor
const { error } = await supabase.rpc('set_instructor_capabilities', {
  p_instructor_id: instructorId,
  p_capability_ids: ['uuid1', 'uuid2', 'uuid3']
});

// Clear all capabilities
const { error } = await supabase.rpc('set_instructor_capabilities', {
  p_instructor_id: instructorId,
  p_capability_ids: []
});
```

---

## Testing Verification

After migration, verify:

| Test Case | Expected Result |
|-----------|-----------------|
| Admin calls with valid IDs | Capabilities updated successfully |
| Admin calls with empty array `[]` | All capabilities removed |
| Admin calls with `null` | All capabilities removed |
| Teacher role calls function | Exception: "Permission denied" |
| Unauthenticated call | Exception raised |
| Invalid instructor_id | No error, but no rows affected |
| Invalid capability_id | Foreign key constraint error |

---

## Type Updates

After migration, TypeScript types will auto-update to include:

```typescript
// In types.ts Functions section
set_instructor_capabilities: {
  Args: {
    p_instructor_id: string
    p_capability_ids: string[]
  }
  Returns: undefined
}
```

