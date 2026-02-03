
# Office Hours Planning Feature

## Overview

Add a new "Bürodienst" (Office Hours) action to the scheduler that allows office staff to be scheduled for specific time slots. Unlike absences which block availability, office hours indicate when someone IS working in the office.

## Current State

- **Absences**: Block time slots, meaning "NOT available"
- **Office Shifts**: Currently managed via `group_course_instances` with `is_internal = true`, requiring complex setup through the Trainings page
- **User Need**: Simple, direct scheduling of office hours in the scheduler with hour-level precision (e.g., 09:00-10:00)

## Proposed Solution

### User Flow

1. Select time slot(s) for an office staff member in scheduler
2. Click new "Bürodienst" button in SelectionToolbar
3. Dialog opens with:
   - Time display (pre-filled from selection)
   - Optional note/reason field
   - "Ganztägig" toggle (like absences)
   - Custom time picker when not full-day
4. On confirm, creates office hour block
5. Block appears in scheduler with distinct styling (purple/gray)

### Visual Design

- **Color**: Purple (`bg-purple-600`) - already defined for `office_shift` type in `scheduler-utils.ts`
- **Icon**: Building/Office icon to distinguish from absences
- **Tooltip**: Shows "Bürodienst" with time range and optional note

## Technical Implementation

### 1. Database: New Table `office_hour_blocks`

```sql
CREATE TABLE office_hour_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for efficient queries
CREATE INDEX idx_office_hour_blocks_instructor_date 
  ON office_hour_blocks(instructor_id, date);

-- RLS policies for admin/office access
ALTER TABLE office_hour_blocks ENABLE ROW LEVEL SECURITY;
```

### 2. New Hook: `useOfficeHourBlocks.ts`

```typescript
// Fetch office hour blocks for date range
export function useOfficeHourBlocks(startDate: string, endDate: string) {...}

// Create new office hour block
export function useCreateOfficeHourBlock() {...}

// Delete office hour block
export function useDeleteOfficeHourBlock() {...}
```

### 3. Update `useSchedulerData.ts`

- Add query for `office_hour_blocks` table
- Transform into `SchedulerBooking[]` with `type: "office_shift"`
- Merge with other bookings for display

### 4. New Component: `OfficeHoursDialog.tsx`

Similar to `AbsenceTypeDialog.tsx` but simplified:
- Date/time display (from selection)
- Full-day toggle
- Time pickers (when not full-day)
- Optional note field
- Create button

### 5. Update `SelectionToolbar.tsx`

Add new "Bürodienst" button:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleMarkOfficeHours}
>
  <Building className="h-4 w-4 mr-1" />
  Bürodienst
</Button>
```

### 6. Update `BlockingBar.tsx` / `BookingBar.tsx`

Ensure office hour blocks render with correct styling:
- Purple background (`bg-purple-600`)
- Building icon
- "Bürodienst" label in tooltip

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/*_office_hour_blocks.sql` | Create | Database table + RLS |
| `src/hooks/useOfficeHourBlocks.ts` | Create | CRUD operations |
| `src/components/scheduler/OfficeHoursDialog.tsx` | Create | Creation dialog |
| `src/components/scheduler/SelectionToolbar.tsx` | Edit | Add "Bürodienst" button |
| `src/hooks/useSchedulerData.ts` | Edit | Fetch & display office hours |
| `src/lib/scheduler-utils.ts` | Edit | Add type definitions if needed |

## Interaction with Existing Features

- **Absences**: Office hours and absences cannot overlap (validation)
- **Bookings**: Office hours block time for teaching (shown as occupied)
- **Recurring Blocks**: Office hours are one-time; use existing recurring system for regular schedules

## Expected Result

After implementation:
1. Office staff members can have office hours scheduled directly in scheduler
2. Office hours appear as purple blocks with clear visual distinction
3. Time can be specified precisely (e.g., 09:00-10:00 on specific date)
4. Blocks prevent double-booking of that time slot
5. Simple workflow: Select → Click "Bürodienst" → Confirm
