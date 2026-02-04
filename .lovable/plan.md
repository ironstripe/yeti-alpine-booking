
# Remove "Anträge" Button from Scheduler Header

## Change

Remove the `PendingAbsencesList` component (the "Anträge" button) that currently appears next to the header.

## File to Modify

**`src/components/scheduler/SchedulerGrid.tsx`**

Remove lines 506-507:
```tsx
// DELETE THESE LINES:
{/* Admin: Show Pending Absences Button */}
{isAdminOrOffice && <PendingAbsencesList />}
```

Also remove the unused import at line 16:
```tsx
// DELETE THIS IMPORT:
import { PendingAbsencesList } from "./PendingAbsencesList";
```

## Result

The header will only contain:
```
[<][Date][>][🎯] [Tag][3T][Woche] [🔍] [⚙️] [Alle|Gruppen|Privat]
```

The "Anträge" button will be removed. The `PendingAbsencesList` component file itself remains in case it's needed elsewhere.
