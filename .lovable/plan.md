

# Group Capacity Management System

## Overview

This feature allows office staff to manage group course capacity 1-2 days before a course week starts by:
1. **Splitting** overbooked groups into multiple groups
2. **Merging** underbooked groups across levels
3. **Moving** participants between groups/levels
4. **Adding assistant instructors** to overbooked groups as an alternative to splitting

---

## Current Architecture

The existing system works as follows:
- `group_courses` - Defines training levels (Blue Prince, Red Star, etc.)
- `group_course_instances` - Daily instances per course per week
- `group_course_enrollments` - Links participants to instances

**Gap**: Currently, all participants for a training level in a week are in ONE group. There's no way to have "Blue Prince 1" and "Blue Prince 2" when capacity is exceeded.

---

## Phase 1: Database Schema

### 1.1 New Table: `training_groups`

This table introduces the concept of sub-groups within a training level for a specific week.

```sql
CREATE TABLE training_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES group_courses(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  group_number INTEGER DEFAULT 1,
  custom_name TEXT,
  
  instructor_id UUID REFERENCES instructors(id),
  assistant_instructor_id UUID REFERENCES instructors(id),
  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'merged', 'cancelled')),
  merged_into_group_id UUID REFERENCES training_groups(id),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(course_id, week_start, group_number)
);

CREATE INDEX idx_training_groups_week ON training_groups(week_start);
CREATE INDEX idx_training_groups_course ON training_groups(course_id);
```

### 1.2 Modify `group_course_enrollments`

Add link to training group:

```sql
ALTER TABLE group_course_enrollments 
  ADD COLUMN training_group_id UUID REFERENCES training_groups(id),
  ADD COLUMN original_course_id UUID REFERENCES group_courses(id);
```

The `original_course_id` tracks where a participant came from when merged across levels.

### 1.3 Add `min_participants` to `group_courses`

```sql
ALTER TABLE group_courses 
  ADD COLUMN IF NOT EXISTS min_participants INTEGER DEFAULT 4;
```

---

## Phase 2: Backend Functions

### 2.1 RPC: `generate_training_groups_for_week`

Creates default Group 1 for each course with enrollments.

```sql
CREATE OR REPLACE FUNCTION generate_training_groups_for_week(p_week_start DATE)
RETURNS jsonb AS $$
DECLARE
  course_record RECORD;
  group_id UUID;
  groups_created INTEGER := 0;
BEGIN
  FOR course_record IN 
    SELECT DISTINCT gc.id as course_id
    FROM group_courses gc
    JOIN group_course_instances gci ON gci.course_id = gc.id
    WHERE gci.date >= p_week_start 
      AND gci.date < p_week_start + INTERVAL '7 days'
      AND gc.course_type = 'weekly'
      AND gc.is_active = true
  LOOP
    -- Create group 1 if not exists
    INSERT INTO training_groups (course_id, week_start, group_number)
    VALUES (course_record.course_id, p_week_start, 1)
    ON CONFLICT (course_id, week_start, group_number) DO NOTHING
    RETURNING id INTO group_id;
    
    IF group_id IS NOT NULL THEN
      groups_created := groups_created + 1;
      
      -- Assign enrollments to this group
      UPDATE group_course_enrollments e
      SET training_group_id = group_id
      FROM group_course_instances i
      WHERE e.instance_id = i.id
        AND i.course_id = course_record.course_id
        AND i.date >= p_week_start 
        AND i.date < p_week_start + INTERVAL '7 days'
        AND e.training_group_id IS NULL;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('status', 'success', 'groups_created', groups_created);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2.2 RPC: `split_training_group`

Creates new group(s) and moves specified participants.

### 2.3 RPC: `merge_training_groups`

Moves all participants from source groups to target, marks sources as 'merged'.

### 2.4 RPC: `move_participant_to_group`

Moves a single participant between groups (including cross-level).

---

## Phase 3: Frontend Components

### 3.1 New Page: Group Capacity Planning

**Route**: `/trainings/capacity` or extend existing `/trainings/planning`

| File | Purpose |
|------|---------|
| `src/pages/GroupCapacityPlanning.tsx` | Main page |
| `src/hooks/useGroupCapacityData.ts` | Fetch groups with capacity info |
| `src/hooks/useGroupCapacityMutations.ts` | Split/merge/move mutations |

### 3.2 UI Structure

```text
+--------------------------------------------------+
| Kapazitätsplanung           [Week Selector] [Gen]|
+--------------------------------------------------+
| ⚠️ 2 überbucht · 3 unterbelegt                    |
+--------------------------------------------------+

