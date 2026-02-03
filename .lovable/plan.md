
# Enable Inline Editing for Absence Blocks in Scheduler

## Problem

When clicking on an unavailability (absence) block in the scheduler, the user expects to be able to edit/move it directly. Currently, clicking only navigates away to the instructor profile page.

## Solution

Add an inline edit dialog for absence blocks in the scheduler, similar to how `BookingDetailDialog` works for private bookings. This allows editing absences directly without leaving the scheduler view.

## Implementation

### 1. Create `AbsenceDetailDialog` Component

**File:** `src/components/scheduler/AbsenceDetailDialog.tsx`

A new dialog that opens when clicking an absence block, showing:
- Absence type (vacation, sick, etc.)
- Date range
- Time range (if partial day)
- Reason
- Status (pending/confirmed)
- Edit and Delete buttons

### 2. Update `BlockingBar.tsx`

**Changes:**
- Add state for dialog open/close
- Replace navigation onClick with dialog open
- Import and render the new `AbsenceDetailDialog`
- Keep navigation as a secondary action inside the dialog

### 3. Create Absence Edit Flow

**Option A (Simple):** Dialog with "Edit in Profile" button that navigates to instructor detail
**Option B (Full):** Inline edit form within the dialog

**Recommended:** Option A for now - simpler and reuses existing edit logic

## Technical Details

### File: `src/components/scheduler/AbsenceDetailDialog.tsx` (new)

```typescript
interface AbsenceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  absence: SchedulerAbsence;
}

export function AbsenceDetailDialog({ open, onOpenChange, absence }: AbsenceDetailDialogProps) {
  const navigate = useNavigate();
  const deleteAbsence = useDeleteAbsence();
  
  // Show absence details
  // Actions: Edit (navigate), Delete (with confirmation)
}
```

### File: `src/components/scheduler/BlockingBar.tsx` (update)

```diff
+ import { useState } from "react";
+ import { AbsenceDetailDialog } from "./AbsenceDetailDialog";

export function BlockingBar({ absence, slotWidth }: BlockingBarProps) {
+ const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
-   navigate(`/instructors/${absence.instructorId}?absences=open`);
+   // Don't open dialog for recurring blocks (they're expanded from rules)
+   if (absence.id.startsWith("recurring-")) {
+     navigate(`/instructors/${absence.instructorId}?absences=open`);
+   } else {
+     setIsDetailOpen(true);
+   }
  };

  return (
    <>
      {/* existing tooltip/bar code */}
+     <AbsenceDetailDialog
+       open={isDetailOpen}
+       onOpenChange={setIsDetailOpen}
+       absence={absence}
+     />
    </>
  );
}
```

## Dialog Features

1. **View Mode:**
   - Type with icon (Urlaub, Krank, etc.)
   - Date range display
   - Time range (if partial day)
   - Reason (if provided)
   - Status badge (pending/confirmed)

2. **Actions:**
   - **Edit:** Navigate to instructor profile with absences expanded
   - **Delete:** With confirmation dialog (only for confirmed absences or pending created by user)
   - **Close:** Dismiss dialog

3. **Recurring Block Handling:**
   - Recurring blocks (IDs starting with "recurring-") navigate directly to profile
   - They cannot be edited individually - must edit the recurring rule

## User Flow After Implementation

1. Click on absence block in scheduler
2. Dialog opens with absence details
3. User can:
   - View details
   - Click "Bearbeiten" → Goes to instructor profile
   - Click "Löschen" → Confirmation → Delete absence
   - Close dialog → Return to scheduler

## Constraints

- Recurring block instances cannot be edited individually
- Only the original absence record can be deleted (not expanded recurring instances)
- Pending absences may have different delete permissions based on user role
