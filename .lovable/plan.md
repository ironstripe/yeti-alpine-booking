
# Add Delete Functionality for Group Trainings

## Overview
Enable users to delete group trainings that are no longer needed, with a confirmation dialog to prevent accidental deletions.

---

## Current State

The delete mutation **already exists** in `src/hooks/useGroupCourses.ts`:

```typescript
export function useDeleteGroupCourse() {
  // ... deletes from group_courses table
  // Related schedules/instances are likely cascade-deleted via DB constraints
}
```

We just need to add the UI components to use it.

---

## Implementation Plan

### 1. Add Delete Handler to Trainings Page

**File:** `src/pages/Trainings.tsx`

- Import the `useDeleteGroupCourse` hook
- Import the `useConfirmDialog` hook from existing UI components
- Add a `handleDeleteClick` function that shows a confirmation dialog
- Pass `onDelete` callback to `TrainingCard`

### 2. Add Delete Button to TrainingCard

**File:** `src/components/trainings/TrainingCard.tsx`

Add a delete action to the card:

| Prop | Type |
|------|------|
| `onDelete` | `(course: GroupCourseWithSchedules) => void` |

UI Changes:
- Add a "Löschen" (Delete) button with `Trash2` icon
- Use destructive styling (red) to indicate this is a permanent action

Updated button layout:
```
┌──────────────────────────────────────────────────────────┐
│ [Edit] Bearbeiten  [Copy]  [Instances] Instanzen/Termine │
│                    [Delete] Löschen                      │
└──────────────────────────────────────────────────────────┘
```

Or alternatively, consolidate secondary actions:
```
┌────────────────────────────────────────────────────────────┐
│ [Bearbeiten]  [Duplizieren]  [Instanzen]  [🗑️ Löschen]    │
└────────────────────────────────────────────────────────────┘
```

### 3. Confirmation Dialog

Use the existing `useConfirmDialog` hook to show a warning before deletion:

```typescript
const confirmed = await confirm({
  title: 'Training löschen',
  description: `Bist du sicher, dass du "${course.name}" löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.`,
  confirmLabel: 'Löschen',
  cancelLabel: 'Abbrechen',
  variant: 'destructive',
});

if (confirmed) {
  deleteCourse.mutate(course.id);
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Trainings.tsx` | Import `useDeleteGroupCourse` and `useConfirmDialog`; add `handleDeleteClick`; pass `onDelete` to cards; render confirmation dialog |
| `src/components/trainings/TrainingCard.tsx` | Add `onDelete` prop; add "Löschen" button with `Trash2` icon and destructive styling |

---

## Expected Behavior

1. User clicks "Löschen" button on a training card
2. Confirmation dialog appears with warning message
3. If user confirms:
   - Training is deleted from database
   - Related schedules and instances are cascade-deleted
   - Training card disappears from the list
   - Success toast: "Training erfolgreich gelöscht"
4. If user cancels:
   - Dialog closes, no changes made

---

## Safety Considerations

- **Cascade Delete**: When a training is deleted, its related data (schedules, instances, potentially enrollments) should be handled by the database via foreign key constraints or cascade rules
- **Confirmation Required**: Users must explicitly confirm before deletion
- **Visual Warning**: The delete button uses destructive (red) styling to indicate danger

---

## Technical Notes

- The existing `useDeleteGroupCourse` hook handles the mutation and cache invalidation
- The `useConfirmDialog` hook from `@/components/ui/confirm-dialog` provides a promise-based confirmation flow
- Database cascade behavior depends on the foreign key constraints set up in Supabase
