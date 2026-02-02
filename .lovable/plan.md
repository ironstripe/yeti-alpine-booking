

# Consolidate Training Management

## Current Problem

Two separate features do almost the same thing:

| Feature | Access | Functionality |
|---------|--------|---------------|
| Training Instanzen | Kurse → Card → "Instanzen" | View week, assign instructor per day |
| Wochenplanung | Trainings → Wochenplanung tab | View all courses, assign instructors, copy week |

This confuses users and creates maintenance overhead.

---

## Solution: Remove Instanzen, Enhance Wochenplanung

**Keep** Wochenplanung as the single source for instructor assignment.

**Simplify** TrainingCard actions to:
- Bearbeiten (edit course template)
- Duplizieren (copy course)
- Löschen (delete course)
- **Kapazität** (direct link to capacity planning filtered by this course)

---

## Changes

### 1. TrainingCard - Replace "Instanzen" with "Kapazität"

```text
BEFORE:                          AFTER:
[Bearbeiten] [Kopie] [Instanzen] [Löschen]    [Bearbeiten] [Kopie] [Kapazität] [Löschen]
```

The "Kapazität" button navigates to `/trainings/capacity?course={courseId}` to show only that course's capacity.

### 2. GroupCapacityPlanning - Add Course Filter

Add URL parameter support to filter capacity view to a single course when navigating from a training card.

### 3. Delete Unused Files

| File | Reason |
|------|--------|
| `src/pages/TrainingDetail.tsx` | No longer needed |
| `src/components/trainings/TrainingInstancesView.tsx` | Replaced by Wochenplanung |
| Route `/trainings/:id` in App.tsx | Remove |

### 4. Wochenplanung - Add Notification Confirmation

When changing instructor via `DailyAssignmentModal`, show confirmation dialog if participants exist (migrate feature from removed TrainingInstancesView).

---

## File Changes

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/components/trainings/TrainingCard.tsx` | Replace "Instanzen" with "Kapazität" link |
| MODIFY | `src/pages/Trainings.tsx` | Remove onViewInstances handler |
| MODIFY | `src/pages/GroupCapacityPlanning.tsx` | Add course filter from URL param |
| MODIFY | `src/components/planning/DailyAssignmentModal.tsx` | Add notification confirmation |
| MODIFY | `src/App.tsx` | Remove `/trainings/:id` route |
| DELETE | `src/pages/TrainingDetail.tsx` | Unused |
| DELETE | `src/components/trainings/TrainingInstancesView.tsx` | Replaced by Wochenplanung |

---

## Updated User Flow

```text
Trainings Page:
┌─────────────────────────────────────────────────────────┐
│ [Kurse]  [Wochenplanung]  [Kapazität]                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Kurse Tab:                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ Blue Prince         │  │ Blue King           │      │
│  │ 5-7 J. • Mo-Fr     │  │ 6-8 J. • Mo-Fr     │      │
│  │ [Bearbeiten][Kapazität][Löschen]            │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│  Wochenplanung Tab:                                     │
│  → Assign instructors to all courses for the week      │
│  → Bulk assign, copy from previous week                │
│                                                         │
│  Kapazität Tab:                                         │
│  → Split/merge groups, add assistants                  │
│  → Can be filtered to single course via card link      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits

1. **No redundancy** - One place for instructor assignment (Wochenplanung)
2. **Direct access** - Each course card links directly to its capacity management
3. **Simpler mental model** - Kurse = templates, Wochenplanung = assignments, Kapazität = group management
4. **Less code** - 2 files deleted, fewer routes to maintain