ÜBERBUCHTE GRUPPEN
+--------------------------------------------------+
| 🔵 Blue Prince         15/13 TN    [████████+]   |
| Max Muster                [Hilfslehrer] [Aufteilen]|
+--------------------------------------------------+

UNTERBELEGTE GRUPPEN  
+--------------------------------------------------+
| 🔴 Red Star            3/8 TN (Min: 5) [████---]  |
| Anna Lehrer                      [Zusammenlegen] |
+--------------------------------------------------+

ALLE GRUPPEN (Table View)
| Kurs | Gruppe | TN | Min | Max | Lehrer | Status |
```

### 3.3 Split Dialog Component

**File**: `src/components/group-capacity/SplitGroupDialog.tsx`

Features:
- Shows all participants from overbooked group
- Drag & drop between group columns using `@dnd-kit`
- "Nach Alter verteilen" quick action
- Instructor assignment per new group
- Custom group name input

```text
┌─────────────────────────────────────────────────────┐
│ Blue Prince aufteilen                          [X]  │
├─────────────────────────────────────────────────────┤
│ 15 Teilnehmer auf 2 Gruppen verteilen (max 13/Gr.) │
│                                                     │
│ [Nach Alter verteilen] [+ Gruppe]                   │
│                                                     │
│ ┌─────────────┐  ┌─────────────┐                   │
│ │ Blue Prince │  │ Blue Prince │                   │
│ │      1      │  │      2      │                   │
│ ├─────────────┤  ├─────────────┤                   │
│ │ [Lehrer ▼]  │  │ [Lehrer ▼]  │                   │
│ ├─────────────┤  ├─────────────┤                   │
│ │ ▢ Max (8J)  │  │ ▢ Anna (7J) │                   │
│ │ ▢ Tim (9J)  │  │ ▢ Lisa (6J) │                   │
│ │ ▢ Lea (8J)  │  │             │                   │
│ │    ...      │  │             │                   │
│ ├─────────────┤  ├─────────────┤                   │
│ │ 8/13 TN     │  │ 7/13 TN     │                   │
│ └─────────────┘  └─────────────┘                   │
├─────────────────────────────────────────────────────┤
│                       [Abbrechen] [Speichern]       │
└─────────────────────────────────────────────────────┘
```

### 3.4 Merge Dialog Component

**File**: `src/components/group-capacity/MergeGroupsDialog.tsx`

Features:
- Multi-select underbooked groups
- Choose target (existing or new mixed group)
- Shows combined participant count
- Instructor selection

### 3.5 Add Assistant Dialog

**File**: `src/components/group-capacity/AddAssistantDialog.tsx`

Simple dialog to assign an assistant instructor instead of splitting.

---

## Phase 4: Data Flow

### 4.1 Hook: `useGroupCapacityData`

```typescript
interface GroupCapacityInfo {
  id: string;                    // training_groups.id
  courseId: string;
  courseName: string;
  courseColor: string;
  groupNumber: number;
  customName: string | null;
  weekStart: string;
  
  participantCount: number;
  minParticipants: number;
  maxParticipants: number;
  
  instructorId: string | null;
  instructorName: string | null;
  assistantId: string | null;
  assistantName: string | null;
  
  status: 'active' | 'merged' | 'cancelled';
  capacityStatus: 'ok' | 'overbooked' | 'underbooked';
  
