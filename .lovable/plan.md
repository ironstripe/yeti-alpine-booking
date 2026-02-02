
# Fix: SelectItem Empty Value Error

## Problem

The application crashes on `/trainings/planning` with this error:
```
Error: A <Select.Item /> must have a value prop that is not an empty string.
```

Radix UI reserves empty strings for **clearing selections** and showing the placeholder. Using `value=""` on a `SelectItem` is invalid.

## Root Cause

5 files contain `<SelectItem value="">` which crashes the application:

| File | Line | Current Code |
|------|------|--------------|
| `src/components/planning/GroupPlanningCourseCard.tsx` | 181 | `<SelectItem value="">Keine</SelectItem>` |
| `src/components/group-capacity/AddAssistantDialog.tsx` | 112 | `<SelectItem value="">Kein Hilfslehrer</SelectItem>` |
| `src/components/planning/DailyAssignmentModal.tsx` | 123, 140 | `<SelectItem value="">` (2 instances) |
| `src/components/group-capacity/SplitGroupDialog.tsx` | 285 | `<SelectItem value="">Kein Lehrer</SelectItem>` |
| `src/components/group-capacity/MergeGroupsDialog.tsx` | 227 | `<SelectItem value="">Kein Lehrer</SelectItem>` |

## Solution

Replace empty string values with a placeholder string (e.g., `"none"`) and handle the mapping in `onValueChange`:

**Pattern:**
```tsx
// BEFORE (crashes)
<SelectItem value="">Keine</SelectItem>

// AFTER (works)
<SelectItem value="none">Keine</SelectItem>
```

Then update the `onValueChange` handler to convert `"none"` back to `null` or empty string:
```tsx
onValueChange={(value) => setValue(value === "none" ? "" : value)}
```

## Files to Modify

### 1. `src/components/planning/GroupPlanningCourseCard.tsx`
- Line 181: Change `value=""` to `value="none"` 
- Line 176: Update onValueChange to handle `"none"` → empty string

### 2. `src/components/group-capacity/AddAssistantDialog.tsx`
- Line 112: Change `value=""` to `value="none"`
- Line 107: Update onValueChange to handle `"none"` → empty string

### 3. `src/components/planning/DailyAssignmentModal.tsx`
- Line 123: Change `value=""` to `value="none"` for instructor
- Line 140: Change `value=""` to `value="none"` for assistant

### 4. `src/components/group-capacity/SplitGroupDialog.tsx`
- Line 285: Change `value=""` to `value="none"`
- Line 270-278: Update onValueChange to handle `"none"` → `null`

### 5. `src/components/group-capacity/MergeGroupsDialog.tsx`
- Line 227: Change `value=""` to `value="none"`
- Line 222: Update onValueChange to handle `"none"` → empty string

## Example Fix (GroupPlanningCourseCard.tsx)

```tsx
// BEFORE
<Select value={selectedAssistant} onValueChange={setSelectedAssistant}>
  <SelectTrigger className="h-9">
    <SelectValue placeholder="(keine)" />
  </SelectTrigger>
  <SelectContent className="bg-popover">
    <SelectItem value="">Keine</SelectItem>  // ❌ Crashes
    {instructors.filter(...).map(...)}
  </SelectContent>
</Select>

// AFTER
<Select 
  value={selectedAssistant || "none"} 
  onValueChange={(v) => setSelectedAssistant(v === "none" ? "" : v)}
>
  <SelectTrigger className="h-9">
    <SelectValue placeholder="(keine)" />
  </SelectTrigger>
  <SelectContent className="bg-popover">
    <SelectItem value="none">Keine</SelectItem>  // ✅ Works
    {instructors.filter(...).map(...)}
  </SelectContent>
</Select>
```

## Impact

- Fixes the crash on `/trainings/planning` page
- Fixes potential crashes in Group Capacity Planning dialogs
- No functional changes - same behavior, just valid Radix UI usage

## Testing

After fix, verify:
1. Navigate to `/trainings/planning` - page loads without error
2. Open any course card - assistant dropdown works
3. Select "Keine" option - clears the selection
4. Open Split/Merge/Assistant dialogs - all dropdowns work
