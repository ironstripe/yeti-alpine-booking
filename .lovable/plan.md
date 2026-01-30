
# Plan: Prevent Booking Creation for Past Dates

## Problem Summary

While the calendar UI in Step 2 disables past dates, bookings can still be created for past dates through these pathways:
1. Selecting slots on past dates in the Scheduler and clicking "Ausgewählte buchen"
2. Receiving scheduler prefill with past dates via URL parameters
3. AI extraction prefilling past dates from conversations

## Solution: Multi-Layer Validation

Implement validation at three levels to ensure comprehensive protection.

---

## Technical Implementation

### Layer 1: Scheduler Selection Validation

**File: `src/contexts/SchedulerSelectionContext.tsx`**

Add past date check in `canSelectSlot` function (around line 109):

```typescript
const canSelectSlot = useCallback(
  (instructorId, date, startTime, endTime, bookings, absences) => {
    // NEW: Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slotDate = new Date(date);
    slotDate.setHours(0, 0, 0, 0);
    
    if (slotDate < today) {
      return { valid: false, reason: "Vergangene Daten können nicht gebucht werden" };
    }
    
    // ... existing validation logic
  }
);
```

Also update `endDrag` function to reject past dates when completing a drag selection.

---

### Layer 2: Scheduler Prefill Validation

**File: `src/pages/BookingWizard.tsx`**

Filter out past dates when applying scheduler prefill (around line 152-165):

```typescript
useEffect(() => {
  if (!schedulerInstructorId || !schedulerAppointments) return;
  if (didApplySchedulerPrefill.current) return;
  if (state.appointments) return;

  try {
    const appointments = JSON.parse(decodeURIComponent(schedulerAppointments));
    
    // NEW: Filter out past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validAppointments = appointments.filter((appt: any) => {
      const apptDate = new Date(appt.date);
      apptDate.setHours(0, 0, 0, 0);
      return apptDate >= today;
    });
    
    if (validAppointments.length === 0) {
      toast.error("Alle ausgewählten Termine liegen in der Vergangenheit");
      return;
    }
    
    if (validAppointments.length < appointments.length) {
      toast.warning("Vergangene Termine wurden entfernt");
    }
    
    didApplySchedulerPrefill.current = true;
    prefillFromScheduler(schedulerInstructorId, validAppointments);
  } catch (e) {
    console.error("Failed to parse scheduler appointments:", e);
  }
}, [...]);
```

---

### Layer 3: Booking Creation Validation (Final Safeguard)

**File: `src/hooks/useCreateBooking.ts`**

Add validation before database insert (around line 47):

```typescript
mutationFn: async (state: BookingWizardState): Promise<CreateBookingResult> => {
  // NEW: Validate no past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pastDates = state.selectedDates.filter(dateStr => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date < today;
  });
  
  if (pastDates.length > 0) {
    throw new Error("Buchungen können nicht für vergangene Daten erstellt werden.");
  }
  
  // ... rest of existing logic
}
```

---

### Layer 4: Utility Function for Reuse

**File: `src/lib/booking-utils.ts`**

Add a utility function to check if a date is bookable:

```typescript
/**
 * Check if a date is valid for new bookings (today or future)
 */
export function isDateBookable(date: string | Date): boolean {
  const bookingDate = typeof date === "string" ? parseISO(date) : date;
  const today = startOfDay(new Date());
  const bookingDay = startOfDay(bookingDate);
  
  return isEqual(bookingDay, today) || isAfter(bookingDay, today);
}

/**
 * Filter an array of dates to only include bookable dates
 */
export function filterBookableDates(dates: string[]): string[] {
  return dates.filter(isDateBookable);
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/booking-utils.ts` | Add `isDateBookable` and `filterBookableDates` utilities |
| `src/contexts/SchedulerSelectionContext.tsx` | Add past date validation in `canSelectSlot` and `endDrag` |
| `src/pages/BookingWizard.tsx` | Filter past dates from scheduler prefill |
| `src/hooks/useCreateBooking.ts` | Add final validation before insert |

---

## User Experience

| Scenario | Behavior |
|----------|----------|
| User selects past date slot in Scheduler | Toast: "Vergangene Daten können nicht gebucht werden" |
| Scheduler prefill contains only past dates | Toast: "Alle ausgewählten Termine liegen in der Vergangenheit" |
| Scheduler prefill contains mixed dates | Toast: "Vergangene Termine wurden entfernt" + valid dates applied |
| Attempt to create booking with past dates | Error thrown, booking blocked |

---

## Implementation Order

1. Add utility functions to `booking-utils.ts`
2. Update `SchedulerSelectionContext.tsx` to prevent selection
3. Update `BookingWizard.tsx` to filter prefill data
4. Update `useCreateBooking.ts` as final safeguard
