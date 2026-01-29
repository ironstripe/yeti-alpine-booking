
# Fix: Group Course Recommendation Uses Wrong Progression Logic

## Problem Identified

Robin is showing "Blauer Star" as their level but the system recommends "Black Academy" instead of "Red Prince/Princess" (Roter Prinz).

**Root Cause Analysis:**

There are TWO issues that need to be fixed:

### Issue 1: Missing Training ID Data in Wizard

In `ParticipantListCard.tsx` (lines 200-208), when participants are selected, these critical fields are **NOT passed** to the wizard:
- `current_ski_level_id` / `current_snowboard_level_id`
- `current_ski_training_id` / `current_snowboard_training_id`

So `GroupSelector` receives participants without the training/level ID fields, causing recommendations to fail.

### Issue 2: GroupSelector Uses New Approach That Doesn't Exist Yet

The `GroupSelector` was refactored to use the NEW approach:
- Looks for `participant.current_ski_training_id` (points to `group_courses.id`)
- Uses `group_courses.next_training_id` for progression

But in the database:
- `current_ski_training_id` is NULL for Robin
- ALL `group_courses.next_training_id` values are NULL

The OLD working approach is in `ParticipantBookingCard`:
- Uses `current_ski_level_id` (points to `skill_levels.id`)
- Uses `skill_levels.next_level_id` for progression
- Maps to courses via `group_courses.skill_level_id`

---

## Solution

The quickest fix is to update `GroupSelector` to use the OLD approach that works:

1. **Pass all level/training ID fields** to participants in wizard
2. **Fix GroupSelector** to use `skill_levels` progression instead of `group_courses.next_training_id`

This maintains backward compatibility while we can later migrate data to populate `next_training_id` on courses.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/BookingWizardContext.tsx` | Add missing fields to `SelectedParticipant` interface |
| `src/components/bookings/wizard/ParticipantListCard.tsx` | Pass all level/training fields when selecting participants |
| `src/components/bookings/wizard/GroupSelector.tsx` | Fix recommendation logic to use skill_levels progression |

---

## Technical Implementation

### 1. Update SelectedParticipant Interface (BookingWizardContext.tsx)

```typescript
export interface SelectedParticipant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  level_last_season: string | null;
  level_current_season: string | null;
  sport: string | null;
  isGuest?: boolean;
  // Skill level IDs (points to skill_levels table)
  current_ski_level_id?: string | null;
  current_snowboard_level_id?: string | null;
  // Training IDs (points to group_courses table) - for future use
  current_ski_training_id?: string | null;
  current_snowboard_training_id?: string | null;
}
```

### 2. Pass All Fields in ParticipantListCard.tsx (lines 200-208 and 125-133)

```typescript
onToggle({
  id: participant.id,
  first_name: participant.first_name,
  last_name: participant.last_name,
  birth_date: participant.birth_date,
  level_last_season: participant.level_last_season,
  level_current_season: participant.level_current_season,
  sport: participant.sport,
  // Add missing fields:
  current_ski_level_id: participant.current_ski_level_id,
  current_snowboard_level_id: participant.current_snowboard_level_id,
  current_ski_training_id: participant.current_ski_training_id,
  current_snowboard_training_id: participant.current_snowboard_training_id,
});
```

### 3. Fix GroupSelector.tsx Recommendation Logic

Replace the current recommendation logic with skill_levels-based approach:

```typescript
// Add a query to fetch participant's skill level with next_level_id
const { data: skillLevelData } = useQuery({
  queryKey: ["group-selector-skill-level", primaryLevelId],
  queryFn: async () => {
    if (!primaryLevelId) return null;
    const { data, error } = await supabase
      .from("skill_levels")
      .select("id, name, next_level_id")
      .eq("id", primaryLevelId)
      .maybeSingle();
    if (error) return null;
    return data;
  },
  enabled: !!primaryLevelId,
});

// Get participant's skill level ID (not training ID)
const getPrimaryLevelId = () => {
  const first = participants[0];
  if (!first) return null;
  return sport === 'snowboard' 
    ? first.current_snowboard_level_id 
    : first.current_ski_level_id;
};
const primaryLevelId = getPrimaryLevelId();

// Find recommended course based on NEXT skill level in progression
const recommendedCourseId = useMemo(() => {
  if (!filteredCourses.length) return null;
  
  // Target = next level in progression (or current if at max)
  const targetLevelId = skillLevelData?.next_level_id || primaryLevelId;
  
  // Find course that matches this skill level
  const match = targetLevelId
    ? filteredCourses.find(c => c.skill_level_id === targetLevelId && 
        c.currentCount < c.max_participants)
    : null;
  
  // Fallback: first course with capacity
  return match?.id || filteredCourses.find(c => 
    c.currentCount < c.max_participants)?.id || null;
}, [filteredCourses, skillLevelData, primaryLevelId]);
```

---

## Expected Result After Fix

For Robin with `current_ski_level_id = 'ski_blauer_star'`:
1. Fetch skill level → `next_level_id = 'ski_roter_prinz'`
2. Find course where `skill_level_id = 'ski_roter_prinz'`
3. Match = "Red Prince/Princess" ✅ (not Black Academy)

The recommendation message will show:
> ✨ Automatisch passend zum Niveau "Roter Prinz" zugewiesen

---

## Testing Checklist

1. Navigate to `/bookings/new`
2. Select a customer with Robin as participant
3. Select Robin (who has "Blauer Star" level)
4. Choose Gruppenkurs
5. Verify "Red Prince/Princess" is recommended (not Black Academy)
6. Test with a participant at max level (Black Academy) - should stay at current
7. Test with a participant without any level - should show first available course
