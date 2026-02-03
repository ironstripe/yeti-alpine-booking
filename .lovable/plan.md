
# Fix Drag-and-Drop Visual Issues and Drop Zone Detection

## Problems Identified

### Problem 1: Visual Expansion During Drag
When using `DragOverlay` in dnd-kit, the original dragged element should **stay in place** while a separate overlay follows the cursor. Currently, `BookingBar.tsx` applies `CSS.Translate.toString(transform)` to the original element, causing:
- Original booking bar moves with cursor (via transform)
- DragOverlay also moves with cursor
- Result: Two elements moving, creating confusing "expansion" effect

### Problem 2: Blocked Drop Zones
The original booking bar has:
- Transform applied (follows cursor)
- `z-50` z-index during drag
- `pointer-events` still active

This means the dragged booking bar hovers over drop zones and intercepts mouse events, blocking drops.

## Solution

### 1. BookingBar.tsx - Stop Applying Transform

Remove transform from original element when using DragOverlay. The original should stay in place with reduced opacity while DragOverlay handles the visual movement.

**Changes:**
- Remove `transform` from style when `isDragging`
- Add `pointer-events: none` during drag to allow click-through
- Remove `z-50` as it's not needed when element stays in place

```typescript
const style = {
  left: `${left}px`,
  width: `${Math.max(width - 4, 40)}px`,
  // Only apply transform when NOT dragging - DragOverlay handles visual during drag
  transform: isDragging ? undefined : CSS.Translate.toString(transform),
  transition: isDragging ? undefined : "transform 200ms ease",
  // Allow clicks to pass through to drop zones while dragging
  pointerEvents: isDragging ? 'none' : undefined,
};
```

And update classes to remove z-50:
```typescript
isDragging && "opacity-30", // Remove z-50 shadow-lg
```

### 2. DndKitProvider.tsx - Use Better Collision Detection

`closestCenter` can be imprecise when dragging over narrow slots. Switch to `pointerWithin` or `closestCorners` for more accurate drop detection on small targets.

```typescript
import { pointerWithin } from "@dnd-kit/core";
// ...
collisionDetection={pointerWithin}
```

### 3. Improve DragOverlay Styling

Add fixed dimensions and ensure it's clearly visible above all elements:

```typescript
<DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
  {activeBooking && (
    <div
      className={cn(
        "rounded-md border px-2 py-1 text-xs font-medium shadow-lg",
        overSlot && !overSlot.isBlocked 
          ? "bg-green-500 text-white border-green-600" 
          : overSlot?.isBlocked 
            ? "bg-red-500 text-white border-red-600"
            : "bg-gray-400 text-white border-gray-500",
        "cursor-grabbing"
      )}
      style={{ 
        minWidth: 80,
        maxWidth: 150,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span className="truncate">
        {activeBooking.participantName || "Privatstunde"}
      </span>
    </div>
  )}
</DragOverlay>
```

## Files to Change

| File | Changes |
|------|---------|
| `src/components/scheduler/BookingBar.tsx` | Remove transform during drag, add pointer-events: none, remove z-50 |
| `src/components/scheduler/DndKitProvider.tsx` | Change collision detection to `pointerWithin`, improve overlay styling |

## Expected Result

After these changes:
1. **Clear visual feedback**: Original booking stays in place (dimmed), small overlay follows cursor
2. **Accurate drops**: `pointerWithin` collision + pointer-events passthrough allows precise targeting
3. **No expansion**: Only one element moves (the overlay), not the original
