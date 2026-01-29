

# Fix: TrainingFormModal Crashes Due to Empty Select.Item Value

## Problem

The app crashes with the error:
```
Error: A <Select.Item /> must have a value prop that is not an empty string.
```

This occurs in `TrainingFormModal.tsx` on **line 508**, where a `SelectItem` component uses an empty string as its value:

```tsx
<SelectItem value="">Kein Level</SelectItem>
```

Radix UI's Select component explicitly prohibits empty string values for items because the empty string is reserved for "clearing the selection" (showing the placeholder).

---

## Solution

Replace the empty string value with a placeholder string like `"none"` and update the `onValueChange` handler to convert `"none"` back to `null`.

---

## File to Modify

| File | Change |
|------|--------|
| `src/components/trainings/TrainingFormModal.tsx` | Change empty string value to `"none"` and handle conversion |

---

## Technical Details

### Lines 498-522 - skill_level_id Select

**Current code (line 498-508):**
```tsx
<Select 
  value={field.value || ''} 
  onValueChange={(v) => field.onChange(v || null)}
>
  <FormControl>
    <SelectTrigger>
      <SelectValue placeholder="Level wählen..." />
    </SelectTrigger>
  </FormControl>
  <SelectContent>
    <SelectItem value="">Kein Level</SelectItem>  {/* BROKEN! */}
```

**Fixed code:**
```tsx
<Select 
  value={field.value || 'none'} 
  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
>
  <FormControl>
    <SelectTrigger>
      <SelectValue placeholder="Level wählen..." />
    </SelectTrigger>
  </FormControl>
  <SelectContent>
    <SelectItem value="none">Kein Level</SelectItem>  {/* FIXED */}
```

---

## Why This Was Working Before

Looking at the memories and recent changes:
- The `TrainingFormModal` was likely working before because it may not have been rendering (due to the modal key changes)
- Or the "Kein Level" option was added recently
- The route changes and navigate fixes exposed this issue because now the modal actually opens and renders

---

## Additional Check

The `product_id` field also uses a similar pattern (line 631-633):
```tsx
value={field.value || ''} 
onValueChange={(v) => field.onChange(v || null)}
```

But looking at line 648-658, there's no `<SelectItem value="">` option for products - it only maps over `trainingProducts`. So that one is safe.

---

## Testing Checklist

After the fix:
1. Navigate to `/trainings`
2. Click "Bearbeiten" on any training card
3. Verify the modal opens without errors
4. Check the skill level dropdown shows "Kein Level" as an option
5. Select "Kein Level" and verify it saves correctly (sets `skill_level_id` to null)
6. Test creating a new training
7. Test duplicating a training

