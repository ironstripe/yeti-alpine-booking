

# Fix Skill Level Selection for Private Lessons

## Problem

The `LevelSelector` component currently has incorrect logic:

```typescript
if (isChildParticipant && isGroupCourse) {
  // Shows training levels (Blue Prince, Red King, etc.)
} else {
  // Shows adult levels (Green, Blue, Red, Black)
}
```

**Current behavior:**
| Age | Group Course | Private Lesson |
|-----|--------------|----------------|
| Child (≤16) | Training levels (Blue Prince, etc.) | Adult levels (Green, Blue, Red, Black) |
| Adult (>16) | Adult levels | Adult levels |

**Expected behavior (per your discussion):**
| Age | Group Course | Private Lesson |
|-----|--------------|----------------|
| Child (≤16) | Training levels (Blue Prince, etc.) | Training levels (Blue Prince, etc.) |
| Adult (>16) | N/A (adults don't do group courses) | Adult levels (Green, Blue, Red, Black) |

---

## Solution

Change the condition from `isChildParticipant && isGroupCourse` to just `isChildParticipant`:

```typescript
if (isChildParticipant) {
  // For children: fetch training-based levels
  // (Blue Prince, Red King, etc. from group_courses table)
} else {
  // For adults: use static self-assessment levels
  // (Green/Anfänger, Blue/Fortgeschritten, Red/Geübt, Black/Experte)
}
```

---

## File Changes

| File | Action |
|------|--------|
| `src/components/booking/LevelSelector.tsx` | Modify logic - remove `&& isGroupCourse` condition |

---

## Detailed Changes

### `src/components/booking/LevelSelector.tsx`

**Before (line 72):**
```typescript
if (isChildParticipant && isGroupCourse) {
```

**After:**
```typescript
if (isChildParticipant) {
```

Also update the comment above this condition to reflect the correct logic:

**Before:**
```typescript
// For children in group courses, fetch trainings (group_courses)
// For adults or private lessons, use adult self-assessment levels
```

**After:**
```typescript
// For children (≤16): fetch training-based levels from group_courses
// For adults (>16): use color-based self-assessment levels
```

---

## Additional Consideration

The `isGroupCourse` prop can be removed from the component entirely since it's no longer needed for the level selection logic. However, to keep changes minimal and maintain backward compatibility, we can keep the prop but simply not use it in the condition.

---

## Testing Checklist

1. **Child in Private Lesson:**
   - Select a child participant (age ≤16)
   - Create a private lesson booking
   - Verify the level selector shows training levels (Blue Prince, Red King, etc.)

2. **Child in Group Course:**
   - Select a child participant
   - Create a group course booking
   - Verify the level selector still shows training levels

3. **Adult in Private Lesson:**
   - Select an adult participant (age >16)
   - Create a private lesson booking
   - Verify the level selector shows adult levels (Anfänger, Fortgeschritten, Geübt, Experte)

4. **Level Suggestion:**
   - Verify that for children, the suggested level is based on their `current_ski_training_id` or `current_snowboard_training_id`
   - Verify that for adults, the suggested level is based on their `self_assessed_ski_level` or `self_assessed_snowboard_level`

