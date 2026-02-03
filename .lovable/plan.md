
# Fix Scrolling and Button Visibility in AbsenceTypeDialog

## Problem

The `AbsenceTypeDialog` (create/edit absence form) has too much content for small screens:
- Radio buttons for 5 absence types
- Reason textarea
- Full day toggle + time selects
- Admin approval toggle
- Footer buttons

Without height constraints, the dialog exceeds the viewport and the buttons are cut off.

## Solution

Apply the same scrolling fix pattern used in other dialogs:

### File: `src/components/scheduler/AbsenceTypeDialog.tsx`

**Change 1:** Add height constraint and flex layout to DialogContent (line 126)

```tsx
// Before:
<DialogContent className="max-w-md">

// After:
<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
```

**Change 2:** Wrap the scrollable content area in a div with overflow (after DialogHeader, before DialogFooter)

Wrap lines 144-321 in a scrollable container:

```tsx
<DialogHeader>...</DialogHeader>

{/* Scrollable content area */}
<div className="flex-1 overflow-y-auto space-y-4 py-2">
  {/* All form content goes here */}
</div>

<DialogFooter>...</DialogFooter>
```

## Result

- Dialog constrained to 85% viewport height
- Header (title) and Footer (buttons) remain fixed/visible
- Middle content area scrolls when needed
- Buttons always accessible at the bottom
