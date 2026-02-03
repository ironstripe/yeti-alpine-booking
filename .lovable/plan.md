
# Fix Multi-Role Staff Filtering in Scheduler

## Problem

Staff members with multiple roles (e.g., Heinert with `['ski', 'office']`) only appear in one filter category. Currently:
- `roleType` is derived as a single value: `instructor` if they have ANY teaching role, otherwise `office_staff`
- Filtering checks `i.roleType === roleFilter`
- Result: Heinert shows under "Skilehrer" but NOT under "Büropersonal"

## Solution

Change the filter logic to check the actual `roles` array instead of the derived single `roleType`:
- "Skilehrer" filter: Show if `roles` includes `ski` OR `snowboard`
- "Büropersonal" filter: Show if `roles` includes `office`

This allows staff with multiple roles to appear in all relevant filter categories.

## Technical Changes

### File 1: `src/components/scheduler/SchedulerGrid.tsx`

Update the role filtering logic (lines 216-219):

**Before:**
```typescript
if (roleFilter) {
  filtered = filtered.filter(i => i.roleType === roleFilter);
}
```

**After:**
```typescript
if (roleFilter) {
  filtered = filtered.filter(i => {
    const roles = i.roles || [];
    if (roleFilter === 'instructor') {
      return roles.includes('ski') || roles.includes('snowboard');
    }
    if (roleFilter === 'office_staff') {
      return roles.includes('office');
    }
    return true;
  });
}
```

### File 2: `src/hooks/useSchedulerData.ts` (Optional Cleanup)

The `roleType` derivation (lines 290-291) can remain for other purposes (like default sorting), but the filtering no longer depends on it.

## Expected Result

After this fix:
- **Heinert** (`roles: ['ski', 'office']`): Shows in BOTH "Skilehrer" AND "Büropersonal" filters
- **Victoria** (`roles: ['office']`): Shows only in "Büropersonal" filter
- **Pure instructors** (`roles: ['ski']`): Shows only in "Skilehrer" filter

## Files to Modify

| File | Change |
|------|--------|
| `src/components/scheduler/SchedulerGrid.tsx` | Update role filter logic to check `roles` array |
