
# Fix: Training Edit Modal ("Bearbeiten") Not Working

## Investigation Summary

After thoroughly examining the code, I found the following:

### Code That Looks Correct
1. **Trainings.tsx** - Modal state management is properly implemented:
   - `handleEditClick` correctly sets `selectedCourse`, `modalMode: 'edit'`, and `isModalOpen: true`
   - `TrainingFormModal` receives `open={isModalOpen}` and `onOpenChange={setIsModalOpen}`
   
2. **TrainingFormModal.tsx** - Dialog is correctly configured:
   - Line 233: `<Dialog open={open} onOpenChange={onOpenChange}>` - passes props correctly
   - `useEffect` properly resets form when `open` changes

### Potential Issue Found: Route Ordering

The route order in `App.tsx` has `trainings/:id` before `trainings/planning`:

```
Line 157: <Route path="trainings" element={<Trainings />} />
Line 158: <Route path="trainings/:id" element={<TrainingDetail />} />
Line 159: <Route path="trainings/:id/instances" element={<TrainingDetail />} />
Line 160: <Route path="trainings/planning" element={<GroupCoursePlanning />} />
```

While React Router v6 has intelligent route scoring, having static routes after dynamic routes can sometimes cause issues.

### Most Likely Root Cause

Since you mentioned this **was once working properly**, the issue likely stems from:
1. A race condition or stale state issue between the modal and data loading
2. The `key` prop on the modal causing remounting issues

---

## Solution

### Fix 1: Route Ordering (Precautionary)

Move `trainings/planning` route BEFORE the dynamic `:id` routes:

**File**: `src/App.tsx`

**Change**:
```typescript
// Current order (problematic):
<Route path="trainings" element={<Trainings />} />
<Route path="trainings/:id" element={<TrainingDetail />} />
<Route path="trainings/:id/instances" element={<TrainingDetail />} />
<Route path="trainings/planning" element={<GroupCoursePlanning />} />

// New order (correct):
<Route path="trainings" element={<Trainings />} />
<Route path="trainings/planning" element={<GroupCoursePlanning />} />
<Route path="trainings/:id" element={<TrainingDetail />} />
<Route path="trainings/:id/instances" element={<TrainingDetail />} />
```

### Fix 2: Modal Key Prop Improvement

The current key pattern might be causing issues when switching between courses:

**File**: `src/pages/Trainings.tsx` (Line 166-172)

**Current**:
```tsx
<TrainingFormModal
  key={`${selectedCourse?.id ?? 'new'}-${modalMode}`}
  open={isModalOpen}
  onOpenChange={setIsModalOpen}
  course={selectedCourse}
  mode={modalMode}
/>
```

**Change to**:
```tsx
<TrainingFormModal
  key={isModalOpen ? `${selectedCourse?.id ?? 'new'}-${modalMode}` : 'closed'}
  open={isModalOpen}
  onOpenChange={setIsModalOpen}
  course={selectedCourse}
  mode={modalMode}
/>
```

This ensures the modal properly remounts when opened with new data.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Reorder routes - move `trainings/planning` before dynamic routes |
| `src/pages/Trainings.tsx` | Update modal key prop pattern |

---

## Technical Details

### Route Reordering (App.tsx)

Lines 157-160 will be changed to:
```typescript
<Route path="trainings" element={<Trainings />} />
<Route path="trainings/planning" element={<GroupCoursePlanning />} />
<Route path="trainings/:id" element={<TrainingDetail />} />
<Route path="trainings/:id/instances" element={<TrainingDetail />} />
```

### Modal Key Pattern (Trainings.tsx)

Line 167 will change from:
```tsx
key={`${selectedCourse?.id ?? 'new'}-${modalMode}`}
```
to:
```tsx
key={isModalOpen ? `${selectedCourse?.id ?? 'new'}-${modalMode}` : 'closed'}
```

---

## Testing Checklist

1. Navigate to `/trainings` page
2. Click "Bearbeiten" on any training card
3. Verify modal opens with pre-populated course data
4. Edit a field and click "Speichern" - verify changes persist
5. Close and reopen the modal - verify data reloads correctly
6. Test "Duplizieren" (copy) and "Neues Training" (create) buttons
7. Verify `/trainings/planning` route still works correctly
