
# Update FamilyHub Date Picker - Match Booking Wizard Logic

## Problem
The "New Participant" form in the customer detail page (`FamilyHub.tsx`) uses an old `Popover/Calendar` approach for birthdate selection that lacks:
- Manual text input field (`TT.MM.JJJJ`)
- Year dropdown for quick navigation
- Year jump buttons (double chevrons)

This is inconsistent with the booking wizard's date picker.

## Solution
Replace the `Popover/Calendar` implementation with `EnhancedDatePicker` in `FamilyHub.tsx`.

---

## Technical Implementation

### File: `src/components/customers/detail/FamilyHub.tsx`

**Changes:**

1. **Update imports** (lines 7, 22-23):
   - Remove: `CalendarIcon` from lucide-react
   - Remove: `Popover, PopoverContent, PopoverTrigger` from popover
   - Remove: `Calendar` from calendar
   - Add: `EnhancedDatePicker` from enhanced-date-picker

2. **Replace Popover/Calendar with EnhancedDatePicker** (lines 152-181):

```typescript
// Before (lines 152-181)
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
  {errors.birth_date && ...}
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
  {errors.birth_date && ...}
</div>
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/components/customers/detail/FamilyHub.tsx` | Replace Popover/Calendar with EnhancedDatePicker, update imports |

---

## Expected Behavior After Fix

The "New Participant" form in customer detail will now have:
- **Text input field** for manual date entry (`TT.MM.JJJJ` format)
- **Calendar button** showing "Datum wählen" or the selected date
- **Year dropdown** for quick year navigation (1900-2026)
- **Year jump buttons** (double chevrons) for fast navigation
- **Same behavior** as booking wizard participant forms

All participant-related date pickers across the app will be consistent.
