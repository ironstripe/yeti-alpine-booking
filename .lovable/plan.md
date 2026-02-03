
# Fix Escape Key for Absence Detail Dialog

## Problem

The Escape key doesn't close the `AbsenceDetailDialog`. This is caused by the `ConfirmDialog` being rendered in the DOM even when it's not open (`showDeleteConfirm = false`), which interferes with Radix Dialog's escape key handling.

## Solution

Conditionally render the `ConfirmDialog` only when `showDeleteConfirm` is true. This ensures only one dialog is in the DOM at a time, allowing the Escape key to work correctly.

## Implementation

### File: `src/components/scheduler/AbsenceDetailDialog.tsx`

**Change:** Wrap `ConfirmDialog` in a conditional render (line 174)

```tsx
// Before (always rendered):
<ConfirmDialog
  open={showDeleteConfirm}
  onOpenChange={setShowDeleteConfirm}
  ...
/>

// After (only rendered when needed):
{showDeleteConfirm && (
  <ConfirmDialog
    open={showDeleteConfirm}
    onOpenChange={setShowDeleteConfirm}
    ...
  />
)}
```

## Result

- Escape key will properly close the absence detail dialog
- When delete confirmation is open, Escape will close the confirmation first
- No interference between nested dialog escape handlers
