
# Enhanced PeriodDayPlanner Implementation

## Current State Analysis

The existing `PeriodDayPlanner` component already supports:
- Multiple time blocks per day via `dayTimeOverrides: Record<string, TimeBlock[]>`
- Add/remove time block functionality
- Instructor selection (but only at DAY level, not per block)
- Override detection and visual feedback

**Key Gap**: The wireframe requires **instructor assignment per TIME BLOCK**, not per day. This is a fundamental data model change.

---

## Implementation Plan

### Phase 1: Extend Data Model (TimeBlock with Instructor)

**File: `src/contexts/BookingWizardContext.tsx`**

Update the `TimeBlock` interface to include an optional instructor:

```typescript
export interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  instructorId?: string | null;  // NEW: Per-block instructor
}
```

Update related functions:
- `addTimeBlock(date, startTime, endTime, instructorId?)` - Accept optional instructor
- `updateTimeBlock(date, blockId, startTime, endTime, instructorId?)` - Include instructor updates
- `applyMiniSchedulerSelection()` - Populate block-level instructors

---

### Phase 2: Redesign PeriodDayPlanner UI

**File: `src/components/bookings/wizard/PeriodDayPlanner.tsx`**

Implement the wireframe layout with these sections:

**A. Day Card Structure**
```
+-----------------------------------------------+
| [Date Header] Mo, 9. Feb                      |
+-----------------------------------------------+
| Zeitblock 1:                                  |
|   [10:00 v] bis [12:00 v]                     |
|   [Max Mustermann v]                          |
|   [Trash Icon]                                |
+-----------------------------------------------+
| Zeitblock 2:                     [Warning]    |
|   [14:00 v] bis [16:00 v]  "Zusaetzlicher..." |
|   [Anna Schmidt v]         "Abweichend"       |
|   [Trash Icon]                                |
+-----------------------------------------------+
| [+ Weiterer Zeitblock hinzufuegen]            |
+-----------------------------------------------+
```

**B. Warning Indicator Logic**
- Show "Abweichend" badge when:
  - Time differs from base time
  - Instructor differs from base instructor
- Show "Zusaetzlicher Block" for 2nd+ blocks on same day

**C. Per-Block Instructor Dropdown**
- Each time block gets its own instructor selector
- Default to base instructor when adding new blocks
- Track override status per block

---

### Phase 3: Update Booking Creation Logic

**File: `src/hooks/useCreateBooking.ts`**

Currently, the code only processes the FIRST time block per day. Update to handle multiple blocks:

```typescript
// For each date, iterate ALL time blocks (not just first)
const dayTimeBlocks = state.dayTimeOverrides?.[dateStr] || [];
const blocksToProcess = dayTimeBlocks.length > 0 
  ? dayTimeBlocks 
  : [{ id: 'base', startTime: baseTimeStart, endTime: baseTimeEnd }];

for (const block of blocksToProcess) {
  const blockInstructorId = block.instructorId ?? state.instructorId;
  
  ticketItems.push({
    // ... other fields
    time_start: block.startTime,
    time_end: block.endTime,
    instructor_id: blockInstructorId,
  });
}
```

This creates separate `ticket_items` for each time block on days with multiple blocks.

---

### Phase 4: Visual Design Updates

**Colors and Styling:**
- Default state: `bg-muted/30 border-muted`
- Override state: `bg-amber-50/50 border-amber-300`
- Warning badges: Orange text with AlertTriangle icon

**Block Labels:**
- "Zeitblock 1", "Zeitblock 2", etc.
- Clear visual separation between blocks

**Responsive Behavior:**
- Stack time/instructor dropdowns vertically on mobile
- Full-width buttons on small screens

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/BookingWizardContext.tsx` | Add `instructorId` to `TimeBlock`, update functions |
| `src/components/bookings/wizard/PeriodDayPlanner.tsx` | Complete UI redesign per wireframe |
| `src/hooks/useCreateBooking.ts` | Handle multiple blocks per day |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Pass new props to PeriodDayPlanner |

---

## Data Structure Example

After implementation, selecting Mon 10-12, Tue 14-16, Wed 10-12 + 14-16 (with different instructor):

```json
{
  "baseInstructorId": "instructor-max-mustermann",
  "baseStartTime": "10:00",
  "baseEndTime": "12:00",
  "dayTimeOverrides": {
    "2025-02-10": [
      { 
        "id": "tb-1", 
        "startTime": "14:00", 
        "endTime": "16:00",
        "instructorId": null 
      }
    ],
    "2025-02-11": [
      { 
        "id": "tb-2", 
        "startTime": "10:00", 
        "endTime": "12:00",
        "instructorId": null 
      },
      { 
        "id": "tb-3", 
        "startTime": "14:00", 
        "endTime": "16:00",
        "instructorId": "instructor-anna-schmidt" 
      }
    ]
  }
}
```

---

## Testing Checklist

- [ ] Add a second time block to a day - verify it appears with defaults
- [ ] Change instructor on one block - verify "Abweichend" indicator appears
- [ ] Change time on one block - verify "Abweichend" indicator appears
- [ ] Remove a time block - verify it disappears (cannot remove last block)
- [ ] Multi-select in mini-scheduler with different times - verify correct blocks created
- [ ] Complete booking with multiple blocks - verify all ticket_items created correctly
- [ ] Verify mobile responsive layout

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Data Model | 0.5 days |
| Phase 2: UI Redesign | 1.5 days |
| Phase 3: Booking Logic | 0.5 days |
| Phase 4: Visual Polish | 0.5 days |
| **Total** | **3 days** |
