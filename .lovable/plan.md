
# Auto-Enable Individual Booking Mode for Multi-Participant Group Bookings with Different Skill Levels

## Problem Summary
When creating a group booking with multiple participants who have different skill levels (e.g., Lisa is "beginner" and Robin is "advanced"), the system currently:
1. Displays a warning about the level mismatch
2. Still allows booking all participants into the same group
3. Requires manual activation of "Individuelle Buchung" (Individual Booking) mode

The expected behavior is that each participant should be automatically booked into an appropriate group matching their skill level.

## Solution Overview
Auto-enable "Individual Booking" mode when:
- Product type is "group" (Gruppenkurs)
- Multiple participants are selected
- Participants have different skill levels

This matches the behavior expected from inbox-originated bookings where the AI suggests participant-specific configurations.

---

## Technical Implementation

### File 1: `src/components/bookings/wizard/Step2ProductDates.tsx`

**Change 1**: Add `useEffect` to auto-enable individual booking mode when group course is selected with level mismatch

After the existing `handleEnableParticipantMode` function (around line 231), add a new effect:

```typescript
// Auto-enable participant-specific mode for group bookings with different levels
useEffect(() => {
  // Only auto-enable for group courses with multiple participants having different levels
  if (
    state.productType === "group" &&
    state.selectedParticipants.length > 1 &&
    (hasDifferentLevels || hasAgeMismatch) &&
    !state.useParticipantSpecificBooking
  ) {
    // Initialize participant bookings and enable individual mode
    initializeParticipantBookings();
    setUseParticipantSpecificBooking(true);
  }
}, [
  state.productType,
  state.selectedParticipants.length,
  hasDifferentLevels,
  hasAgeMismatch,
  state.useParticipantSpecificBooking,
  initializeParticipantBookings,
  setUseParticipantSpecificBooking,
]);
```

**Change 2**: Update the warning message to be informational (mode is now auto-enabled)

Update lines 335-384 to show as an info message rather than an action prompt when in group mode:

```typescript
{/* Info message when individual mode was auto-enabled for group */}
{(hasDifferentLevels || hasAgeMismatch) && state.productType === "group" && state.selectedParticipants.length > 1 && (
  <Alert className="bg-blue-50 border-blue-300 shadow-sm">
    <Info className="h-5 w-5 text-blue-600" />
    <AlertDescription className="text-blue-800">
      <div className="space-y-2">
        <p className="font-medium">
          Individuelle Buchung aktiviert
        </p>
        <p className="text-sm">
          {hasDifferentLevels 
            ? "Teilnehmer haben unterschiedliche Niveaus - jeder wird in den passenden Kurs eingeschrieben." 
            : "Teilnehmer haben unterschiedliche Altersgruppen - jeder wird in den passenden Kurs eingeschrieben."
          }
        </p>
      </div>
    </AlertDescription>
  </Alert>
)}
```

**Change 3**: Keep the original warning only for private lessons (where all can still be taught together)

The existing warning with the "Individuelle Buchung aktivieren" button should only show when `state.productType !== "group"` or is `null` (before type is selected).

### File 2: `src/components/bookings/wizard/ParticipantBookingCard.tsx` (Minor Enhancement)

**Change**: Add visual indicator showing which group was auto-selected based on skill level

After the group selector (around line 375), add confirmation text:

```typescript
{/* Show auto-matched info */}
{booking.groupCourseId === recommendedCourseId && recommendedCourseId && (
  <div className="flex items-center gap-1 text-xs text-green-600">
    <Sparkles className="h-3 w-3" />
    <span>Automatisch passend zum Niveau "{getLevelLabel(participant.level_current_season)}" zugewiesen</span>
  </div>
)}
```

---

## Behavior After Implementation

| Scenario | Before | After |
|----------|--------|-------|
| 2+ participants, different levels, select "Group" | Warning shown, manual toggle required | Auto-switches to individual mode |
| 2+ participants, same level, select "Group" | Shared booking mode | Shared booking mode (unchanged) |
| 2+ participants, different levels, select "Private" | Warning shown, manual toggle offered | Warning shown, manual toggle offered (unchanged) |
| AI prefill from inbox with different levels | Warning shown, manual toggle required | Auto-switches to individual mode |

---

## Expected User Experience

1. User selects customer with participants Lisa (beginner) and Robin (advanced)
2. User chooses "Gruppenkurs" product type
3. **System automatically switches to individual booking mode**
4. Each participant card shows:
   - Their recommended group course based on skill level
   - Auto-selected best matching group with capacity
5. Info banner explains: "Teilnehmer haben unterschiedliche Niveaus - jeder wird in den passenden Kurs eingeschrieben."

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/Step2ProductDates.tsx` | Add auto-enable useEffect, update warning to info message for group mode |
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Add auto-match confirmation text |

---

## Edge Cases Handled

1. **Switching back to private**: If user switches from group to private, individual mode can stay enabled or be manually toggled off
2. **Same levels**: If all participants have the same level, shared booking mode remains (no auto-enable)
3. **Missing level data**: The `hasDifferentLevels` logic already treats `null` as "unknown", so a participant with no level differs from one with a level
4. **Age mismatch (toddler + older)**: Also triggers auto-enable for group courses since toddlers need different courses
