
# Plan: Office Staff Training Management

## Summary

Extend the existing training system to support office shift planning. Office trainings will be managed from the same Trainings page using a category toggle. Multiple staff members can be assigned equally (no lead/assistant distinction) to the same office shift. Time slots will support both fixed presets and custom times.

---

## Current State Analysis

### Existing Infrastructure
| Component | Status |
|-----------|--------|
| `trainings` table | Has `training_type` (group/camp/office) and `is_internal` columns |
| `group_courses` table | Primary table for trainings, missing office support columns |
| `group_course_instances` | Supports `instructor_id` + `assistant_instructor_id` (needs multi-assignment) |
| Scheduler | Already filters by role, shows gray blocks for office/internal |
| TrainingFormModal | Only supports `weekly` and `saturday_course` types |

### Key Insight
The `group_courses` table is the active training system (not `trainings` table which appears legacy). We need to extend `group_courses` to support office trainings with:
- `course_type = 'office'` 
- Multi-staff assignment via a new join table
- Flexible scheduling (Mon-Sun, half/full day)

---

## Database Changes

### 1. Extend group_courses Table

```sql
-- Add office-specific columns
ALTER TABLE group_courses 
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Update constraint to allow 'office' as course_type
-- The existing course_type column already allows any text
```

### 2. Create Multi-Assignment Table

For equal staff assignment (no lead/assistant distinction):

```sql
CREATE TABLE public.office_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(instance_id, instructor_id)
);

-- Enable RLS
ALTER TABLE office_shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage office_shift_assignments"
ON public.office_shift_assignments FOR ALL
USING (true) WITH CHECK (true);

CREATE INDEX idx_office_shift_assignments_instance 
ON office_shift_assignments(instance_id);

CREATE INDEX idx_office_shift_assignments_instructor 
ON office_shift_assignments(instructor_id);
```

### 3. Seed Default Office Trainings

```sql
INSERT INTO group_courses (
  name, description, discipline, min_age, max_age, 
  max_participants, price_per_day, course_type, is_internal, color
) VALUES 
  ('Büro Vormittag', 'Office shift morning', 'ski', 18, 99, 10, 0, 'office', true, '#6B7280'),
  ('Büro Nachmittag', 'Office shift afternoon', 'ski', 18, 99, 10, 0, 'office', true, '#6B7280'),
  ('Büro Ganztag', 'Office shift full day', 'ski', 18, 99, 10, 0, 'office', true, '#6B7280');
```

---

## UI Changes

### 1. Trainings Page - Category Tabs

Add a tab switcher to toggle between "Kurse" (courses) and "Intern" (office):

```text
┌─────────────────────────────────────────────────────────────────┐
│ Trainings                                              [+ Neu]  │
├─────────────────────────────────────────────────────────────────┤
│ [Kurse] [Intern]                                                │
│  ━━━━━                                                          │
├─────────────────────────────────────────────────────────────────┤
│ [Search...] [Disziplin ▼] [Status ▼]                            │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│ │ Büro AM      │ │ Büro PM      │ │ Büro Ganztag │              │
│ │ 09:00-12:00  │ │ 13:00-17:00  │ │ 09:00-17:00  │              │
│ │ Mo-Fr        │ │ Mo-Fr        │ │ Mo-Fr        │              │
│ └──────────────┘ └──────────────┘ └──────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**Files to modify:**
- `src/pages/Trainings.tsx` - Add category state + tabs
- `src/components/trainings/TrainingsFilters.tsx` - Add category filter

### 2. Training Form Modal - Office Mode

When course_type = 'office':
- Hide age fields (not relevant for office)
- Hide product linkage (internal, no price)
- Hide "Next Training" progression
- Show office-specific schedule options

```text
┌─────────────────────────────────────────────────────────────────┐
│ Neue interne Schicht erstellen                            [X]  │
├─────────────────────────────────────────────────────────────────┤
│ Kurstyp:                                                        │
│ ○ Wöchentlich  ○ Samstagskurs  ● Büro/Intern                   │
├─────────────────────────────────────────────────────────────────┤
│ Name: [Büro Vormittag                    ]                      │
│                                                                 │
│ Zeitfenster:                                                    │
│ [Vormittag ▼]  oder  [Benutzerdefiniert ▼]                     │
│ Von: [09:00]  Bis: [12:00]                                      │
│                                                                 │
│ Wochentage:                                                     │
│ [Mo] [Di] [Mi] [Do] [Fr] [Sa] [So]                              │
│  ✓    ✓    ✓    ✓    ✓    ○    ○                               │
│                                                                 │
│ Max. Personen: [5]                                              │
│ Farbe: [Grau ●]                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Abbrechen] [Speichern]            │
└─────────────────────────────────────────────────────────────────┘
```

**Files to modify:**
- `src/components/trainings/TrainingFormModal.tsx` - Add office mode logic
- `src/types/group-courses.ts` - Add 'office' to CourseType

### 3. Training Card - Office Variant

Office trainings display differently:

```text
┌──────────────────────────────────────┐
│ ▓▓ Büro Vormittag                    │
│ ─────────────────────────────────    │
│ [Intern] [Grau]                      │
│                                      │
│ 📅 Mo-Fr                             │
│ 🕐 09:00 - 12:00                     │
│ 👥 Max. 5 Mitarbeiter                │
│                                      │
│ Diese Woche: 3/5 besetzt             │
│ ████████░░░░░                        │
│                                      │
│ [Bearbeiten] [Instanzen]             │
└──────────────────────────────────────┘
```

**Files to modify:**
- `src/components/trainings/TrainingCard.tsx` - Conditional rendering for office type

### 4. Instance View - Multi-Staff Assignment

For office trainings, show a multi-select for staff assignment instead of single instructor:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Büro Vormittag - Woche 5 (27.01 - 02.02.2026)                   │
├─────────────────────────────────────────────────────────────────┤
│        │ Mo 27.01 │ Di 28.01 │ Mi 29.01 │ Do 30.01 │ Fr 31.01 │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Besetzung │ Graf M. │ Graf M. │ Müller S.│ Graf M. │ [+]      │
│           │ Huber T.│         │ Huber T. │          │          │
└─────────────────────────────────────────────────────────────────┘

[+ Mitarbeiter hinzufügen] opens a multi-select popover:
┌─────────────────────────┐
│ ☐ Graf, Michaela       │
│ ☐ Huber, Thomas        │
│ ☑ Müller, Stefan       │
│ ☐ Weber, Anna          │
│                         │
│ [Zuweisen]              │
└─────────────────────────┘
```

