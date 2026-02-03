
# Fix Discipline Label for Office-Only Staff

## Problem

Victoria Müller shows "Ski" as her discipline even though she only has the `office` role and no teaching specialization. This happens because:
1. Her `roles` array is `['office']` - no teaching roles
2. Her `specialization` is `null`
3. The `getSpecializationLabel()` function defaults to "Ski" for null/unknown values

## Solution

Update the display logic to be **roles-aware**. When someone has only the `office` role (no `ski` or `snowboard`), display "Büro" instead of a teaching discipline.

## Technical Changes

### File 1: `src/hooks/useInstructors.ts`

Update `getSpecializationLabel` to accept optional `roles` parameter:

```typescript
export function getSpecializationLabel(spec: string | null, roles?: string[] | null): string {
  // If roles provided and only has 'office' role, show "Büro"
  if (roles && roles.length > 0) {
    const hasTeachingRole = roles.includes('ski') || roles.includes('snowboard');
    if (!hasTeachingRole) {
      return "Büro";
    }
  }
  
  switch (spec) {
    case "ski":
      return "Ski";
    case "snowboard":
      return "Snowboard";
    case "both":
      return "Ski & Snowboard";
    default:
      // If no roles info, default to empty or derive from spec
      return spec ? spec : "Ski";
  }
}
```

### File 2: `src/pages/InstructorDetail.tsx`

Update line 133 to pass `roles`:

```typescript
<p className="text-muted-foreground">
  {getLevelLabel(instructor.level)} · {getSpecializationLabel(instructor.specialization, instructor.roles)}
</p>
```

### File 3: `src/components/instructors/InstructorCard.tsx`

Update line 56 to pass `roles`:

```typescript
<span>{getSpecializationLabel(instructor.specialization, instructor.roles)}</span>
```

### File 4: `src/pages/InstructorProfile.tsx`

Update line 265 to pass `roles`:

```typescript
{getSpecializationLabel(instructor.specialization, instructor.roles)}
```

### File 5: `src/components/bookings/wizard/InstructorSelection.tsx`

Update line 176 to pass `roles`:

```typescript
{getSpecializationLabel(instructor.specialization, instructor.roles)}
```

## Expected Result

After fix:
- Victoria Müller shows: `- · Büro` (or just "Büro" if no level)
- Teaching staff with ski role shows: `Skilehrer · Ski`
- Staff with both teaching and office roles shows their teaching discipline
- Staff with snowboard role shows: `Snowboardlehrer · Snowboard`

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useInstructors.ts` | Add roles parameter to `getSpecializationLabel` |
| `src/pages/InstructorDetail.tsx` | Pass `instructor.roles` to function |
| `src/components/instructors/InstructorCard.tsx` | Pass `instructor.roles` to function |
| `src/pages/InstructorProfile.tsx` | Pass `instructor.roles` to function |
| `src/components/bookings/wizard/InstructorSelection.tsx` | Pass `instructor.roles` to function |