  participants: GroupParticipant[];
}
```

### 4.2 Mutation Hooks

```typescript
// useGroupCapacityMutations.ts

export function useSplitGroup() {
  // Input: { sourceGroupId, newGroups: [{ participants, instructorId, customName }] }
  // Calls: split_training_group RPC
}

export function useMergeGroups() {
  // Input: { sourceGroupIds, targetType, targetGroupId | newGroupName, instructorId }
  // Calls: merge_training_groups RPC
}

export function useMoveParticipant() {
  // Input: { participantId, fromGroupId, toGroupId }
  // Calls: move_participant_to_group RPC
}

export function useAssignAssistant() {
  // Input: { groupId, assistantInstructorId }
  // Updates: training_groups.assistant_instructor_id
}
```

---

## Phase 5: Integration Points

### 5.1 Navigation

Add to `AppSidebar.tsx` navItems:
```typescript
{ title: "Kapazität", url: "/trainings/capacity", icon: Users2 }
```

### 5.2 Route

Add to `App.tsx`:
```typescript
<Route path="trainings/capacity" element={<GroupCapacityPlanning />} />
```

### 5.3 Instructor Portal

Update `InstructorGroupManagement.tsx` to use `training_groups` instead of just course instances when fetching participant data.

---

## Phase 6: Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| **CREATE** | `src/pages/GroupCapacityPlanning.tsx` | Main planning page |
| **CREATE** | `src/hooks/useGroupCapacityData.ts` | Fetch capacity data |
| **CREATE** | `src/hooks/useGroupCapacityMutations.ts` | Split/merge/move mutations |
| **CREATE** | `src/components/group-capacity/GroupCapacityCard.tsx` | Card with capacity bar |
| **CREATE** | `src/components/group-capacity/SplitGroupDialog.tsx` | Split dialog with dnd |
| **CREATE** | `src/components/group-capacity/MergeGroupsDialog.tsx` | Merge selection dialog |
| **CREATE** | `src/components/group-capacity/AddAssistantDialog.tsx` | Assistant assignment |
| **CREATE** | `src/components/group-capacity/ParticipantDragItem.tsx` | Draggable participant |
| **CREATE** | `src/components/group-capacity/GroupDropZone.tsx` | Drop zone for split |
| **MODIFY** | `src/App.tsx` | Add route |
| **MODIFY** | `src/components/layout/AppSidebar.tsx` | Add nav item |
| **MODIFY** | `src/hooks/useGroupLeaderData.ts` | Use training_groups |

### Database Migrations

1. Create `training_groups` table
2. Add columns to `group_course_enrollments`
3. Add `min_participants` to `group_courses`
4. Create RPC functions
5. Add RLS policies

---

## Phase 7: Business Rules

| Rule | Implementation |
|------|----------------|
| Groups only affect selected week | Filter by `week_start` |
| Minimum 2 groups to merge | UI validation |
| Merged groups marked 'merged' | Status field, not deleted |
| Original course tracked | `original_course_id` for reporting |
| Late bookings warning | Check if groups already exist for week |
| Instructors can only redistribute own groups | RLS + instructor_id check |

---

## Estimated Effort

| Phase | Components | Estimate |
|-------|------------|----------|
| Database schema | 1 table, 3 columns, 4 RPCs | Medium |
| Backend RPCs | 4 functions | Medium |
| Capacity page | 1 page + hooks | Medium |
| Split dialog | Drag-drop UI | High |
| Merge dialog | Multi-select UI | Medium |
| Integration | Nav, routes, instructor portal | Low |

**Total**: Large feature requiring multiple implementation steps

---

## UI Text (German)

- "Kapazitätsplanung" - Page title
- "Aufteilen" - Split button
- "Zusammenlegen" - Merge button
- "Hilfslehrer hinzufügen" - Add assistant
- "Nach Alter verteilen" - Distribute by age
- "Überbucht" - Overbooked
- "Unterbelegt" - Underbooked
- "Teilnehmer" / "TN" - Participants