**Files to modify/create:**
- `src/pages/TrainingDetail.tsx` - Add office training support
- `src/components/trainings/OfficeStaffAssignment.tsx` - **NEW** multi-select component

---

## Scheduler Integration

### Display Office Shifts

Office shifts will appear in the scheduler using the existing gray color scheme:

```text
Instructor Row:
┌──────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Graf M. 🏢   │ 09   10 │ 11   12 │ 13   14 │ 15   16 │         │
│              │ ████████│█████████│         │         │         │
│              │ Büro VM │         │         │         │         │
└──────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Files to modify:**
- `src/hooks/useSchedulerData.ts` - Fetch office shift assignments
- `src/lib/scheduler-utils.ts` - Already has `office_shift` type support

---

## Data Flow

```text
                    ┌──────────────────┐
                    │   group_courses  │
                    │ (course_type =   │
                    │    'office')     │
                    └────────┬─────────┘
                             │
                             ▼
               ┌─────────────────────────────┐
               │  group_course_schedules     │
               │  (days: Mo-Su, times)       │
               └─────────────┬───────────────┘
                             │
                             ▼
               ┌─────────────────────────────┐
               │  group_course_instances     │
               │  (specific date + times)    │
               └─────────────┬───────────────┘
                             │
                             ▼
               ┌─────────────────────────────┐
               │  office_shift_assignments   │
               │  (multiple instructors      │
               │   per instance)             │
               └─────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database Schema
1. Add `is_internal` column to `group_courses`
2. Create `office_shift_assignments` table
3. Seed default office trainings

### Phase 2: Types & Hooks
1. Update `src/types/group-courses.ts` - Add 'office' to CourseType, add is_internal flag
2. Create `src/hooks/useOfficeShiftAssignments.ts` - CRUD for multi-assignment

### Phase 3: Training Management UI
1. Update `Trainings.tsx` - Add category tabs (Kurse/Intern)
2. Update `TrainingsFilters.tsx` - Filter by is_internal
3. Update `TrainingFormModal.tsx` - Office mode with preset/custom times
4. Update `TrainingCard.tsx` - Office variant display

### Phase 4: Instance Management
1. Create `OfficeStaffAssignment.tsx` - Multi-select staff component
2. Update `TrainingDetail.tsx` - Handle office instance assignment

### Phase 5: Scheduler Integration
1. Update `useSchedulerData.ts` - Fetch office assignments
2. Verify gray block display for office shifts

---

## Technical Notes

### Time Slot Presets
```typescript
const OFFICE_TIME_PRESETS = [
  { value: 'morning', label: 'Vormittag', start: '09:00', end: '12:00' },
  { value: 'afternoon', label: 'Nachmittag', start: '13:00', end: '17:00' },
  { value: 'fullday', label: 'Ganztag', start: '09:00', end: '17:00' },
  { value: 'custom', label: 'Benutzerdefiniert', start: null, end: null },
] as const;
```

### Office Training Validation
- `is_internal = true` automatically when `course_type = 'office'`
- No product linkage required (internal use)
- Age fields hidden (default to 18-99)
- All weekdays selectable (Mon-Sun)

### Equal Assignment vs Lead/Assistant
For office shifts, all assigned staff have equal status. This differs from group courses which have `instructor_id` + `assistant_instructor_id`. The new `office_shift_assignments` table handles this pattern.

---

## Files Summary

| Action | File |
|--------|------|
| **CREATE** | `supabase/migrations/[timestamp]_office_trainings.sql` |
| **CREATE** | `src/hooks/useOfficeShiftAssignments.ts` |
| **CREATE** | `src/components/trainings/OfficeStaffAssignment.tsx` |
| **MODIFY** | `src/types/group-courses.ts` |
| **MODIFY** | `src/pages/Trainings.tsx` |
| **MODIFY** | `src/components/trainings/TrainingsFilters.tsx` |
| **MODIFY** | `src/components/trainings/TrainingFormModal.tsx` |
| **MODIFY** | `src/components/trainings/TrainingCard.tsx` |
| **MODIFY** | `src/pages/TrainingDetail.tsx` |
| **MODIFY** | `src/hooks/useSchedulerData.ts` |
| **MODIFY** | `src/hooks/useGroupCourses.ts` |
