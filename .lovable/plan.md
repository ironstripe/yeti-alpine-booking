
# Group Leader Management Feature

## Overview

This plan implements a comprehensive Group Leader Management feature for the YETY Instructor Portal, enabling instructors assigned to group courses to manage their participants directly. The feature includes attendance tracking, skill level updates, and participant notes.

---

## Architecture Analysis

### Existing Data Model

The current system uses this relationship chain for group courses:
```text
group_courses
    └── group_course_instances (per date/time)
            └── group_course_enrollments (per participant per instance)
                    └── customer_participants (participant details)
```

**Key Tables:**
- `group_courses`: Defines course templates (name, skill level, schedule)
- `group_course_instances`: Specific date/time occurrences of a course with `instructor_id`
- `group_course_enrollments`: Links participants to instances with `attendance_status` (registered, present, absent, cancelled)
- `customer_participants`: Participant details including `current_ski_level_id`

**Important Finding:** The `group_course_enrollments` table already has an `attendance_status` column that can be used for daily attendance tracking, eliminating the need for a separate `group_attendance` table.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useGroupLeaderData.ts` | Create | Hook to fetch group course details with participants |
| `src/hooks/useUpdateAttendance.ts` | Create | Mutation hook for attendance updates |
| `src/hooks/useUpdateParticipantLevel.ts` | Create | Mutation hook for skill level updates |
| `src/hooks/useUpdateParticipantNotes.ts` | Create | Mutation hook for notes updates |
| `src/pages/InstructorGroupManagement.tsx` | Create | Group management page |
| `src/components/instructor-portal/ParticipantManagementCard.tsx` | Create | Card for managing individual participants |
| `src/components/instructor-portal/AttendanceGrid.tsx` | Create | Visual attendance grid for the course period |
| `src/components/instructor-portal/SkillLevelSelect.tsx` | Create | Skill level selector component |
| `src/components/instructor-portal/LessonCard.tsx` | Modify | Add "Gruppe verwalten" button for group courses |
| `src/hooks/useInstructorPortalData.ts` | Modify | Add group course instance info to PortalLesson |
| `src/App.tsx` | Modify | Add route for `/instructor/group/:instanceId` |
| `src/components/instructor-portal/InstructorLayout.tsx` | Modify | Add page title case for group management |

---

## Technical Implementation

### 1. Extend PortalLesson Type

Add group course instance information to identify when a lesson is part of a group course:

```typescript
// src/hooks/useInstructorPortalData.ts
export interface PortalLesson {
  // ... existing fields
  groupCourseInstanceId: string | null;  // NEW
  groupCourseId: string | null;          // NEW
  groupCourseName: string | null;        // NEW
}
```

The query will be extended to join `group_course_enrollments` and `group_course_instances` to retrieve this information.

### 2. Create useGroupLeaderData Hook

```typescript
// src/hooks/useGroupLeaderData.ts

interface GroupParticipant {
  id: string;
  firstName: string;
  lastName: string | null;
  birthDate: string;
  age: number;
  currentSkiLevelId: string | null;
  currentSnowboardLevelId: string | null;
  notes: string | null;
  attendance: {
    date: string;
    instanceId: string;
    status: 'registered' | 'present' | 'absent' | 'cancelled';
    enrollmentId: string;
  }[];
}

