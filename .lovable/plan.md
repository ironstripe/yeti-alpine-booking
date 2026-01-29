

# Plan: Simplify Group Course Data Model - Trainings ARE Skill Levels

## Overview

This change eliminates the unnecessary abstraction where trainings (group courses) have a separate `skill_level_id` field pointing to skill levels. For children's group courses, **the training itself IS the skill level**. We'll remove this redundant mapping and add a direct `next_training_id` field for progression.

---

## Current Architecture Problem

```text
Current (redundant):
┌─────────────────┐     FK      ┌──────────────────┐
│  group_courses  │ ────────>  │   skill_levels   │
│  - skill_level_id│            │ (child levels)   │
│  - name: "Blauer│            │ - name: "Blauer  │
│    Prinz"       │            │   Prinz/Prinzessin"│
└─────────────────┘            └──────────────────┘

Proposed (simplified):
┌─────────────────┐     FK      ┌─────────────────┐
│  group_courses  │ ────────>  │  group_courses  │
│  - name: "Blauer│  (self-ref) │  (next level)   │
│    Prinz"       │            └─────────────────┘
│  - next_training_id           
│  - sort_order   │
└─────────────────┘

Participants:
- current_ski_training_id → group_courses.id (child's current level)
- self_assessed_ski_level → 'green'|'blue'|'red'|'black' (adults only)
```

---

## Database Changes

### 1. Alter `group_courses` table

```sql
-- Remove the redundant skill_level_id column
ALTER TABLE group_courses DROP COLUMN IF EXISTS skill_level_id;

-- Add progression tracking
ALTER TABLE group_courses 
  ADD COLUMN IF NOT EXISTS next_training_id UUID REFERENCES group_courses(id),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
```

### 2. Alter `customer_participants` table

```sql
-- Rename skill level columns to training references
ALTER TABLE customer_participants
  RENAME COLUMN current_ski_level_id TO current_ski_training_id;
ALTER TABLE customer_participants
  RENAME COLUMN current_snowboard_level_id TO current_snowboard_training_id;

-- Note: self_assessed_ski_level and self_assessed_snowboard_level 
-- remain unchanged (for adult private lessons only)
```

### 3. Clean up `skill_levels` table (optional but recommended)

```sql
-- Delete child skill levels - they're now managed via trainings
DELETE FROM skill_levels WHERE target_group = 'child';

-- Keep only adult levels for self-assessment
-- (ski_adult_green, ski_adult_blue, ski_adult_red, ski_adult_black)
-- (sb_adult_green, sb_adult_blue, sb_adult_red, sb_adult_black)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/group-courses.ts` | Remove `skill_level_id`, add `next_training_id`, `sort_order` |
| `src/components/trainings/TrainingFormModal.tsx` | Remove skill level dropdown, add next training selector |
| `src/components/trainings/TrainingCard.tsx` | Remove skill level badge (training name IS the level) |
| `src/components/trainings/TrainingsFilters.tsx` | Remove skill level filter (filter by training name instead) |
| `src/pages/Trainings.tsx` | Update filter logic to remove skill level filtering |
| `src/hooks/useGroupCourses.ts` | Remove skill level fetching, update queries |
| `src/components/bookings/wizard/GroupSelector.tsx` | Match participants by `current_ski_training_id` directly |
| `src/lib/skill-levels.ts` | Remove child-specific functions, keep adult-only logic |
| `src/hooks/useSkillLevels.ts` | Simplify to only fetch adult levels |
| `src/types/skill-levels.ts` | Update `ParticipantWithLevels` interface |
| `src/hooks/useParticipants.ts` | Rename columns in interfaces |
| `src/lib/level-utils.ts` | Remove deprecated `mapLevelToCourseSkill` function |

---

## Technical Implementation Details

### TrainingFormModal Changes

**Remove** (lines 40, 49, 74-75, 92, 130, 195-196, 493-523):
- `useChildSkiLevels`, `useChildSnowboardLevels` hooks
- `skill_level_id` from form schema and defaults
- The entire "Skill Level (1:1)" form field section

