

# Period Bookings with Overrides and Automatic Notifications

## Current Architecture vs. Proposed

**Current State**: Each day of a multi-day booking is a separate `ticket_item` row with its own `date`, `time_start`, `time_end`, and `instructor_id`.

**Challenge**: The request assumes period-based storage (single row with `start_date`/`end_date`), but the current schema is day-based.

**Recommended Approach**: Add a **period grouping mechanism** to link related daily bookings, rather than fundamentally changing the storage model.

---

## Phase 1: Database Schema Changes

### 1.1 Add Period Grouping Column to `ticket_items`

```sql
-- Add period_group_id to link related days of a multi-day booking
ALTER TABLE ticket_items
ADD COLUMN period_group_id UUID,
ADD COLUMN is_period_override BOOLEAN DEFAULT FALSE;

-- Index for efficient period lookups
CREATE INDEX idx_ticket_items_period_group ON ticket_items(period_group_id) WHERE period_group_id IS NOT NULL;
```

**Purpose**: When booking Mon-Fri, all 5 `ticket_item` rows share the same `period_group_id`. An override row has `is_period_override = true`.

### 1.2 Create `ticket_item_period_metadata` Table

```sql
CREATE TABLE ticket_item_period_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_group_id UUID NOT NULL UNIQUE,
  base_instructor_id UUID REFERENCES instructors(id),
  base_time_start TIME NOT NULL,
  base_time_end TIME NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_period_metadata_dates ON ticket_item_period_metadata(start_date, end_date);
```

**Purpose**: Stores the "base" configuration for a period (original instructor, times, date range).

### 1.3 Add Confirmation Tracking

```sql
-- Add confirmation tracking to ticket_items (already has instructor_confirmed_at)
ALTER TABLE ticket_items
ADD COLUMN IF NOT EXISTS confirmation_reset_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_reset_reason TEXT;
```

---

## Phase 2: Scheduler Rendering Updates

### 2.1 Update `useSchedulerData` Hook

Modify `src/hooks/useSchedulerData.ts` to:

1. Fetch period metadata alongside bookings
2. Mark bookings that are part of a period
3. Identify which days have overrides (different instructor/time than base)

```typescript
// Enhanced SchedulerBooking type
export interface SchedulerBooking {
  // ... existing fields ...
  
  // Period-related fields
  isPartOfPeriod: boolean;
  periodGroupId?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  periodTotalDays?: number;
  isOverride?: boolean; // This day differs from base
  baseInstructorId?: string;
  baseTimeStart?: string;
  baseTimeEnd?: string;
}
```

### 2.2 Visual Indicator for Period Blocks

Add a subtle visual indicator (e.g., small chain icon or connected border) on blocks that are part of a multi-day period.

---

## Phase 3: Period Modification Dialog

### 3.1 Create `PeriodModificationDialog` Component

**New File**: `src/components/scheduler/PeriodModificationDialog.tsx`

```tsx
interface PeriodModificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: SchedulerBooking;
  newSlot: {
    date: string;
    timeStart: string;
    timeEnd: string;
    instructorId: string;
  };
  onConfirm: (
    scope: "single_day" | "entire_period",
    notifyCustomer: boolean
  ) => void;
}
```

**Features**:
- Shows period info (start-end dates, total days)
- Radio selection: "Only this day" vs "Entire period"
- Lists affected instructors (old removed, new assigned)
- Checkbox to notify customer (default: checked)

### 3.2 Integrate into Drag-and-Drop Flow

Update `SchedulerGrid.tsx` `handleBookingDrop`:

```typescript
const handleBookingDrop = (booking, newInstructorId, newDate, newTimeSlot) => {
  // ... existing validation ...

  // Check if part of a period
  if (booking.isPartOfPeriod) {
    // Show PeriodModificationDialog instead of BookingChangeConfirmDialog
    setPendingPeriodChange({ booking, newInstructorId, newDate, newTimeSlot });
    setShowPeriodDialog(true);
    return;
  }

  // ... existing single-day flow ...
};
```

---

## Phase 4: Backend Logic

### 4.1 Create `usePeriodModification` Hook

**New File**: `src/hooks/usePeriodModification.ts`

