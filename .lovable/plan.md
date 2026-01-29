

# Fix: TrainingInstancesView Crashes Due to Empty Select.Item Value

## Problem

The app crashes with the error:
```
Error: A <Select.Item /> must have a value prop that is not an empty string.
```

This occurs in `TrainingInstancesView.tsx` on **line 230** in the `InstanceCard` component:

```tsx
<SelectItem value="">Nicht zugewiesen</SelectItem>
```

This is the same issue we just fixed in `TrainingFormModal.tsx`. Radix UI's Select component explicitly prohibits empty string values for items.

---

## Solution

Replace the empty string value with a placeholder string `"none"` and update the `onValueChange` handler to convert `"none"` back to `null`.

---

## File to Modify

| File | Change |
|------|--------|
| `src/components/trainings/TrainingInstancesView.tsx` | Change empty string value to `"none"` and handle conversion |

---

## Technical Details

### Lines 217-248 - InstanceCard instructor Select

**Current code (line 217-230):**
```tsx
<Select
  value={instance.instructor_id || ''}
  onValueChange={(value) => onAssignInstructor(instance.id, value || null)}
>
  <SelectTrigger className={!hasInstructor ? 'border-destructive' : ''}>
    <SelectValue placeholder="Lehrer zuweisen">
      ...
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">Nicht zugewiesen</SelectItem>  {/* BROKEN! */}
```

**Fixed code:**
```tsx
<Select
  value={instance.instructor_id || 'none'}
  onValueChange={(value) => onAssignInstructor(instance.id, value === 'none' ? null : value)}
>
  <SelectTrigger className={!hasInstructor ? 'border-destructive' : ''}>
    <SelectValue placeholder="Lehrer zuweisen">
      ...
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">Nicht zugewiesen</SelectItem>  {/* FIXED */}
```

---

## Testing Checklist

After the fix:
1. Navigate to `/trainings`
2. Click "Instanzen" on any training card
3. Verify the instances view loads without errors
4. Check the instructor dropdown shows "Nicht zugewiesen" as an option
5. Select "Nicht zugewiesen" and verify it clears the instructor assignment
6. Assign an instructor and verify it saves correctly

