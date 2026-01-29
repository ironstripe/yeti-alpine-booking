

# Fix: TrainingDetail Page Crashes App Due to Navigate During Render

## Problem

The app is showing the ErrorBoundary error screen ("Etwas ist schiefgelaufen") because the `TrainingDetail` page calls `navigate()` during the render phase, which is a React anti-pattern that causes infinite loops or crashes.

## Root Cause

In `src/pages/TrainingDetail.tsx` (lines 8-11):

```typescript
if (!id) {
  navigate('/trainings');  // Called during render!
  return null;
}
```

Calling `navigate()` during the render phase violates React's rules. Navigation must happen in:
- Event handlers
- `useEffect` hooks
- Or using the `<Navigate>` component

This causes the entire React Router to break, crashing the whole app - even on unrelated pages like `/login`.

---

## Solution

Replace the imperative `navigate()` call with React Router's declarative `<Navigate>` component:

```typescript
import { Navigate, useNavigate, useParams } from 'react-router-dom';

const TrainingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return <Navigate to="/trainings" replace />;
  }

  const handleBack = () => {
    navigate('/trainings');
  };

  return <TrainingInstancesView courseId={id} onBack={handleBack} />;
};
```

---

## File to Modify

| File | Change |
|------|--------|
| `src/pages/TrainingDetail.tsx` | Replace `navigate()` with `<Navigate>` component |

---

## Technical Details

### Changes to TrainingDetail.tsx

**Line 1** - Update import to include `Navigate`:
```typescript
import { Navigate, useNavigate, useParams } from 'react-router-dom';
```

**Lines 8-11** - Replace imperative navigation with declarative:
```typescript
// Before (broken):
if (!id) {
  navigate('/trainings');
  return null;
}

// After (fixed):
if (!id) {
  return <Navigate to="/trainings" replace />;
}
```

---

## Why This Fixes the Issue

1. `<Navigate>` is a component that React Router handles correctly during the render phase
2. It schedules the navigation after the render completes, not during it
3. The `replace` prop prevents the broken state from being added to browser history

---

## Testing Checklist

1. Navigate to `/login` - verify the login page loads correctly
2. Log in and navigate to `/trainings` page
3. Click "Instanzen" on any training card - verify it navigates to training detail
4. Click the back button - verify it returns to the trainings list
5. Navigate directly to `/trainings/invalid-id` - verify it redirects to `/trainings`
6. Test "Bearbeiten" button on training cards - verify the modal opens

