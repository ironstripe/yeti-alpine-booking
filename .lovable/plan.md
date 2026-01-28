
# Add Copy/Duplicate Functionality for Group Trainings

## Overview
Enable users to duplicate existing group trainings with a single click. The copied training will open in the form modal pre-filled with all data from the original, but treated as a new training (create mode, not edit mode).

---

## Implementation Plan

### 1. Update TrainingFormModal Props and Logic

**File:** `src/components/trainings/TrainingFormModal.tsx`

Add a new `mode` prop to distinguish between create, edit, and copy:

```typescript
interface TrainingFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: GroupCourseWithSchedules | null;
  mode?: 'create' | 'edit' | 'copy';  // New prop
}
```

**Changes:**
- Accept `mode` prop (defaults to 'create' when no course, 'edit' when course provided)
- When mode is 'copy':
  - Pre-fill form with course data (like edit)
  - Append " (Kopie)" to the name
  - Use `createCourse` mutation (not update)
  - Show title "Training duplizieren"
- Update the `isEditing` logic to be: `mode === 'edit'`

### 2. Update TrainingCard to Include Copy Button

**File:** `src/components/trainings/TrainingCard.tsx`

Add a copy/duplicate action:

```typescript
interface TrainingCardProps {
  course: GroupCourseWithSchedules;
  onEdit: (course: GroupCourseWithSchedules) => void;
  onCopy: (course: GroupCourseWithSchedules) => void;  // New callback
  onViewInstances: (course: GroupCourseWithSchedules) => void;
}
```

**UI Changes:**
- Add a dropdown menu (DropdownMenu) with actions:
  - **Bearbeiten** (Edit) - existing functionality
  - **Duplizieren** (Copy) - new functionality  
  - **Instanzen/Termine** - existing functionality
- Replace the two inline buttons with a compact actions menu using `MoreHorizontal` icon
- OR keep buttons but add a third "Duplizieren" button with Copy icon

### 3. Update Trainings Page State

**File:** `src/pages/Trainings.tsx`

Add state for modal mode:

```typescript
const [modalMode, setModalMode] = useState<'create' | 'edit' | 'copy'>('create');

const handleCreateClick = () => {
  setSelectedCourse(undefined);
  setModalMode('create');
  setIsModalOpen(true);
};

const handleEditClick = (course: GroupCourseWithSchedules) => {
  setSelectedCourse(course);
  setModalMode('edit');
  setIsModalOpen(true);
};

const handleCopyClick = (course: GroupCourseWithSchedules) => {
  setSelectedCourse(course);
  setModalMode('copy');
  setIsModalOpen(true);
};
```

Pass `mode` to modal and `onCopy` to TrainingCard.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/trainings/TrainingFormModal.tsx` | Add `mode` prop; update title logic; handle copy mode in submit |
| `src/components/trainings/TrainingCard.tsx` | Add `onCopy` prop; add "Duplizieren" button with Copy icon |
| `src/pages/Trainings.tsx` | Add `modalMode` state; add `handleCopyClick` handler; pass props to components |

---

## UI Design

### TrainingCard Actions (Updated)

The card will have 3 action buttons:

```
┌─────────────────────────────────────────┐
│ [Edit icon] Bearbeiten                  │
├─────────────────────────────────────────┤
│ [Copy icon] Duplizieren                 │
├─────────────────────────────────────────┤
│ [List icon] Instanzen/Termine           │
└─────────────────────────────────────────┘
```

Alternative: Use a dropdown menu to keep the card compact:

```
[Bearbeiten]  [Instanzen ▼]
                └─ Duplizieren
                └─ Löschen
```

### Modal Title States

| Mode | Title |
|------|-------|
| create | "Neues Training erstellen" |
| edit | "Training bearbeiten" |
| copy | "Training duplizieren" |

---

## Expected Behavior

1. User clicks "Duplizieren" on a training card
2. Modal opens with all data pre-filled from the original training
3. Name field shows "Original Name (Kopie)"
4. User can modify any fields as needed
5. On submit, a new training is created (original unchanged)
6. Success toast: "Training erfolgreich erstellt"

---

## Technical Notes

- The `useEffect` that resets the form when `course` changes will handle pre-filling
- For copy mode, we modify the name by appending " (Kopie)" before setting form values
- Saturday course dates will be regenerated for the copy (new dates, not duplicated)
- No ID conflict since copy creates a new record
