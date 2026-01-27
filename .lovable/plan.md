
# Fix Group Course Recommendation Logic for Age and Level Matching

## Problem Summary
Robin Streiff (12 years old, blue_star level) is incorrectly being recommended "Windel Wedel Kurs" (toddler course for ages 3-4). The system should recommend "Blauer Star" course which is designed for intermediate level participants aged 5-16.

## Root Causes

### 1. Incorrect Level Mapping
The `mapLevelToCourseSkill` function in `src/lib/level-utils.ts` maps `blue_star` → `"beginner"`, but looking at the database:
- "Blauer Star" course has `skill_level: "intermediate"`
- "Blauer Prinz/Prinzessin" courses have `skill_level: "beginner"`

So `blue_star` should actually map to `"intermediate"`.

### 2. No Age Filtering
The course recommendation logic in `ParticipantBookingCard.tsx` doesn't check the participant's age against the course's `min_age`/`max_age` constraints.

---

## Implementation Plan

### File 1: `src/lib/level-utils.ts`

**Fix the level mapping** to correctly match the database course skill levels:

```typescript
// Current (WRONG):
const levelMap: Record<string, string> = {
  anfaenger: "beginner",
  blue_star: "beginner",     // ❌ Maps to wrong skill
  ...
};

// Fixed:
const levelMap: Record<string, string> = {
  anfaenger: "beginner",
  blue_star: "intermediate",  // ✅ Matches "Blauer Star" course
  ...
};
```

### File 2: `src/components/bookings/wizard/ParticipantBookingCard.tsx`

**Add age filtering when fetching and recommending group courses:**

1. Update the query to include `min_age` and `max_age` fields
2. Filter courses where participant age is within the `min_age`-`max_age` range
3. Only recommend courses that match both skill level AND age constraints

```typescript
// In the query (around line 99-134):
.select(`
  id, name, skill_level, max_participants, color, meeting_point, course_type,
  min_age, max_age  // Add these fields
`)

// In course filtering/mapping:
return coursesData
  .filter(course => {
    // Filter by age if participant has birth date
    if (age !== null && course.min_age != null && course.max_age != null) {
      if (age < course.min_age || age > course.max_age) {
        return false;
      }
    }
    return true;
  })
  .map(course => ({ ... }));

// Update recommended course logic (around line 140-147):
const recommendedCourseId = useMemo(() => {
  if (!participant.level_current_season || groupCourses.length === 0) return null;
  
  const targetSkill = mapLevelToCourseSkill(participant.level_current_season);
  
  // First try: exact skill match with capacity
  let match = groupCourses.find(
    (c) => c.skill_level === targetSkill && c.currentCount < c.max_participants
  );
  
  // Fallback: if no skill match, pick first course with capacity (age already filtered)
  if (!match) {
    match = groupCourses.find(c => c.currentCount < c.max_participants);
  }
  
  return match?.id || null;
}, [participant.level_current_season, groupCourses]);
```

---

## Expected Behavior After Fix

| Participant | Age | Level | Before (Wrong) | After (Correct) |
|-------------|-----|-------|----------------|-----------------|
| Robin | 12 J. | blue_star | Windel Wedel Kurs | Blauer Star |
| Toddler | 4 J. | anfaenger | Any beginner course | Windel Wedel Kurs (age-appropriate) |
| Child | 8 J. | anfaenger | Any beginner course | Blauer Prinz (age-appropriate) |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/level-utils.ts` | Fix `blue_star` mapping: "beginner" → "intermediate" |
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Add age-based course filtering and fallback logic |

---

## UI Display Update

The green confirmation text will now correctly show:
- "Automatisch passend zum Niveau 'Blue Star' zugewiesen" (instead of showing blue_star → toddler course)
