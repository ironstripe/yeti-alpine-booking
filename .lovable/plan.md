

# Fix Drag-and-Drop Issues

## Problems Identified

### Problem 1: Same-Teacher Drop Not Working
**Root Cause**: The BookingBar element renders AFTER EmptySlots in DOM order, placing it visually on top. Even with `pointer-events: none`, dnd-kit's collision detection can be affected by overlapping elements. When you drag a booking that spans 10:00-12:00 and try to drop on 11:00, the original BookingBar element is still positioned over that slot.

**Solution**: Hide the original BookingBar completely during drag using `visibility: hidden`. This removes it from collision detection interference entirely while preserving layout space.

### Problem 2: Visual "Expansion" Issue  
**Root Cause**: Currently, when dragging:
- Original BookingBar stays visible at `opacity: 0.3` (showing full booking width)
- DragOverlay shows a small chip following the cursor
- Together they create a confusing "stretched" visual

**Solution**: Use `visibility: hidden` instead of `opacity: 0.3` on the original. The user only sees the DragOverlay chip, creating clean single-element drag feedback.

### Problem 3: Green Frame Feedback Not Intuitive
**Current**: `border-2 border-green-500 bg-green-50` on hover - creates a harsh box effect.

**Solution**: Implement more subtle, professional drop zone feedback:
- Soft background gradient/highlight instead of thick borders
- Subtle pulsing animation to draw attention
- Better visual hierarchy with shadow elevation

---

## Technical Changes

### File 1: `src/components/scheduler/BookingBar.tsx`

**Change**: Replace `opacity-30` with `visibility: hidden` and `opacity: 0` during drag

```typescript
// Line 92: Change from:
isDragging && "opacity-30",

// To:
isDragging && "invisible opacity-0",
```

This completely hides the original element during drag, preventing:
- Visual confusion (no "expansion" effect)
- Collision detection interference
- Z-index stacking issues

---

### File 2: `src/components/scheduler/EmptySlot.tsx`

**Change**: Improve drop zone visual feedback with subtle animation

```typescript
// Lines 190-192: Replace harsh green border with subtle feedback
// From:
isOver && !isInvalidDropZone && "border-2 border-green-500 bg-green-50",

// To:
isOver && !isInvalidDropZone && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
```

Also add subtle animation class:
```typescript
// Add to className when valid drop target
!isInvalidDropZone && activeDragBookingId && "transition-all duration-150",
```

---

### File 3: `src/components/scheduler/DndKitProvider.tsx`

**Change**: Improve DragOverlay with better positioning and feedback

The overlay already shows color feedback (green/red/gray). Consider adding:
- Drop shadow for elevation
- Subtle scale transform for tactile feedback

```typescript
// Update DragOverlay styling (lines 120-142)
className={cn(
  "rounded-md border px-2 py-1 text-xs font-medium",
  "shadow-xl ring-1 ring-black/5", // Better elevation
  "transform transition-colors duration-100", // Smooth color changes
  overSlot && !overSlot.isBlocked 
    ? "bg-primary text-primary-foreground border-primary" // Use theme colors
    : overSlot?.isBlocked 
      ? "bg-destructive text-destructive-foreground border-destructive"
      : "bg-muted text-muted-foreground border-border",
  "cursor-grabbing"
)}
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `BookingBar.tsx` | `visibility: hidden` during drag | Fix collision detection + expansion visual |
| `EmptySlot.tsx` | Subtle ring + bg feedback | Better UX than harsh green border |
| `DndKitProvider.tsx` | Improved overlay styling | Professional drag feedback |

## Expected Result

After these changes:
1. **Same-teacher drops will work** - original booking is hidden, EmptySlots are fully accessible
2. **No visual expansion** - only the small DragOverlay chip moves with cursor
3. **Cleaner feedback** - subtle highlight ring instead of thick green border
4. Dropping works consistently for both same-teacher time changes and cross-teacher moves

