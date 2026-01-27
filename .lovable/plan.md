
# Fix Birthdate Picker - Year Range and Manual Input

## Problem Summary
The birthdate picker in the booking wizard has two issues:
1. **Year selection limited to 2000-2026** - Cannot select years before 2000, making it impossible to enter birthdates for adults born before 2000
2. **Manual input validation rejects valid dates** - Even though there's a text input field, it validates against the same `minYear` limit (2000), rejecting manually typed older dates

## Root Cause
The `EnhancedDatePicker` component is used with incorrect `minYear={2000}` in multiple locations:
- `ParticipantSelection.tsx` (line 286)
- `ParticipantListCard.tsx` (line 320)
- `ParticipantEditDialog.tsx` (line 165)

This creates a conflict: the `disabled` prop allows dates from 1900, but `minYear={2000}` only shows years 2000+ in the dropdown and rejects manual input for years before 2000.

## Solution
Change `minYear` from `2000` to `1900` in all three files to match the `disabled` date constraint. This ensures:
- Year dropdown shows 1900-current year
- Manual text input accepts years from 1900+
- Calendar still disables dates outside the valid range

---

## Technical Implementation

### File 1: `src/components/bookings/wizard/ParticipantSelection.tsx`

**Line 286:** Change `minYear={2000}` to `minYear={1900}`

```typescript
// Before
<EnhancedDatePicker
  value={field.value}
  onChange={field.onChange}
  placeholder="Datum wählen"
  disabled={(date) =>
    date > new Date() || date < new Date("1900-01-01")
  }
  minYear={2000}  // Wrong!
  maxYear={new Date().getFullYear()}
/>

// After
<EnhancedDatePicker
  value={field.value}
  onChange={field.onChange}
  placeholder="Datum wählen"
  disabled={(date) =>
    date > new Date() || date < new Date("1900-01-01")
  }
  minYear={1900}  // Matches disabled constraint
  maxYear={new Date().getFullYear()}
/>
```

### File 2: `src/components/bookings/wizard/ParticipantListCard.tsx`

**Line 320:** Change `minYear={2000}` to `minYear={1900}`

### File 3: `src/components/bookings/wizard/ParticipantEditDialog.tsx`

**Line 165:** Change `minYear={2000}` to `minYear={1900}`

---

## Additional Improvement: ParticipantCard in Customer Detail

The `ParticipantCard.tsx` component uses a basic `Calendar` without the `EnhancedDatePicker`. It should be updated to use `EnhancedDatePicker` for consistency (includes manual text input).

### File 4: `src/components/customers/detail/ParticipantCard.tsx`

Replace the Popover/Calendar combination with `EnhancedDatePicker`:

```typescript
// Before (lines 166-195)
<div className="space-y-2">
  <Label>Geburtsdatum *</Label>
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" ...>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {watchedBirthDate ? format(...) : "Datum wählen"}
      </Button>
    </PopoverTrigger>
    <PopoverContent>
      <Calendar mode="single" ... />
    </PopoverContent>
  </Popover>
</div>

// After
<div className="space-y-2">
  <Label>Geburtsdatum *</Label>
  <EnhancedDatePicker
    value={watchedBirthDate}
    onChange={(date) => date && setValue("birth_date", date)}
    placeholder="Datum wählen"
    disabled={(date) =>
      date > new Date() || date < new Date("1900-01-01")
    }
    minYear={1900}
    maxYear={new Date().getFullYear()}
  />
</div>
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/components/bookings/wizard/ParticipantSelection.tsx` | Line 286: `minYear={2000}` → `minYear={1900}` |
| `src/components/bookings/wizard/ParticipantListCard.tsx` | Line 320: `minYear={2000}` → `minYear={1900}` |
| `src/components/bookings/wizard/ParticipantEditDialog.tsx` | Line 165: `minYear={2000}` → `minYear={1900}` |
| `src/components/customers/detail/ParticipantCard.tsx` | Replace Calendar with EnhancedDatePicker for consistency |

---

## Expected Behavior After Fix

| Feature | Before | After |
|---------|--------|-------|
| Year dropdown range | 2000-2026 (26 years) | 1900-2026 (126 years) |
| Manual input "15.03.1985" | Rejected (year < 2000) | Accepted |
| Calendar navigation | Limited | Full range with year jumps |
| Consistency | Different pickers in different places | Same EnhancedDatePicker everywhere |

---

## Note on EnhancedDatePicker Features

The `EnhancedDatePicker` component already supports:
- **Manual text input** with format `TT.MM.JJJJ` (DD.MM.YYYY)
- **Year dropdown** for quick navigation
- **Year jump buttons** (double chevrons) to skip years quickly
- **Validation on blur** to reset invalid inputs

No changes needed to the component itself - just the configuration where it's used.
