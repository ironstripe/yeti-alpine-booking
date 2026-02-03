
# Add Edit & Delete Actions for Absence Entries

## Problem

The absence history entries in the instructor detail view are read-only. Users need the ability to edit or delete existing absences directly from this view.

## Solution

Add edit and delete buttons to each absence entry in the history list, with an edit dialog to modify absence details.

## Implementation

### File: `src/hooks/useInstructorAbsences.ts`

**Add new `useUpdateAbsence` mutation:**

```typescript
interface UpdateAbsenceParams {
  absenceId: string;
  startDate?: string;
  endDate?: string;
  type?: AbsenceType;
  reason?: string;
  isFullDay?: boolean;
  timeStart?: string;
  timeEnd?: string;
}

export function useUpdateAbsence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ absenceId, ...updates }: UpdateAbsenceParams) => {
      const { error } = await supabase
        .from("instructor_absences")
        .update({
          start_date: updates.startDate,
          end_date: updates.endDate,
          type: updates.type,
          reason: updates.reason,
          is_full_day: updates.isFullDay,
          time_start: updates.isFullDay ? null : updates.timeStart,
          time_end: updates.isFullDay ? null : updates.timeEnd,
        })
        .eq("id", absenceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      queryClient.invalidateQueries({ queryKey: ["instructor-absence-history"] });
      toast.success("Abwesenheit aktualisiert");
    },
    onError: (error) => {
      console.error("Failed to update absence:", error);
      toast.error("Fehler beim Aktualisieren der Abwesenheit");
    },
  });
}
```

### File: `src/components/instructors/detail/AbsenceRequestCard.tsx`

**Changes:**

1. **Import additional components:**
   - Import `useDeleteAbsence`, `useUpdateAbsence` hooks
   - Import `Pencil`, `Trash2` icons from lucide-react
   - Import `Dialog` components for edit modal
   - Import `AlertDialog` for delete confirmation

2. **Add state for edit dialog:**
```typescript
const [editingAbsence, setEditingAbsence] = useState<AbsenceHistoryItem | null>(null);
```

3. **Add action buttons to each history entry:**
```tsx
{absenceHistory.map((absence) => (
  <div key={absence.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
    <div className="space-y-1">
      {/* existing content */}
    </div>
    {/* NEW: Action buttons */}
    <div className="flex items-center gap-1">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => setEditingAbsence(absence)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abwesenheit löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteAbsence.mutate(absence.id)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
))}
```

4. **Add edit dialog:**
```tsx
<Dialog open={!!editingAbsence} onOpenChange={(open) => !open && setEditingAbsence(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Abwesenheit bearbeiten</DialogTitle>
    </DialogHeader>
    {/* Reuse similar form fields from create form */}
    {/* Pre-populate with editingAbsence data */}
  </DialogContent>
</Dialog>
```

## Changes Summary

| File | Change |
|------|--------|
| `useInstructorAbsences.ts` | Add `useUpdateAbsence` mutation hook |
| `AbsenceRequestCard.tsx` | Add edit/delete buttons, edit dialog, delete confirmation |

## UI Preview

Each absence entry will have:
- Pencil icon button -> Opens edit dialog
- Trash icon button -> Shows confirmation dialog before deleting

The edit dialog reuses the same form fields as the create form, pre-populated with the existing absence data.

## Technical Notes

- Delete uses existing `useDeleteAbsence` hook
- Update invalidates both scheduler and history query caches
- AlertDialog provides safe delete confirmation
- Edit dialog closes and resets state on successful update
- Pending absences can be edited/deleted by the instructor who created them
- Confirmed absences can only be edited/deleted by admin/office users (RLS handles this)
