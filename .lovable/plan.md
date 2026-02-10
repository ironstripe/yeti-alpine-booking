
# Fix: Show Adult Color-Based Levels for Participants Over 16

## Problem

The level selection dropdowns in the booking wizard (ParticipantSelection, ParticipantListCard, ParticipantEditDialog) always show the **children's training-based levels** (Blauer Prinz, Roter Konig, etc.) regardless of participant age. Adults (>16) should see a simple 4-tier color system: Green (Anfanger), Blue (Blaue Piste), Red (Rote Piste), Black (Experte).

The root cause: `LEVEL_OPTIONS` in `src/lib/level-utils.ts` is a single static array with only child levels. No age-based branching exists in the forms.

## Solution

Add adult-specific level options to `level-utils.ts` and make the level dropdowns in the booking wizard age-aware -- showing child levels for participants <=16 and adult color levels for participants >16, based on the birth date entered in the form.

## Changes

### File 1: `src/lib/level-utils.ts`
- Add a new `ADULT_LEVEL_OPTIONS` constant with 4 color-based levels:
  - `green` = Anfanger (Beginner)
  - `blue` = Blaue Piste (Blue slopes)
  - `red` = Rote Piste (Red slopes)
  - `black` = Experte (Expert / Black slopes)
- Add a helper function `getLevelOptionsForAge(birthDate: string | null)` that returns `ADULT_LEVEL_OPTIONS` if age > 16, otherwise returns the existing `LEVEL_OPTIONS`
- Update `getLevelLabel` and `getLevelBadgeColor` to handle the new adult level values (`green`, `blue`, `red`, `black`)
- Update `getNextLevel` to support adult level progression (green -> blue -> red -> black)

### File 2: `src/components/bookings/wizard/ParticipantSelection.tsx`
- Import `getLevelOptionsForAge` from level-utils
- Watch the `birth_date` form field value
- Replace the static `LEVEL_OPTIONS` in both level dropdowns with `getLevelOptionsForAge(birthDate)` so the options change dynamically when a birth date is entered
- Reset the level fields when birth date changes and the participant crosses the child/adult threshold

### File 3: `src/components/bookings/wizard/ParticipantEditDialog.tsx`
- Same pattern: use `getLevelOptionsForAge(participant.birth_date)` to show age-appropriate level options

### File 4: `src/components/bookings/wizard/ParticipantListCard.tsx`
- Same pattern: use participant birth date to determine which level options to show in the inline form

## Technical Details

New constants in `level-utils.ts`:

```typescript
export const ADULT_LEVEL_OPTIONS = [
  { value: "green", label: "Anfanger (Grune Piste)" },
  { value: "blue", label: "Blaue Piste" },
  { value: "red", label: "Rote Piste" },
  { value: "black", label: "Experte (Schwarze Piste)" },
] as const;

export function getLevelOptionsForAge(birthDate: string | null) {
  if (!birthDate) return LEVEL_OPTIONS; // Default to child
  const age = differenceInYears(new Date(), new Date(birthDate));
  return age > 16 ? ADULT_LEVEL_OPTIONS : LEVEL_OPTIONS;
}
```

The threshold is age > 16 (matching the existing `isChild` function logic where < 16 = child).

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/level-utils.ts` | Add `ADULT_LEVEL_OPTIONS`, `getLevelOptionsForAge()`, update label/badge/progression functions |
| `src/components/bookings/wizard/ParticipantSelection.tsx` | Use age-aware level options based on birth date |
| `src/components/bookings/wizard/ParticipantEditDialog.tsx` | Use age-aware level options based on participant birth date |
| `src/components/bookings/wizard/ParticipantListCard.tsx` | Use age-aware level options based on birth date |
