
# Edit Office Hours Blocks in Scheduler

## Overview

Add the ability to click on an existing office hour block in the scheduler to view details, edit (date/time/note), or delete it.

## User Flow

1. Click on a purple "Bürodienst" block in scheduler
2. Detail dialog opens showing current date, time, and note
3. User can:
   - **Edit**: Adjust date, time range, and note inline
   - **Delete**: Remove the block with confirmation
4. Changes save immediately and update scheduler

## Technical Implementation

### 1. Hook: Add Update Mutation (`src/hooks/useOfficeHourBlocks.ts`)

Add `useUpdateOfficeHourBlock` mutation:

```typescript
interface UpdateOfficeHourBlockData {
  id: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  note?: string | null;
}

export function useUpdateOfficeHourBlock() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: UpdateOfficeHourBlockData) => {
      const { id, ...updates } = data;
      const { data: result, error } = await supabase
        .from("office_hour_blocks")
        .update({
          date: updates.date,
          time_start: updates.timeStart,
          time_end: updates.timeEnd,
          note: updates.note,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-hour-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks"] });
      toast.success("Bürodienst aktualisiert");
    },
  });
}
```

### 2. New Component: `OfficeHoursDetailDialog.tsx`

Create a detail/edit dialog similar to `AbsenceDetailDialog`:

**Features:**
- Display current date, time range, and note
- Toggle into "edit mode" to modify fields
- Date picker for changing the date
- Time dropdowns for start/end
- Note textarea
- Delete button with confirmation

**Structure:**
```tsx
export function OfficeHoursDetailDialog({
  open,
  onOpenChange,
  block, // { id, date, timeStart, timeEnd, note }
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState(block.date);
  const [editTimeStart, setEditTimeStart] = useState(block.timeStart);
  const [editTimeEnd, setEditTimeEnd] = useState(block.timeEnd);
  const [editNote, setEditNote] = useState(block.note);
  
  // View mode: show info + Edit/Delete buttons
  // Edit mode: show form fields + Save/Cancel buttons
}
```

### 3. Update `BookingBar.tsx`

Add click handler for `office_shift` type:

```tsx
const [isOfficeDetailOpen, setIsOfficeDetailOpen] = useState(false);

const handleClick = (e: React.MouseEvent) => {
  if (!isDragging) {
    e.stopPropagation();
    
    if (isGroup) {
      navigate(`/trainings/capacity?course=${booking.ticketId}`);
    } else if (isPrivate) {
      setIsDetailOpen(true);
    } else if (isOfficeShift) {
      setIsOfficeDetailOpen(true); // NEW
    }
  }
};

// Add dialog for office shifts
{isOfficeShift && (
  <OfficeHoursDetailDialog
    open={isOfficeDetailOpen}
    onOpenChange={setIsOfficeDetailOpen}
    block={{
      id: booking.id.replace('office-block-', ''),
      date: booking.date,
      timeStart: booking.timeStart,
      timeEnd: booking.timeEnd,
      note: booking.participantName !== "Bürodienst" ? booking.participantName : null,
    }}
  />
)}
```

Update tooltip hint:
```tsx
isOfficeShift ? "Klicken zum Bearbeiten" : "..."
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useOfficeHourBlocks.ts` | Edit | Add `useUpdateOfficeHourBlock` mutation |
| `src/components/scheduler/OfficeHoursDetailDialog.tsx` | Create | View/edit/delete dialog |
| `src/components/scheduler/BookingBar.tsx` | Edit | Add click handler + dialog for office shifts |

## Expected Result

After implementation:
1. Click on purple Bürodienst block → Detail dialog opens
2. View mode shows date, time, note with Edit/Delete buttons
3. Edit mode allows changing date (via date picker), time range, and note
4. Delete with confirmation dialog
5. Changes reflect immediately in scheduler via query invalidation
