
# Fix: Maximum Update Depth Error in NewInstructorModal

## Problem Analysis

The application crashes with "Maximum update depth exceeded" when the NewInstructorModal is opened. This is caused by an infinite loop in the Dialog's open/close cycle.

### Root Cause

In `NewInstructorModal.tsx` (line 156), the `handleClose` function is incorrectly used as the `onOpenChange` handler:

```tsx
// Current problematic code
const handleClose = () => {
  reset();           // Always resets form
  setIbanValue("");  // Always clears state
  setAhvValue("");   // Always clears state
  onOpenChange(false); // Always closes
};

<Dialog open={open} onOpenChange={handleClose}>
```

**The issue:** Radix Dialog's `onOpenChange` is called with `true` when opening AND `false` when closing. Since `handleClose` doesn't accept any parameter, it always runs the reset logic and calls `onOpenChange(false)`, even when the dialog is trying to open. This creates an infinite loop.

### Correct Pattern (from BulkUploadModal.tsx)

```tsx
const handleClose = (open: boolean) => {
  if (!open) {
    resetState();
  }
  onOpenChange(open);
};
```

This pattern:
1. Receives the `open` boolean from Dialog
2. Only runs reset logic when closing (`!open`)
3. Passes the correct value through to parent

---

## Solution

Update `handleClose` in `NewInstructorModal.tsx` to properly handle both open and close events.

### File Changes

**`src/components/instructors/NewInstructorModal.tsx`**

Change the `handleClose` function from:
```tsx
const handleClose = () => {
  reset();
  setIbanValue("");
  setAhvValue("");
  onOpenChange(false);
};
```

To:
```tsx
const handleClose = (open: boolean) => {
  if (!open) {
    reset();
    setIbanValue("");
    setAhvValue("");
  }
  onOpenChange(open);
};
```

Also update button click handlers that call `handleClose()` directly to pass `false`:
```tsx
// Cancel button (line 405)
<Button type="button" variant="outline" onClick={() => handleClose(false)}>
```

---

## Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| `handleClose` signature | `() => void` | `(open: boolean) => void` |
| Reset on open | Yes (bug) | No |
| Reset on close | Yes | Yes |
| Infinite loop | Yes | No |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructors/NewInstructorModal.tsx` | Fix `handleClose` to accept boolean parameter |

---

## Testing

After the fix:
1. Navigate to /instructors
2. Click "Neuer Skilehrer" button
3. Modal should open without crashing
4. Fill out form and cancel - modal should close and reset
5. Open again - form should be empty