**Add**:
```tsx
// New field: next_training_id
<FormField
  control={form.control}
  name="next_training_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Nächstes Training (Progression)</FormLabel>
      <Select 
        value={field.value || 'none'} 
        onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Kein Folgetraining" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="none">Kein Folgetraining</SelectItem>
          {courses
            ?.filter(c => c.id !== course?.id && c.discipline === discipline)
            .map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      <FormDescription>
        Welches Training folgt auf dieses? (z.B. Blauer Prinz → Blauer König)
      </FormDescription>
    </FormItem>
  )}
/>
```

### GroupSelector Booking Logic

**Current** (problematic):
```tsx
// Uses lossy category mapping
const matchesLevel = mapLevelToCourseSkill(course.skill_level_id) === targetSkill;
```

**New** (exact matching):
```tsx
// Direct training ID comparison
const matchesTraining = course.id === participant.current_ski_training_id;

// Or suggest the NEXT training in progression
const suggestedTrainingId = await getNextTraining(participant.current_ski_training_id);
```

### Updated Types

```typescript
// src/types/group-courses.ts
export interface GroupCourse {
  id: string;
  name: string;
  description: string | null;
  // REMOVED: skill_level_id: string;
  discipline: 'ski' | 'snowboard' | 'both';
  next_training_id: string | null;  // NEW: progression reference
  sort_order: number;               // NEW: display ordering
  min_age: number | null;
  max_age: number | null;
  // ... rest unchanged
}

// src/types/skill-levels.ts
export interface ParticipantWithLevels {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  current_ski_training_id: string | null;      // RENAMED from current_ski_level_id
  current_snowboard_training_id: string | null; // RENAMED from current_snowboard_level_id
  self_assessed_ski_level: AdultSelfAssessment | null;      // Unchanged (adults only)
  self_assessed_snowboard_level: AdultSelfAssessment | null; // Unchanged (adults only)
}
```

---

## Booking Flow Changes

### Getting Suggested Training for a Participant

```typescript
async function getSuggestedTraining(
  participantId: string, 
  discipline: 'ski' | 'snowboard'
) {
  const participant = await getParticipant(participantId);
  const currentTrainingId = discipline === 'ski' 
    ? participant.current_ski_training_id 
    : participant.current_snowboard_training_id;

  if (!currentTrainingId) {
    // First-time participant: show all trainings, recommend "Swiss Snow Kids"
    return { 
      suggested: await getBeginnerTraining(discipline), 
      availableTrainings: await getTrainings(discipline) 
    };
  }

  // Get current training and its next step
  const currentTraining = await getTraining(currentTrainingId);
  
  if (currentTraining.next_training_id) {
    const nextTraining = await getTraining(currentTraining.next_training_id);
    return { 
      suggested: nextTraining,    // Recommend progression
      fallback: currentTraining,  // Or repeat if not ready
      availableTrainings: await getTrainings(discipline)
    };
  }

  // Already at highest level
  return { 
    suggested: currentTraining, 
    availableTrainings: await getTrainings(discipline)
  };
}
```

---

## Migration Strategy

1. **Database Migration** - Add new columns, migrate data, then drop old columns
2. **Frontend Updates** - Update all components to use new column names
3. **Data Migration** - Map existing `current_ski_level_id` values to corresponding training IDs
4. **Cleanup** - Delete child skill levels from `skill_levels` table

### Data Migration Query

```sql
-- Map existing participant skill levels to training IDs
UPDATE customer_participants SET current_ski_training_id = (
  SELECT gc.id FROM group_courses gc 
  WHERE gc.skill_level_id = customer_participants.current_ski_level_id
  LIMIT 1
)
WHERE current_ski_level_id IS NOT NULL;
```

---

## Summary of Entities After Change

| Entity | Purpose |
|--------|---------|
| `group_courses` | Group courses for children = their skill levels |
| `group_courses.next_training_id` | Defines progression (Blauer Prinz → Blauer König) |
| `customer_participants.current_ski_training_id` | Child's current level (= last completed training) |
| `skill_levels` | **ONLY** for adult self-assessment in private lessons |
| `customer_participants.self_assessed_ski_level` | Adult's self-reported ability ('green'/'blue'/'red'/'black') |

---

## Testing Checklist

1. Create/edit a training without skill level field
2. Set progression chain (Blauer Prinz → Blauer König → Blauer Star)
3. Book a participant and verify correct training is suggested
4. Complete training and verify participant advances to next level
5. Test adult booking still uses self-assessment levels
6. Verify TrainingsFilters work without skill level filter
7. Verify TrainingCard displays correctly without skill level badge

