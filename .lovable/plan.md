
# Fix Group Course Matching via Direct Skill Level Link

## Current Problem

The current data model has a fundamental design issue:

| Table | Field | Current Value |
|-------|-------|---------------|
| `skill_levels` | `id` | `ski_blauer_prinz`, `ski_roter_koenig`, etc. (specific) |
| `group_courses` | `skill_level` | `beginner`, `intermediate`, `advanced` (generic TEXT) |

The code then uses a mapping function to convert participant levels → generic categories → match courses. This is:
1. **Lossy** - Many skill levels map to the same category
2. **Redundant** - The group courses ARE the skill levels (1:1 relationship by name)
3. **Error-prone** - Mapping logic can get out of sync

### Your Database Data Shows the 1:1 Relationship

```
Skill Level: ski_blauer_prinz    →  Group Course: Blauer Prinz/Prinzessin
Skill Level: ski_blauer_star     →  Group Course: Blauer Star  
Skill Level: ski_windel_wedel    →  Group Course: Windel Wedel Kurs
Skill Level: ski_roter_prinz     →  Group Course: Red Prince/Princess
```

---

## Proposed Fix: Direct Foreign Key Link

### Database Schema Change

Add a new column to `group_courses`:

```sql
ALTER TABLE group_courses 
ADD COLUMN skill_level_id TEXT REFERENCES skill_levels(id);

-- Migrate existing data (match by name)
UPDATE group_courses gc
SET skill_level_id = sl.id
FROM skill_levels sl
WHERE (
  gc.name ILIKE sl.name
  OR gc.name ILIKE REPLACE(sl.name, 'König', 'King')
  OR gc.name ILIKE REPLACE(sl.name, 'Prinz', 'Prince')
  OR gc.name ILIKE REPLACE(sl.name, 'Prinzessin', 'Princess')
)
AND gc.discipline = sl.discipline
AND sl.target_group = 'child';

-- Eventually remove the old TEXT column
-- ALTER TABLE group_courses DROP COLUMN skill_level;
```

### Simplified Matching Logic

**Before (complex mapping):**
```typescript
// 1. Get participant's level: "ski_roter_koenig"
// 2. Map to generic: mapLevelToCourseSkill() → "intermediate"  
// 3. Find course where skill_level === "intermediate"
// Result: Could match ANY intermediate course (wrong!)
```

**After (direct link):**
```typescript
// 1. Get participant's level: "ski_roter_koenig"
// 2. Find course where skill_level_id === "ski_roter_koenig"
// Result: Exact match to "Roter König/Königin" course (correct!)
```

---

## Implementation Steps

### Step 1: Database Migration

Add `skill_level_id` FK column and populate from existing data:

```sql
-- Add the foreign key column
ALTER TABLE group_courses 
ADD COLUMN skill_level_id TEXT REFERENCES skill_levels(id);

-- Create index for performance
CREATE INDEX idx_group_courses_skill_level_id ON group_courses(skill_level_id);
```

### Step 2: Populate Existing Data

Run a migration to link existing courses to skill levels:

| Group Course | → | Skill Level ID |
|--------------|---|----------------|
| Windel Wedel Kurs | → | `ski_windel_wedel` |
| Blauer Prinz/Prinzessin (ski) | → | `ski_blauer_prinz` |
| Blauer Prinz/Prinzessin (snowboard) | → | `sb_blauer_prinz` |
| Blauer King/Queen | → | `ski_blauer_koenig` |
| Blauer Star | → | `ski_blauer_star` |
| Red Prince/Princess | → | `ski_roter_prinz` |
| Red King/Queen | → | `ski_roter_koenig` |
| Red Star | → | `ski_roter_star` |
| Black Prince/Princess | → | `ski_schwarzer_prinz` |

### Step 3: Update UI Components

**File: `src/components/bookings/wizard/ParticipantBookingCard.tsx`**

Change the matching logic:

```typescript
// OLD: Map level to generic skill category
const targetSkill = mapLevelToCourseSkill(participant.level_current_season);
let match = groupCourses.find(c => c.skill_level === targetSkill);

// NEW: Direct match on skill_level_id
const participantSkillId = participant.current_ski_level_id || 
  mapLegacyLevelToSkillLevelId(participant.level_current_season, 'ski');
let match = groupCourses.find(c => c.skill_level_id === participantSkillId);
```

**File: `src/components/trainings/TrainingFormModal.tsx`**

Update the form to select a `skill_level_id` instead of a generic skill category dropdown.

**File: `src/types/group-courses.ts`**

Update the type:

```typescript
interface GroupCourse {
  // ... existing fields
  skill_level_id: string | null;  // NEW - FK to skill_levels
  skill_level: string;            // DEPRECATED - keep for backward compat
}
```

### Step 4: Fix Date Synchronization (Secondary Issue)

The "empty dropdown" issue is also caused by participant bookings having empty dates.

**File: `src/contexts/BookingWizardContext.tsx`**

When `setSelectedDates` is called and `useParticipantSpecificBooking` is true, also update participant bookings:

```typescript
const setSelectedDates = (dates: string[]) => {
  setState((prev) => {
    const newState = { ...prev, selectedDates: dates };
    
    // Sync to participant bookings if in individual mode
    if (prev.useParticipantSpecificBooking) {
      const updatedBookings = { ...prev.participantBookings };
      for (const pId of Object.keys(updatedBookings)) {
        const booking = updatedBookings[pId];
        // Only sync if not manually overridden
        if (booking.dates.length === 0) {
          updatedBookings[pId] = { ...booking, dates: [...dates] };
        }
      }
      newState.participantBookings = updatedBookings;
    }
    
    return newState;
  });
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Database Migration | Add `skill_level_id` FK column to `group_courses`, populate data |
| `src/types/group-courses.ts` | Add `skill_level_id` field to interface |
| `src/hooks/useGroupCourses.ts` | Include `skill_level_id` in queries |
| `src/components/trainings/TrainingFormModal.tsx` | Replace skill category dropdown with skill level selector |
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Match on `skill_level_id` directly instead of mapped category |
| `src/contexts/BookingWizardContext.tsx` | Sync dates to participant bookings |
| `src/lib/level-utils.ts` | Eventually deprecate `mapLevelToCourseSkill()` |

---

## Expected Result

1. Each group course links directly to exactly one skill level
2. Participant matching is exact: "Roter König" participant → "Roter König/Königin" course
3. No lossy mapping between skill categories
4. Age remains a soft warning (already implemented)
5. The "Gruppe" dropdown populates correctly because dates sync properly
