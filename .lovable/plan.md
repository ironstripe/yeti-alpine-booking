

# Fix: Preserve Per-Day Times from Scheduler Multi-Select

## Problem Summary

When selecting multiple time slots with different times in the scheduler (e.g., Mon 10:00-12:00, Tue 14:00-16:00), the booking wizard only uses the first slot's time for all days. The individual times are stored in `state.appointments` but never converted to the formats used by the UI and creation logic.

## Root Cause

In `src/contexts/BookingWizardContext.tsx`, the `prefillFromScheduler` function (lines 534-578):

```typescript
const prefillFromScheduler = async (instructorId: string, appointments: AppointmentSlot[]) => {
  // ...
  // PROBLEM: Only uses first appointment for timeSlot
  if (appointments.length > 0) {
    const firstAppt = appointments[0];
    timeSlot = `${firstAppt.startTime} - ${endTime}`;  // <-- Only first!
    duration = firstAppt.durationMinutes / 60;
  }
  
  setState((prev) => ({
    // ...
    appointments,         // Stored but not converted
    timeSlot,             // Only first appointment's time
    // MISSING: timeSelections - not populated
    // MISSING: dayTimeOverrides - not populated
  }));
};
```

The booking creation logic (`useCreateBooking.ts` lines 372-384) already supports per-day times via `timeSelections` and `dayTimeOverrides`, but these are never populated.

## Technical Fix

**File:** `src/contexts/BookingWizardContext.tsx`

Modify `prefillFromScheduler` to:
1. Convert all appointments to `TimeSelection[]` format
2. Calculate `dayTimeOverrides` for appointments differing from the base

```typescript
const prefillFromScheduler = async (instructorId: string, appointments: AppointmentSlot[]) => {
  const dates = [...new Set(appointments.map((a) => a.date))].sort();
  
  // Fetch instructor...
  
  // Convert appointments to TimeSelection format
  const timeSelections: TimeSelection[] = appointments.map(appt => {
    const startMinutes = parseInt(appt.startTime.split(":")[0]) * 60 + 
                         parseInt(appt.startTime.split(":")[1] || "0");
    const endMinutes = startMinutes + appt.durationMinutes;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;
    const endTime = `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`;
    
    return {
      date: appt.date,
      startTime: appt.startTime,
      endTime,
    };
  });
  
  // Use first appointment as base
  const baseAppt = appointments[0];
  const baseStartTime = baseAppt?.startTime || "10:00";
  const baseDuration = baseAppt?.durationMinutes || 120;
  const baseEndMinutes = (parseInt(baseStartTime.split(":")[0]) * 60 + 
                          parseInt(baseStartTime.split(":")[1] || "0")) + baseDuration;
  const baseEndHour = Math.floor(baseEndMinutes / 60);
  const baseEndMin = baseEndMinutes % 60;
  const baseEndTime = `${baseEndHour.toString().padStart(2, "0")}:${baseEndMin.toString().padStart(2, "0")}`;
  
  // Calculate dayTimeOverrides for appointments that differ from base
  const dayTimeOverrides: Record<string, DayTimeOverride> = {};
  for (const ts of timeSelections) {
    if (ts.startTime !== baseStartTime || ts.endTime !== baseEndTime) {
      dayTimeOverrides[ts.date] = {
        startTime: ts.startTime,
        endTime: ts.endTime,
      };
    }
  }
  
  const timeSlot = baseAppt ? `${baseStartTime} - ${baseEndTime}` : null;
  const duration = baseDuration / 60;
  
  setState((prev) => ({
    ...prev,
    instructorId,
    instructor,
    appointments,
    selectedDates: dates,
    productType: "private",
    timeSlot,
    duration,
    // NEW: Populate these fields for per-day times
    timeSelections,
    dayTimeOverrides,
    assignLater: false,
  }));
};
```

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Select Mon 10-12, Tue 14-16 | Both days get 10:00-12:00 | Mon 10:00-12:00, Tue 14:00-16:00 |
| BookingTimeGrid display | Shows only first time | Shows correct per-day times |
| PeriodDayPlanner display | Shows base time for all | Shows overrides marked |
| Booking creation | Wrong times saved | Correct times saved |

## Files to Modify

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` | Update `prefillFromScheduler` to populate `timeSelections` and `dayTimeOverrides` |

## Testing Checklist

- Select 3 slots for same instructor with SAME time across all days
- Verify booking wizard shows uniform time, no overrides
- Select 3 slots for same instructor with DIFFERENT times
- Verify BookingTimeGrid shows correct time blocks per day
- Verify PeriodDayPlanner shows days with different times as "Angepasst"
- Complete booking and verify database has correct per-day times

