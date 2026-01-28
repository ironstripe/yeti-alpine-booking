# Refactor group_courses Skill Level to Foreign Key

## Status: ✅ COMPLETED

Migration completed on 2026-01-28. The `group_courses` table now uses `skill_level_id` as a foreign key to `skill_levels` instead of the legacy `skill_level` text column.

---

## Summary of Changes

### Database Migration
- Added foreign key constraint `group_courses_skill_level_id_fkey` on `skill_level_id` → `skill_levels.id`
- Made `skill_level_id` NOT NULL
- Dropped the legacy `skill_level` TEXT column
- Created performance index `idx_group_courses_skill_level_id`

### TypeScript Changes

| File | Changes |
|------|---------|
| `src/types/group-courses.ts` | Removed `skill_level` field, made `skill_level_id` required, removed `SKILL_LEVELS` constant |
| `src/hooks/useGroupCourses.ts` | Removed `skill_level` from insert/update operations |
| `src/lib/skill-levels.ts` | Removed `mapSkillLevelToGroupCourseSkill` function |
| `src/lib/level-utils.ts` | Updated `mapLevelToCourseSkill` to work without the removed function |
| `src/components/trainings/TrainingCard.tsx` | Uses `getSkillLevelLabel(course.skill_level_id)` |
| `src/components/trainings/TrainingFormModal.tsx` | Updated form schema, removed legacy skill_level field |
| `src/components/trainings/TrainingsFilters.tsx` | Uses `useAllSkillLevels` hook instead of `SKILL_LEVELS` constant |
| `src/pages/Trainings.tsx` | Uses `skill_level_id` for filtering |
| `src/components/bookings/wizard/GroupSelector.tsx` | Uses `skill_level_id` in queries and matching |
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Uses `skill_level_id` in queries and matching |

---

## Impact

### Frontend Forms
Training creation/edit forms now use the full skill level selector from `skill_levels` table (filtered by discipline and target group).

### Course Matching Logic
Participant-to-course matching now uses direct `skill_level_id` comparison:
```typescript
// Direct match
const matchingCourse = courses.find(c => c.skill_level_id === participant.current_ski_level_id);
```

### Backwards Compatibility
The `mapLevelToCourseSkill` function in `level-utils.ts` is kept for legacy level strings but marked as deprecated.