```typescript
interface PeriodModificationParams {
  bookingId: string;
  periodGroupId: string;
  scope: "single_day" | "entire_period";
  newDate?: string;
  newTimeStart?: string;
  newTimeEnd?: string;
  newInstructorId?: string;
  notifyCustomer: boolean;
}

export function usePeriodModification() {
  return useMutation({
    mutationFn: async (params: PeriodModificationParams) => {
      if (params.scope === "single_day") {
        // Update only this ticket_item
        // Mark it as an override if instructor/time changed
        await supabase.from("ticket_items").update({
          instructor_id: params.newInstructorId,
          time_start: params.newTimeStart,
          time_end: params.newTimeEnd,
          is_period_override: true,
          // Reset confirmation if instructor changed
          instructor_confirmed_at: null,
          confirmation_reset_at: new Date().toISOString(),
          confirmation_reset_reason: "single_day_change",
        }).eq("id", params.bookingId);
      } else {
        // Update ALL ticket_items in the period
        await supabase.from("ticket_items").update({
          instructor_id: params.newInstructorId,
          time_start: params.newTimeStart,
          time_end: params.newTimeEnd,
          instructor_confirmed_at: null,
          confirmation_reset_at: new Date().toISOString(),
          confirmation_reset_reason: "period_change",
        }).eq("period_group_id", params.periodGroupId);

        // Update period metadata
        await supabase.from("ticket_item_period_metadata").update({
          base_instructor_id: params.newInstructorId,
          base_time_start: params.newTimeStart,
          base_time_end: params.newTimeEnd,
        }).eq("period_group_id", params.periodGroupId);
      }

      // Send notifications
      if (params.notifyCustomer) {
        await supabase.functions.invoke("send-period-change-notification", {
          body: params,
        });
      }
    },
  });
}
```

---

## Phase 5: Notifications

### 5.1 New Email Templates

Add to `email_templates` table:

| Trigger | Name | Purpose |
|---------|------|---------|
| `private_lesson.single_day_changed` | Einzelner Tag geändert | Customer notification for single-day override |
| `private_lesson.period_changed` | Periode geändert | Customer notification for entire period change |
| `instructor.assignment_removed` | Zuweisung entfernt | Instructor removed from booking |
| `instructor.assignment_added` | Zuweisung hinzugefügt | Instructor assigned to booking |

### 5.2 Create/Update Edge Function

Update `supabase/functions/send-notification/index.ts` to handle period-related triggers.

---

## Phase 6: Booking Wizard Integration

When creating a multi-day booking:

1. Generate a `period_group_id` (UUID)
2. Create one `ticket_item` per day, all sharing the same `period_group_id`
3. Create one `ticket_item_period_metadata` row with base configuration

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Add `period_group_id`, `is_period_override`, create metadata table |
| `src/lib/scheduler-utils.ts` | Edit | Add period-related fields to `SchedulerBooking` |
| `src/hooks/useSchedulerData.ts` | Edit | Fetch and join period metadata |
| `src/components/scheduler/PeriodModificationDialog.tsx` | Create | Scope selection dialog |
| `src/components/scheduler/SchedulerGrid.tsx` | Edit | Integrate period dialog |
| `src/hooks/usePeriodModification.ts` | Create | Backend mutation logic |
| `src/components/scheduler/BookingBar.tsx` | Edit | Add visual indicator for period blocks |
| `supabase/functions/send-notification/index.ts` | Edit | Handle new triggers |

---

## Implementation Order

1. **Database migration** - Add columns and create metadata table
2. **Type updates** - Add period fields to `SchedulerBooking`
3. **Data loading** - Update `useSchedulerData` to fetch period info
4. **Visual indicator** - Show which blocks are part of a period
5. **Period dialog** - Create `PeriodModificationDialog`
6. **Backend hook** - Create `usePeriodModification`
7. **Integration** - Wire up drag-and-drop to use period dialog
8. **Notifications** - Add email templates and edge function updates
9. **Booking wizard** - Generate `period_group_id` for multi-day bookings

---

## Key Design Decisions

1. **Grouping over Period Storage**: Keep existing per-day rows but link them via `period_group_id`. This preserves backwards compatibility and allows granular per-day handling.

2. **Override Flag**: `is_period_override = true` marks days that differ from the base configuration, making it easy to identify exceptions.

3. **Metadata Table**: Stores the "original" period configuration, enabling comparisons and bulk resets.

4. **Confirmation Reset**: Any change to a confirmed booking clears `instructor_confirmed_at` and logs the reason.

5. **Opt-Out Notifications**: Customer notification defaults to ON but can be unchecked.

