
# Fix Group Course Recommendation and Date Synchronization

## Problem Summary

Two issues identified from your screenshot:

### Issue 1: Wrong Group Recommendation for Robin
- **Current behavior**: Robin has level "Blauer Star" → System recommends "Blauer Star" course
- **Expected behavior**: Robin ACHIEVED "Blauer Star" → Should be placed in NEXT course: "Red Prince/Princess"

The business logic should be: if a participant has **achieved** level X, they should be enrolled in the course for their **next level** (progression). The database already has `next_level_id` in `skill_levels` table for exactly this purpose.

```text
Database shows:
┌─────────────────┬─────────────┬────────────────────────┐
│ Participant     │ Achieved    │ Should Book Course For │
├─────────────────┼─────────────┼────────────────────────┤
│ Robin           │ Blauer Star │ Red Prince/Princess    │
│ (next_level_id) │             │ (ski_roter_prinz)      │
└─────────────────┴─────────────┴────────────────────────┘
```

### Issue 2: Only First Date Syncing (Feb 9 only, not 10-12)
- **Current behavior**: Main calendar selects Feb 9-12 → Participant card shows only Feb 9
- **Root cause**: The sync logic in `setSelectedDates` only updates participant bookings when `booking.dates.length === 0`

When individual mode auto-enables, `initializeParticipantBookings()` copies current dates. Later date changes are ignored because `booking.dates.length > 0`.

---

## Solution

### Fix 1: Match on NEXT Level for Group Course Recommendation

**File: `src/components/bookings/wizard/ParticipantBookingCard.tsx`**

Fetch the participant's `next_level_id` from `skill_levels` and use that for matching:

```typescript
// Fetch participant's next level for group course matching
const { data: skillLevelData } = useQuery({
  queryKey: ["skill-level-next", participantSkillId],
  queryFn: async () => {
    if (!participantSkillId) return null;
    const { data } = await supabase
      .from("skill_levels")
      .select("id, name, next_level_id")
      .eq("id", participantSkillId)
      .single();
    return data;
  },
  enabled: !!participantSkillId,
});

// Use next_level_id for matching (participant should progress to next course)
const targetSkillLevelId = skillLevelData?.next_level_id || participantSkillId;

// Match group course
let match = groupCourses.find(
  (c) => c.skill_level_id === targetSkillLevelId && c.currentCount < c.max_participants
);
```

This ensures:
- Robin (Blauer Star) → matches "Red Prince/Princess" course (next level)
- Already at highest level → stays in current level course

### Fix 2: Sync All Date Changes to Participant Bookings

**File: `src/contexts/BookingWizardContext.tsx`**

Update `setSelectedDates` to sync dates when they match the previous shared selection (not just when empty):

```typescript
const setSelectedDates = (dates: string[]) => {
  setState((prev) => {
    const newState = { ...prev, selectedDates: dates };
    
    // Sync to participant bookings if in individual mode
    if (prev.useParticipantSpecificBooking && Object.keys(prev.participantBookings).length > 0) {
      const previousDates = prev.selectedDates;
      const updatedBookings = { ...prev.participantBookings };
      
      for (const pId of Object.keys(updatedBookings)) {
        const booking = updatedBookings[pId];
        
        // Sync if:
        // 1. Participant's dates are empty, OR
        // 2. Participant's dates exactly match the previous shared dates (not manually overridden)
        const shouldSync = 
          booking.dates.length === 0 ||
          (booking.dates.length === previousDates.length && 
           booking.dates.every(d => previousDates.includes(d)));
        
        if (shouldSync) {
          updatedBookings[pId] = { ...booking, dates: [...dates] };
        }
      }
      newState.participantBookings = updatedBookings;
    }
    
    return newState;
  });
};
```

This ensures:
- First date selection → syncs to all participants
- Adding more dates → still syncs (because current dates match previous shared dates)
- Manual override by participant → preserved (their dates won't match shared dates)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | 1. Add query to fetch `next_level_id` from skill_levels<br>2. Use `next_level_id` for group course matching instead of current level |
| `src/contexts/BookingWizardContext.tsx` | Update `setSelectedDates` sync logic to detect "matches previous shared dates" not just "is empty" |

---

## Expected Result

After these changes:

1. **Robin (Blauer Star)** → Recommended "Red Prince/Princess" course
2. **Lisa (if she's lower level)** → Recommended appropriate next-level course
3. **All selected dates (Feb 9-12)** → Appear in all participant cards
4. **Manual participant overrides** → Still preserved

---

## Verification Steps

1. Create booking with 2 participants with different levels
2. Select "Gruppenkurs" → Confirm individual mode auto-enables
3. Pick dates Feb 9-12 in main calendar:
   - All 4 dates should appear in BOTH participant cards
4. Check recommendations:
   - Participant with "Blauer Star" → Should show "Red Prince/Princess" as recommended
   - Participant at highest level → Should show their current level course
5. Manually change one participant's dates → Verify other participant still syncs from main calendar
