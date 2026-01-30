
# Plan: Scheduler to Booking Wizard Data Prefill

## Problem Analysis

When initiating a booking from the scheduler, the `SelectionToolbar` correctly encodes instructor ID and appointment slots in URL parameters:
```typescript
// SelectionToolbar.tsx (line 47-60)
const params = new URLSearchParams({
  instructor: state.teacherId!,
  appointments: JSON.stringify(appointments), // [{date, startTime, durationMinutes}]
});
navigate(`/bookings/new?${params.toString()}`);
```

**However, `BookingWizard.tsx` never reads these parameters or calls `prefillFromScheduler`.**

The `BookingWizardContext` already has a `prefillFromScheduler` function (line 439-448) that sets:
- `instructorId`
- `appointments` 
- `selectedDates`
- `productType: "private"`

But this function is **never invoked**.

## Current Flow (Broken)
```text
Scheduler → Select Slots → "Ausgewählte buchen" 
  → /bookings/new?instructor=abc&appointments=[...]
  → BookingWizard renders Step 1 (no prefill applied)
  → User completes Step 1 → Step 2 shows (no dates/times prefilled)
  → User must manually re-enter dates and times
```

## Solution

### 1. Read Scheduler Params in BookingWizard

**File: `src/pages/BookingWizard.tsx`**

Add logic to read `instructor` and `appointments` from URL params and call `prefillFromScheduler`:

```typescript
// After existing URL param extraction (line 60-62)
const schedulerInstructorId = searchParams.get("instructor");
const schedulerAppointments = searchParams.get("appointments");

// New useEffect to apply scheduler prefill
useEffect(() => {
  if (!schedulerInstructorId || !schedulerAppointments) return;
  if (state.appointments) return; // Already applied

  try {
    const appointments = JSON.parse(schedulerAppointments);
    prefillFromScheduler(schedulerInstructorId, appointments);
    console.log("Applied scheduler prefill:", { schedulerInstructorId, appointments });
  } catch (e) {
    console.error("Failed to parse scheduler appointments:", e);
  }
}, [schedulerInstructorId, schedulerAppointments, prefillFromScheduler, state.appointments]);
```

### 2. Enhance prefillFromScheduler to Fetch Full Instructor

**File: `src/contexts/BookingWizardContext.tsx`**

The current `prefillFromScheduler` only sets `instructorId` but not the full `instructor` object. Step 3 needs the full object:

```typescript
const prefillFromScheduler = async (instructorId: string, appointments: AppointmentSlot[]) => {
  const dates = [...new Set(appointments.map((a) => a.date))];
  
  // Fetch full instructor record
  const { data: instructor } = await supabase
    .from("instructors")
    .select("*")
    .eq("id", instructorId)
    .single();
  
  setState((prev) => ({
    ...prev,
    instructorId,
    instructor: instructor || null,
    appointments,
    selectedDates: dates,
    productType: "private",
    assignLater: false, // Instructor is already assigned
  }));
};
```

### 3. Apply Time from Appointments to Step 2

**File: `src/components/bookings/wizard/Step2ProductAllocation.tsx`**

Add a useEffect to derive `timeSlot` and `duration` from `appointments`:

```typescript
// New effect to apply appointments data
useEffect(() => {
  if (state.appointments && state.appointments.length > 0 && !state.timeSlot) {
    const firstAppt = state.appointments[0];
    const startHour = parseInt(firstAppt.startTime.split(":")[0]);
    const endMinutes = startHour * 60 + firstAppt.durationMinutes;
    const endHour = Math.floor(endMinutes / 60);
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;
    
    const timeSlotValue = `${firstAppt.startTime} - ${endTime}`;
    setTimeSlot(timeSlotValue);
    setStartTime(firstAppt.startTime);
    setEndTime(endTime);
    setDuration(firstAppt.durationMinutes / 60);
    
    console.log("Applied time from scheduler appointments:", timeSlotValue);
  }
}, [state.appointments, state.timeSlot, setTimeSlot, setDuration]);
```

## Updated Flow (Fixed)
```text
Scheduler → Select Slots → "Ausgewählte buchen"
  → /bookings/new?instructor=abc&appointments=[{date:"2026-01-20",startTime:"10:00",durationMinutes:120}]
  → BookingWizard reads params → calls prefillFromScheduler
  → Context updated: instructorId, instructor, appointments, selectedDates, productType="private"
  → Step 1: User selects customer + participants
  → Step 2: Dates auto-selected, times prefilled (10:00 - 12:00), duration=2h
  → Step 3: Instructor already selected, "Später zuweisen" unchecked
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/BookingWizard.tsx` | Read `instructor` + `appointments` URL params, call `prefillFromScheduler` |
| `src/contexts/BookingWizardContext.tsx` | Enhance `prefillFromScheduler` to fetch full instructor object |
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | Derive timeSlot/duration from appointments |

## Technical Notes

- The `appointments` array supports multiple slots across different days with varying durations
- For multi-slot bookings, the first appointment's time is used for display; the full array is used for creating ticket_items
- Sport type (ski/snowboard) must still be selected in Step 2 since it's not captured in scheduler selection
