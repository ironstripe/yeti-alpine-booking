
# Fix Scrolling in Split Group Modal

## Problem

The `ScrollArea` component with `flex-1` doesn't properly enable scrolling because Radix ScrollArea needs a concrete height to calculate scroll behavior. When the content (17 participants across 3 groups) exceeds the viewport, users cannot scroll to see all content.

## Solution

Replace `ScrollArea` with a plain `div` using `flex-1 overflow-y-auto`, following the project's standardized scrolling pattern for complex dialogs.

## Changes

**File:** `src/components/group-capacity/SplitGroupDialog.tsx`

### 1. Remove ScrollArea import (line 39)
Remove or comment out the unused import:
```tsx
// Remove: import { ScrollArea } from '@/components/ui/scroll-area';
```

### 2. Replace ScrollArea with scrollable div (line 248)
Change:
```tsx
<ScrollArea className="flex-1 -mx-6 px-6">
```
To:
```tsx
<div className="flex-1 overflow-y-auto -mx-6 px-6">
```

And update the closing tag (line 330):
```tsx
</div>
```

## Technical Note

This follows the memory-documented pattern (`ui-ux/standardized-dialog-scrolling-v1`):
> Complex dialogs implement a standardized scrolling pattern: DialogContent is constrained to `max-h-[85vh]` with `flex flex-col`, and the middle content area is wrapped in a `div` with `flex-1 overflow-y-auto`.

The current `max-h-[90vh]` is close enough and works well. The key fix is using native CSS overflow scrolling instead of the Radix ScrollArea component.
