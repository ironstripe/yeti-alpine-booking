
# Training Detail Page - Missing Route Fix

## Problem

When clicking "Instanzen" or "Termine" on a training card, the app navigates to `/trainings/{id}/instances`, but this route doesn't exist in `App.tsx`. This causes the user to see the 404 NotFound page instead of the training details.

## Root Cause

- `Trainings.tsx` line 85 navigates to `/trainings/${course.id}/instances`
- `App.tsx` only has routes for `/trainings` and `/trainings/planning` (no `:id` parameter)
- `TrainingInstancesView` component exists but is designed as a child component, not a routed page

---

## Solution

Create a new **TrainingDetail page** that:
1. Extracts the `courseId` from the URL parameter
2. Wraps the existing `TrainingInstancesView` component
3. Handles navigation back to the trainings list

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/TrainingDetail.tsx` | Detail page for trainings with instances view |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add routes for `/trainings/:id` and `/trainings/:id/instances` |

---

## Implementation Details

### 1. Create TrainingDetail.tsx

```typescript
// src/pages/TrainingDetail.tsx

import { useNavigate, useParams } from 'react-router-dom';
import { TrainingInstancesView } from '@/components/trainings/TrainingInstancesView';

const TrainingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    navigate('/trainings');
    return null;
  }

  const handleBack = () => {
    navigate('/trainings');
  };

  return <TrainingInstancesView courseId={id} onBack={handleBack} />;
};

export default TrainingDetail;
```

### 2. Update App.tsx Routes

Add two new routes inside the `AppLayout` route group:

```typescript
// Add after line 156 (trainings route)
<Route path="trainings/:id" element={<TrainingDetail />} />
<Route path="trainings/:id/instances" element={<TrainingDetail />} />
```

Also add the import:
```typescript
import TrainingDetail from "./pages/TrainingDetail";
```

---

## Result

After this change:
- Clicking "Instanzen" or "Termine" on a training card will navigate to `/trainings/{id}/instances`
- The `TrainingDetail` page will render with the `TrainingInstancesView` component
- The back button will return to `/trainings`

---

## Technical Notes

- Both `/trainings/:id` and `/trainings/:id/instances` point to the same page for simplicity
- The `TrainingInstancesView` component already handles all the instance display and instructor assignment logic
- No database changes needed