interface GroupLeaderData {
  courseId: string;
  courseName: string;
  discipline: string;
  skillLevel: string;
  meetingPoint: string | null;
  periodStart: string;
  periodEnd: string;
  instances: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  }[];
  participants: GroupParticipant[];
}
```

**Query Strategy:**
1. Fetch the `group_course_instance` by ID
2. Get the `group_course` details via `course_id`
3. Get all instances in the course period where `instructor_id` matches current instructor
4. Fetch all `group_course_enrollments` for those instances with participant details
5. Aggregate by participant to build the attendance history

### 3. Create Mutation Hooks

**useUpdateAttendance:**
```typescript
// Updates group_course_enrollments.attendance_status
{
  enrollmentId: string;
  status: 'present' | 'absent';
}
```

**useUpdateParticipantLevel:**
```typescript
// Updates customer_participants.current_ski_level_id or current_snowboard_level_id
{
  participantId: string;
  discipline: 'ski' | 'snowboard';
  levelId: string;
}
```

**useUpdateParticipantNotes:**
```typescript
// Updates group_course_enrollments.notes (specific to this enrollment/course)
{
  enrollmentId: string;
  notes: string;
}
```

### 4. LessonCard Modification

Add detection logic for group courses and a navigation button:

```typescript
// Detect group course from productType
const isGroupCourse = ['group_kids', 'group_adults'].includes(lesson.productType);

// Inside expanded content, add:
{isGroupCourse && lesson.groupCourseInstanceId && (
  <Button
    variant="default"
    className="w-full mt-4"
    onClick={() => navigate(`/instructor/group/${lesson.groupCourseInstanceId}`)}
  >
    <Users className="h-4 w-4 mr-2" />
    Gruppe verwalten
  </Button>
)}
```

### 5. ParticipantManagementCard Component

Mobile-first card for each participant:

```text
┌─────────────────────────────────────────────────────────┐
│ [Avatar] Max Müller                                     │
│          8 Jahre · Blauer Prinz                      ▼  │
├─────────────────────────────────────────────────────────┤
│ ANWESENHEIT                                             │
│ ┌─────┬─────┬─────┬─────┬─────┐                        │
│ │ Mo  │ Di  │ Mi  │ Do  │ Fr  │                        │
│ │ ✓   │ ✓   │ ○   │ ○   │ ○   │                        │
│ └─────┴─────┴─────┴─────┴─────┘                        │
├─────────────────────────────────────────────────────────┤
│ ERREICHTES LEVEL                                        │
│ [Select: Blauer Prinz / Roter Prinz / ...]          ▼  │
├─────────────────────────────────────────────────────────┤
│ NOTIZEN                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Macht gute Fortschritte...                          │ │
│ └─────────────────────────────────────────────────────┘ │
│ [Speichern]                                             │
└─────────────────────────────────────────────────────────┘
```

Features:
- Collapsible for mobile (shows name + quick attendance status when collapsed)
- Checkboxes for each day's attendance
- Skill level dropdown (uses `useAllSkillLevels` hook, filtered by discipline)
- Notes textarea with save button
- Optimistic updates with rollback on error

### 6. InstructorGroupManagement Page

```text
┌─────────────────────────────────────────────────────────┐
│ ← Zurück                              [Treffpunkt: ...] │
├─────────────────────────────────────────────────────────┤
│ BLAUER PRINZ                                            │
│ 27. Jan - 31. Jan 2025 · 5 Teilnehmer                  │
├─────────────────────────────────────────────────────────┤
│ ZUSAMMENFASSUNG                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Heute anwesend: 4/5                                 │ │
│ │ Woche: Mo✓ Di✓ Mi○ Do○ Fr○                         │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ TEILNEHMER                                              │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ParticipantManagementCard #1                      │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ParticipantManagementCard #2                      │   │
│ └───────────────────────────────────────────────────┘   │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

