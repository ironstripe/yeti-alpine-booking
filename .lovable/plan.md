
# Fix Training Copy Functionality

## Problem Summary

The copy/duplicate functionality for trainings is not working. When a user clicks "Duplizieren", the form opens correctly but submitting the form **updates the original training** instead of **creating a new copy**.

## Root Cause Analysis

### Console Warning (Non-blocking)
There's a React ref warning about `FormField` in the modal. This is a cosmetic warning and not the cause of the copy failure.

### Actual Issue
The issue is a **state persistence problem** with how the modal handles mode changes:

1. **Radix Dialog keeps content mounted** - When the dialog closes, the component isn't unmounted, just hidden
2. **Stale form state** - When reopening with the same `course` but different `mode`, the `useEffect` that resets the form may not trigger reliably because:
   - The `course` object reference might be the same (from React Query cache)
   - React might batch state updates when the modal is closed
3. **Effect dependency timing** - The `useEffect` depends on `[course, form, actualMode]`, but when switching from `edit` to `copy` on the same course, the effect might not re-run if the course reference is identical

### Evidence
Network request shows a **PATCH** (update) operation instead of **POST** (insert) when trying to copy, indicating `actualMode === 'edit'` evaluated to `true` during submission.

---

## Solution

### Fix 1: Add `open` prop to form reset useEffect

Add the `open` state to the dependency array to ensure the form resets every time the modal opens:

**File:** `src/components/trainings/TrainingFormModal.tsx`

```typescript
// Add 'open' to the component props destructuring
export function TrainingFormModal({ open, onOpenChange, course, mode }: TrainingFormModalProps) {
  // ... existing code ...

  // Update useEffect to include 'open' in dependencies
  useEffect(() => {
    if (!open) return; // Skip reset when modal is closed
    
    if (course) {
      const nameValue = actualMode === 'copy' ? `${course.name} (Kopie)` : course.name;
      form.reset({
        // ... existing reset values
      });
      // ... existing schedule setup
    } else {
      form.reset();
      setSelectedDays([1, 2, 3, 4, 5]);
      setTimeSlots([{ start_time: '10:00', end_time: '12:00' }]);
    }
  }, [open, course, form, actualMode]); // Added 'open' to dependencies
```

### Fix 2: Add key to force remount when mode changes

Add a unique key to the Dialog that changes when mode or course changes:

**File:** `src/pages/Trainings.tsx`

```typescript
<TrainingFormModal
  key={`${selectedCourse?.id ?? 'new'}-${modalMode}`}
  open={isModalOpen}
  onOpenChange={setIsModalOpen}
  course={selectedCourse}
  mode={modalMode}
/>
```

This ensures a fresh component instance for each unique course+mode combination.

### Fix 3: Add DialogDescription for accessibility

Fix the console warning about missing `Description`:

**File:** `src/components/trainings/TrainingFormModal.tsx`

Add `DialogDescription` to the modal header:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription, // Add this import
} from '@/components/ui/dialog';

// In the render:
<DialogHeader>
  <DialogTitle>
    {actualMode === 'edit' 
      ? 'Training bearbeiten' 
      : actualMode === 'copy' 
        ? 'Training duplizieren' 
        : 'Neues Training erstellen'}
  </DialogTitle>
  <DialogDescription>
    {actualMode === 'edit' 
      ? 'Bearbeite die Details dieses Trainings.' 
      : actualMode === 'copy' 
        ? 'Erstelle eine Kopie dieses Trainings mit angepassten Details.' 
        : 'Erstelle ein neues Training für Gruppenkurse.'}
  </DialogDescription>
</DialogHeader>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/trainings/TrainingFormModal.tsx` | 1. Add `open` to useEffect dependencies with early return when closed<br>2. Add `DialogDescription` for accessibility |
| `src/pages/Trainings.tsx` | Add `key` prop to force component remount on mode/course change |

---

## Expected Outcome

After these fixes:
1. Clicking "Duplizieren" will open the form pre-filled with course data
2. The name will show "(Kopie)" suffix
3. Submitting will **create a new training** instead of updating the original
4. The console warning about missing DialogDescription will be resolved

---

## Technical Notes

- The key prop approach (Fix 2) is the most reliable as it guarantees a fresh component state
- Adding `open` to dependencies (Fix 1) is a good practice for modal forms in general
- Both fixes together provide defense-in-depth against state persistence issues
