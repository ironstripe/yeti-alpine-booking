

# Fix Scheduler Role Filter for Office Staff

## Problem

The role filter in the scheduler doesn't work for office staff because:
1. The `role` column is always "instructor" for everyone
2. Office vs teaching staff is determined by the `roles` TEXT[] array (e.g., `['office']` vs `['ski', 'snowboard']`)
3. The filter logic checks `i.role === roleFilter` which never matches "office_staff"

## Solution

Derive the displayable role type from the `roles` array and fix the filter logic.

## Changes

### 1. File: `src/hooks/useSchedulerData.ts`

Add a derived role field based on the `roles` array:

```typescript
// Line ~164-182 - Update instructor mapping
.map((instructor) => {
  // Derive role type from roles array
  const hasTeachingRole = instructor.roles?.some(r => r === 'ski' || r === 'snowboard');
  const derivedRoleType = hasTeachingRole ? 'instructor' : 'office_staff';
  
  return {
    ...instructor,
    roleType: derivedRoleType,  // NEW: derived role for filtering
    color: deriveInstructorColor(instructor, hasGroupCourse),
    todayBookingsCount,
  };
});
```

Remove the ineffective `.not("role", "eq", "office")` filter (line 73) since we want to include office staff but filter them in the UI.

### 2. File: `src/lib/scheduler-utils.ts`

Update the `SchedulerInstructor` type:

```typescript
export type SchedulerInstructor = Tables<"instructors"> & {
  color: InstructorColor;
  todayBookingsCount: number;
  roleType: 'instructor' | 'office_staff';  // NEW
};
```

### 3. File: `src/components/scheduler/SchedulerGrid.tsx`

Update the filter logic to use the new `roleType` field:

```typescript
// Line ~215-217
if (roleFilter) {
  filtered = filtered.filter(i => i.roleType === roleFilter);  // Use roleType instead of role
}
```

## Summary

| File | Change |
|------|--------|
| `useSchedulerData.ts` | Add `roleType` derived from `roles` array, remove ineffective filter |
| `scheduler-utils.ts` | Add `roleType` to `SchedulerInstructor` type |
| `SchedulerGrid.tsx` | Update filter to use `roleType` instead of `role` |

## Result

- "Skilehrer" filter shows instructors with teaching roles (`ski`/`snowboard`)
- "Büropersonal" filter shows staff with only office role (`['office']`)
- "Alle" shows everyone