Structure:
- Header with back button and meeting point
- Course info (name, date range, participant count)
- Summary card (today's attendance, week overview)
- List of ParticipantManagementCard components
- Uses `InstructorLayout` wrapper

### 7. Routing Update

```typescript
// src/App.tsx - Add in Instructor Portal Routes section
<Route path="/instructor/group/:instanceId" element={<InstructorGroupManagement />} />
```

Also update `InstructorLayout.tsx` getPageTitle:
```typescript
if (location.pathname.startsWith("/instructor/group/")) {
  return "Gruppe verwalten";
}
```

---

## Data Fetching Strategy

### Finding Participants for a Group Course Instance

Since `group_course_enrollments` links `instance_id` to `participant_id`, the query path is:

```text
1. Given: instanceId (from URL)
2. Fetch group_course_instances where id = instanceId
3. Get course_id and instructor_id (verify access)
4. Fetch all instances for the same course_id in the date range
5. Fetch all enrollments for those instances with participant details
6. Group by participant to create attendance history
```

```sql
-- Pseudocode for the main query
SELECT 
  gce.id as enrollment_id,
  gce.instance_id,
  gce.participant_id,
  gce.attendance_status,
  gce.notes as enrollment_notes,
  gci.date,
  gci.start_time,
  gci.end_time,
  cp.*
FROM group_course_enrollments gce
JOIN group_course_instances gci ON gci.id = gce.instance_id
JOIN customer_participants cp ON cp.id = gce.participant_id
WHERE gci.course_id = :courseId
  AND gci.instructor_id = :currentInstructorId
ORDER BY gci.date, cp.first_name
```

---

## Authorization & Security

**RLS Consideration:** The existing RLS policies on `group_course_enrollments` are currently basic. We need to ensure instructors can only:
1. View enrollments for instances they're assigned to
2. Update attendance status for those enrollments
3. Update notes on those enrollments

The frontend will verify `gci.instructor_id = currentInstructorId` before showing data. For additional security, RLS policies could be added:

```sql
-- Example (to be added if needed)
CREATE POLICY "Instructors can update their course enrollments"
ON group_course_enrollments
FOR UPDATE
USING (
  instance_id IN (
    SELECT id FROM group_course_instances
    WHERE instructor_id = (SELECT id FROM instructors WHERE email = auth.email())
  )
);
```

---

## German Translations

| English | German |
|---------|--------|
| Manage Group | Gruppe verwalten |
| Participants | Teilnehmer |
| Attendance | Anwesenheit |
| Present | Anwesend |
| Absent | Abwesend |
| Skill Level | Erreicht Level |
| Notes | Notizen |
| Save | Speichern |
| Save Notes | Notizen speichern |
| Back | Zurück |
| Today | Heute |
| This Week | Diese Woche |
| Meeting Point | Treffpunkt |
| years old | Jahre |
| participants | Teilnehmer |

---

## Implementation Sequence

1. **Phase 1: Data Layer**
   - Create `useGroupLeaderData` hook
   - Create mutation hooks (attendance, level, notes)
   - Extend `PortalLesson` type with group course info

2. **Phase 2: UI Components**
   - Create `ParticipantManagementCard` component
   - Create `AttendanceGrid` component
   - Create `SkillLevelSelect` component

3. **Phase 3: Page & Navigation**
   - Create `InstructorGroupManagement` page
   - Modify `LessonCard` to add "Gruppe verwalten" button
   - Add route to `App.tsx`
   - Update `InstructorLayout` page title

4. **Phase 4: Testing**
   - Test with existing group course data
   - Verify attendance updates persist
   - Verify skill level updates work
   - Test authorization (instructor can only see their groups)

---

## Edge Cases to Handle

1. **No Enrollments Yet**: Show empty state with message "Keine Teilnehmer angemeldet"
2. **Course Already Ended**: Show read-only view with past attendance data
3. **Single Day Course**: Adjust attendance grid layout
4. **Variable Course Length**: Support 3-day, 5-day, Saturday courses
5. **Missing Skill Level Data**: Show "Unbekannt" with option to set
6. **Instructor Not Assigned**: Show 403 error if accessing someone else's group

---

## Performance Considerations

1. **Query Optimization**: Single query with joins rather than multiple round trips
2. **Optimistic Updates**: Immediate UI feedback for attendance toggles
3. **Cache Keys**: Include `instanceId` in query keys for proper invalidation
4. **Stale Time**: 30 seconds for group data (may change during the day)
