
# Fix Scrolling in Absence Detail Dialog

## Problem

The absence modal cannot be scrolled when content exceeds the viewport height. This happens because the `DialogContent` doesn't have max-height constraints.

## Solution

Add max-height and overflow styling to enable scrolling within the dialog.

## Implementation

### File: `src/components/scheduler/AbsenceDetailDialog.tsx`

**Change 1:** Add `max-h-[85vh]` to `DialogContent` to constrain height

```tsx
<DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
```

**Change 2:** Add `overflow-y-auto` to the content area (line 97)

```tsx
<div className="space-y-4 py-4 overflow-y-auto flex-1">
```

This keeps the header and footer fixed while allowing the middle content to scroll.

## Result

- Dialog will never exceed 85% of viewport height
- Content area scrolls when needed
- Header (title) and footer (buttons) remain fixed and visible
