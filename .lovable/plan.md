
# Plan: Smoother Date Range Selection in Booking Wizard

## Problem
Currently, when creating a booking, staff must click on each individual day to select it. For multi-day stays (e.g., a 5-day ski course), this is tedious and slow.

## Solution
Implement a **hybrid date selection mode** that allows:
1. **Click-drag range selection** - Hold mouse and drag across a date range to select all days in between
2. **Start/End date selection** - Click start date, then click end date to fill the range
3. **Individual toggle** - Still allow clicking single days to toggle them on/off

## User Experience

### Method 1: Click + Drag (Desktop)
1. User clicks on start date (e.g., Jan 6)
2. User holds mouse and drags to end date (Jan 10)
3. All dates in range are selected (5 days)

### Method 2: Range Mode Toggle
1. User clicks "Zeitraum wählen" button (new UI element)
2. User clicks start date - highlighted as range start
3. User clicks end date - all dates between are auto-selected
4. Range mode automatically deactivates

### Method 3: Individual Selection (Unchanged)
- Clicking individual dates still works as before
- Can deselect specific days from a range (e.g., remove weekend)

## Technical Approach

### New Component: `RangeDatePicker.tsx`
A specialized calendar wrapper that enhances `react-day-picker` with:
- Mouse event handling for drag selection (`onMouseDown`, `onMouseMove`, `onMouseUp`)
- Touch support for mobile (`onTouchStart`, `onTouchMove`, `onTouchEnd`)
- Visual preview of range being selected (hover highlight)
- Toggle between "range mode" and "individual mode"

### State Management
```typescript
// New local state in date picker
const [isDragging, setIsDragging] = useState(false);
const [dragStart, setDragStart] = useState<Date | null>(null);
const [dragPreview, setDragPreview] = useState<DateRange | null>(null);
const [isRangeMode, setIsRangeMode] = useState(false);
const [rangeStart, setRangeStart] = useState<Date | null>(null);
```

### Key Features
1. **Visual feedback during drag**: Dates in the dragged range show a preview highlight
2. **Quick actions**: "Ganze Woche" (whole week), "Werktage" (weekdays only) buttons
3. **Clear all**: Quick button to reset selection
4. **Smart toggle**: After range selection, individual days can be toggled off

## Files to Modify

### 1. Create `src/components/ui/range-date-picker.tsx`
New reusable component with enhanced selection capabilities.

### 2. Update `src/components/bookings/wizard/Step2ProductDates.tsx`
- Replace `Calendar` with new `RangeDatePicker`
- Add quick action buttons ("Ganze Woche", "Clear")

### 3. Update `src/components/bookings/wizard/ParticipantBookingCard.tsx`
- Same calendar replacement for individual booking mode

## UI Mockup

```
┌─────────────────────────────────────────────────┐
│ Kurstage wählen                                 │
│ ┌──────────────────────────────────────────────┐│
│ │ [Einzeln] [Zeitraum wählen]  [Ganze Woche] ▼ ││
│ └──────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────┐│
│ │        ◄  Januar 2026  ►                     ││
│ │  Mo  Di  Mi  Do  Fr  Sa  So                  ││
│ │                   1   2   3   4              ││
│ │ [5] [6] [7] [8] [9]  10  11                  ││
│ │  12  13  14  15  16  17  18                  ││
│ └──────────────────────────────────────────────┘│
│ Ausgewählt: Mo 5. - Fr 9. Jan (5 Tage)  [✕]    │
└─────────────────────────────────────────────────┘
```

## Implementation Details

### Drag Selection Logic
```typescript
const handleDayMouseDown = (date: Date) => {
  setIsDragging(true);
  setDragStart(date);
  setDragPreview({ from: date, to: date });
};

const handleDayMouseEnter = (date: Date) => {
  if (!isDragging || !dragStart) return;
  const [start, end] = dragStart <= date 
    ? [dragStart, date] 
    : [date, dragStart];
  setDragPreview({ from: start, to: end });
};

const handleMouseUp = () => {
  if (isDragging && dragPreview) {
    // Generate all dates in range
    const rangeDates = eachDayOfInterval(dragPreview);
    // Filter out disabled dates (past dates)
    const validDates = rangeDates.filter(d => d >= today);
    // Merge with existing selection or replace
    onSelect(validDates);
  }
  setIsDragging(false);
  setDragStart(null);
  setDragPreview(null);
};
```

### Quick Actions
```typescript
const quickActions = [
  { label: "Mo-Fr", action: () => selectWeekdays(currentWeek) },
  { label: "Ganze Woche", action: () => selectFullWeek(currentWeek) },
  { label: "Leeren", action: () => onSelect([]) },
];
```

## Mobile Support
- Touch events mapped to equivalent mouse events
- Larger touch targets on mobile
- Visual drag preview works on touch

## Edge Cases Handled
- Dragging backwards (end before start)
- Dragging across month boundaries
- Attempting to select disabled/past dates
- Mixed selection (range + individual additions/removals)

## Benefits
- **5x faster** for typical 5-day course selection (1 drag vs 5 clicks)
- Intuitive gesture familiar from other date pickers
- Still supports granular control (e.g., exclude specific days)
- Works on both desktop and mobile
