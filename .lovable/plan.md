
# UX & Workflow Improvements for YETI Trainings Module

## Overview

This plan implements four UX improvements to the Trainings section: terminology clarity, auto-save in the daily assignment modal, split group validation, and a new dashboard alert for unassigned groups.

---

## Task 1: Update Terminology for Clarity

**Goal:** Rename "Kurse" tab to "Kursvorlagen" (Course Templates)

### Changes

**File:** `src/components/trainings/TrainingsLayout.tsx`

- Line 8: Change `title: "Kurse"` to `title: "Kursvorlagen"`
- Line 43: Update description from "Verwalte Gruppenkurse..." to "Verwalte Kursvorlagen, Lehrerzuweisungen und Kapazität"

```tsx
const trainingTabs = [
  { title: "Kursvorlagen", url: "/trainings", icon: Package },
  // ... rest unchanged
];
```

---

## Task 2: Auto-Save in Daily Assignment Modal

**Goal:** Remove explicit save button, implement auto-save with visual feedback per row

### Current Behavior
- Modal has a "Schliessen" button that closes without saving
- `handleInstanceAssign` already calls `assignInstructor.mutateAsync()` immediately

### Key Insight
The current implementation **already auto-saves** - each dropdown change triggers the mutation. We just need to add:
1. Per-row loading/success/error indicators
2. Keep the "Schliessen" button (it just closes the dialog)

### Changes

**File:** `src/components/planning/DailyAssignmentModal.tsx`

**Add state for tracking save status per instance:**
```tsx
const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'success' | 'error'>>({});
```

**Modify `performAssignment` to update status:**
```tsx
const performAssignment = async (instanceId: string, instructorId: string | null, isAssistant: boolean) => {
  setSaveStatus(prev => ({ ...prev, [instanceId]: 'saving' }));
  try {
    await assignInstructor.mutateAsync({ instanceId, instructorId, isAssistant });
    queryClient.invalidateQueries({ queryKey: ['group-planning', format(weekStart, 'yyyy-MM-dd')] });
    setSaveStatus(prev => ({ ...prev, [instanceId]: 'success' }));
    // Clear success status after 2 seconds
    setTimeout(() => {
      setSaveStatus(prev => {
        const next = { ...prev };
        delete next[instanceId];
        return next;
      });
    }, 2000);
  } catch (error) {
    setSaveStatus(prev => ({ ...prev, [instanceId]: 'error' }));
    toast.error('Fehler beim Speichern');
  }
};
```

**Add status indicator after participant count (per row):**
```tsx
import { Loader2, Check, AlertCircle } from 'lucide-react';

// Inside each row, after the participant count div
{saveStatus[instance.id] === 'saving' && (
  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
)}
{saveStatus[instance.id] === 'success' && (
  <Check className="h-4 w-4 text-green-500" />
)}
{saveStatus[instance.id] === 'error' && (
  <AlertCircle className="h-4 w-4 text-red-500" />
)}
```

**Keep footer simple (just close button):**
```tsx
<DialogFooter className="mt-4">
  <Button variant="outline" onClick={() => onOpenChange(false)}>
    Schliessen
  </Button>
</DialogFooter>
```

---

## Task 3: Validation in Split Group Modal

**Goal:** Disable "Speichern" button until all groups have an instructor assigned

### Changes

**File:** `src/components/group-capacity/SplitGroupDialog.tsx`

**Add validation check:**
```tsx
// After splitGroups state initialization
const allGroupsHaveInstructor = splitGroups.every(
  group => group.instructorId !== null && group.instructorId !== 'none'
);
```

**Disable save button conditionally (line 331):**
```tsx
<Button 
  onClick={handleSave} 
  disabled={splitMutation.isPending || !allGroupsHaveInstructor}
>
  {splitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Speichern
</Button>
```

**Add helper text when invalid:**
```tsx
{!allGroupsHaveInstructor && (
  <p className="text-sm text-amber-600">
    Alle Gruppen müssen einen Lehrer zugewiesen haben.
  </p>
)}
```

---

## Task 4: Dashboard Alert for Unassigned Groups

**Goal:** Show an alert on dashboard when any group for the current/next week has no instructor

### Approach
Create a query-based check (no background job needed - data is checked on dashboard load/refresh)

### Changes

**New Hook File:** `src/hooks/useUnassignedGroupsCheck.ts`

```tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, addWeeks, getISOWeek } from 'date-fns';

export interface UnassignedGroupInfo {
  courseId: string;
  courseName: string;
  weekStart: string;
  weekNumber: number;
  unassignedDays: number;
}

export function useUnassignedGroupsCheck() {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const nextWeekStart = addWeeks(currentWeekStart, 1);
  
  return useQuery({
    queryKey: ['unassigned-groups-check'],
    queryFn: async (): Promise<UnassignedGroupInfo[]> => {
      const currentWeekStr = format(currentWeekStart, 'yyyy-MM-dd');
      const nextWeekEnd = format(endOfWeek(nextWeekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      // Get all instances for current and next week with null instructor
      const { data: unassigned, error } = await supabase
        .from('group_course_instances')
        .select(`
          id,
          date,
          course_id,
          course:course_id(id, name, is_active, course_type)
        `)
        .gte('date', currentWeekStr)
        .lte('date', nextWeekEnd)
        .is('instructor_id', null);
      
      if (error) throw error;
      
      // Group by course and week
      const grouped = new Map<string, UnassignedGroupInfo>();
      
      for (const inst of unassigned || []) {
        const course = inst.course as any;
        if (!course?.is_active || course.course_type !== 'weekly') continue;
        
        const instDate = new Date(inst.date);
        const instWeekStart = startOfWeek(instDate, { weekStartsOn: 1 });
        const weekStr = format(instWeekStart, 'yyyy-MM-dd');
        const key = `${inst.course_id}-${weekStr}`;
        
        if (grouped.has(key)) {
          grouped.get(key)!.unassignedDays++;
        } else {
          grouped.set(key, {
            courseId: inst.course_id,
            courseName: course.name,
            weekStart: weekStr,
            weekNumber: getISOWeek(instWeekStart),
            unassignedDays: 1,
          });
        }
      }
      
      return Array.from(grouped.values());
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
```

**Modify File:** `src/components/dashboard/ActionRequiredBox.tsx`

**Add unassigned groups to the action items:**

```tsx
import { Users2 } from 'lucide-react';
import { useUnassignedGroupsCheck } from '@/hooks/useUnassignedGroupsCheck';
import { format, parseISO } from 'date-fns';

// Inside component
const { data: unassignedGroups } = useUnassignedGroupsCheck();
const unassignedGroupCount = unassignedGroups?.length || 0;

// Add to actionItems array
{
  icon: Users2,
  label: "Gruppen ohne Lehrer",
  count: unassignedGroupCount,
  onClick: () => {
    // Navigate to first unassigned group's week
    if (unassignedGroups && unassignedGroups.length > 0) {
      const firstGroup = unassignedGroups[0];
      navigate(`/trainings/planning?week=${firstGroup.weekStart}`);
    } else {
      navigate("/trainings/planning");
    }
  },
  color: "text-orange-600",
},

// Update total calculation
const total = actions
  ? actions.overduePayments + actions.unassignedInstructors + 
    actions.pendingConfirmations + unassignedGroupCount
  : 0;
```

**Modify File:** `src/pages/GroupCoursePlanning.tsx`

**Add URL parameter support for week navigation:**

```tsx
import { useSearchParams } from 'react-router-dom';

// Inside component
const [searchParams] = useSearchParams();
const weekParam = searchParams.get('week');

const [currentWeek, setCurrentWeek] = useState(() => {
  if (weekParam) {
    return parseISO(weekParam);
  }
  return startOfWeek(new Date(), { weekStartsOn: 1 });
});
```

---

## Summary of Files to Modify

| File | Task |
|------|------|
| `src/components/trainings/TrainingsLayout.tsx` | Task 1 - Rename tab |
| `src/components/planning/DailyAssignmentModal.tsx` | Task 2 - Auto-save feedback |
| `src/components/group-capacity/SplitGroupDialog.tsx` | Task 3 - Validation |
| `src/hooks/useUnassignedGroupsCheck.ts` (new) | Task 4 - Query hook |
| `src/components/dashboard/ActionRequiredBox.tsx` | Task 4 - Dashboard alert |
| `src/pages/GroupCoursePlanning.tsx` | Task 4 - URL week param |

---

## Technical Notes

- **Task 2:** The current implementation already auto-saves on dropdown change. We're only adding visual feedback.
- **Task 4:** Uses a query-based approach instead of a cron job - data freshness is controlled via `staleTime` and `refetchInterval` (30s/60s), matching the existing dashboard pattern.
- **Task 4:** Clicking the alert navigates to `/trainings/planning?week=YYYY-MM-DD` which opens the planning view at the correct week.
