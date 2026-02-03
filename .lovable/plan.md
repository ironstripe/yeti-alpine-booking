
# Add Recurring Absences to Scheduler + Fix Navigation

## Overview

Add tabs to the scheduler's absence creation dialog for both one-time and recurring absences, and improve navigation from absence blocks to show the specific absence detail.

## Changes

### 1. Enhance AbsenceTypeDialog with Tabs

**File:** `src/components/scheduler/AbsenceTypeDialog.tsx`

Add a tabbed interface:
- **Tab 1: "Einmalig"** - Current one-time absence form (existing functionality)
- **Tab 2: "Wiederkehrend"** - Recurring block form (adapted from RecurringBlockDialog)

The recurring tab will include:
- Time window selection (start/end time)
- Weekday selection (with quick buttons: All, Mo-Fr, Weekend)
- Validity period (from/until dates)
- Reason field
- Conflict checking via `check_recurring_block_conflicts` RPC

### 2. Fix Navigation from Absence Blocks

**File:** `src/components/scheduler/AbsenceDetailDialog.tsx`

Change the "Bearbeiten" button behavior:
- For **one-time absences**: Navigate to `/instructors/:id?absences=open&absenceId=:absenceId`
- For **recurring blocks**: Navigate to `/instructors/:id` with recurring tab focused

**File:** `src/components/instructors/detail/AbsenceRequestCard.tsx`

Add support for `absenceId` URL parameter:
- When `absenceId` is present, highlight/scroll to that specific absence entry
- Auto-open the edit dialog for that absence

### 3. Update BlockingBar for Recurring Block Click

**File:** `src/components/scheduler/BlockingBar.tsx`

For recurring blocks (id starts with `recurring-`):
- Extract the actual block ID from the absence ID
- Navigate to instructor page with recurring section focused

## Technical Details

### New Imports in AbsenceTypeDialog
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { 
  useCreateRecurringBlock, 
  useRecurringBlockConflicts 
} from "@/hooks/useRecurringBlocks";
```

### State for Recurring Tab
```tsx
const [activeTab, setActiveTab] = useState<"one-time" | "recurring">("one-time");
const [recurringStartTime, setRecurringStartTime] = useState("12:00");
const [recurringEndTime, setRecurringEndTime] = useState("13:00");
const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
const [validFrom, setValidFrom] = useState(today);
const [validUntil, setValidUntil] = useState("");
const [recurringReason, setRecurringReason] = useState("");
```

### AbsenceRequestCard Enhancement
```tsx
// In useEffect, check for absenceId param
const absenceIdToHighlight = searchParams.get("absenceId");
useEffect(() => {
  if (absenceIdToHighlight) {
    setIsHistoryOpen(true);
    // Find and open edit dialog for this absence
    const targetAbsence = absenceHistory.find(a => a.id === absenceIdToHighlight);
    if (targetAbsence) {
      setEditingAbsence(targetAbsence);
    }
  }
}, [absenceIdToHighlight, absenceHistory]);
```

## UI Structure

```
+------------------------------------------+
| Abwesenheit eintragen/beantragen         |
+------------------------------------------+
| [Einmalig] [Wiederkehrend]               | <- Tabs
+------------------------------------------+
| (Content based on active tab)            |
+------------------------------------------+
| [Abbrechen]        [Antrag senden]       |
+------------------------------------------+
```

## Result

- Users can create both one-time and recurring absences directly from the scheduler
- Clicking an absence block and then "Bearbeiten" navigates to the instructor page with that specific absence highlighted and ready to edit
- Consistent experience between scheduler and instructor page
