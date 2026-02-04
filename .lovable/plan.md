

# Fix: PeriodDayPlanner Override Logic and Reset Functionality

## Problem Summary

The PeriodDayPlanner component has a critical bug where resetting overrides sets values to `null` instead of removing them. This causes:
1. Instructor showing as "Nicht zugewiesen" after reset (instead of base instructor)
2. Days incorrectly flagged as "Angepasst" even after reset
3. Incorrect data being saved during booking creation

## Root Cause

The `setDayInstructorOverride(date, null)` call sets `dayInstructorOverrides[date] = null`, but the `getDayInstructor` logic treats any defined value (including `null`) as an override.

## Technical Changes

### 1. Add Remove Override Functions to Context

**File**: `src/contexts/BookingWizardContext.tsx`

Add new functions to remove specific override entries:

```typescript
// Add to context interface
removeDayInstructorOverride: (date: string) => void;
removeDayTimeOverride: (date: string) => void;

// Implementations
const removeDayInstructorOverride = (date: string) => {
  setState((prev) => {
    const { [date]: removed, ...remaining } = prev.dayInstructorOverrides;
    return { ...prev, dayInstructorOverrides: remaining };
  });
};

const removeDayTimeOverride = (date: string) => {
  setState((prev) => {
    const { [date]: removed, ...remaining } = prev.dayTimeOverrides;
    return { ...prev, dayTimeOverrides: remaining };
  });
};
```

### 2. Update PeriodDayPlanner Props and Reset Logic

**File**: `src/components/bookings/wizard/PeriodDayPlanner.tsx`

Add new props for removal functions:

```typescript
interface PeriodDayPlannerProps {
  // ... existing props ...
  onRemoveInstructorOverride: (date: string) => void;
  onRemoveTimeOverride: (date: string) => void;
}
```

Update reset button logic:

```typescript
onClick={() => {
  sortedDates.forEach((date) => {
    if (dayInstructorOverrides[date] !== undefined) {
      onRemoveInstructorOverride(date);  // DELETE the key, don't set to null
    }
    if (dayTimeOverrides[date]) {
      onRemoveTimeOverride(date);  // DELETE the key
    }
  });
}}
```

### 3. Update Step3InstructorDetails Integration

**File**: `src/components/bookings/wizard/Step3InstructorDetails.tsx`

Pass the new removal functions:

```typescript
<PeriodDayPlanner
  // ... existing props ...
  onRemoveInstructorOverride={removeDayInstructorOverride}
  onRemoveTimeOverride={removeDayTimeOverride}
/>
```

### 4. Fix Individual Day Reset Logic

In PeriodDayPlanner, when a user selects the same instructor as the base for a specific day, it should remove the override rather than storing a redundant entry:

```typescript
onValueChange={(value) => {
  if (value === "none") {
    onInstructorChange(date, null);  // Explicit "no instructor"
  } else if (value === baseInstructor?.id) {
    onRemoveInstructorOverride(date);  // Same as base, remove override
  } else {
    onInstructorChange(date, value);  // Different instructor
  }
}}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` | Add `removeDayInstructorOverride` and `removeDayTimeOverride` functions |
| `src/components/bookings/wizard/PeriodDayPlanner.tsx` | Update props, fix reset button, optimize day-level selection |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Pass new removal functions to PeriodDayPlanner |

---

## Expected Behavior After Fix

| Action | Before | After |
|--------|--------|-------|
| Click "Alle Anpassungen zurücksetzen" | Instructor shows "Nicht zugewiesen" | Shows base instructor |
| Reset button after changes | Days still show "Angepasst" badge | All days show "Standard" badge |
| Select base instructor for override day | Stores redundant override | Removes override entry |
| Booking creation | May include stale/incorrect overrides | Clean override data |

---

## Testing Checklist

- [ ] Create multi-day private booking, select base instructor
- [ ] Override instructor for one day
- [ ] Verify "Angepasst" badge appears
- [ ] Click reset, verify all days show "Standard" and base instructor
- [ ] Select different instructor for a day, then select base instructor again - verify override is removed
- [ ] Complete booking and verify correct instructor assignments in database

