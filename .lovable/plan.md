

# Period Booking: Corrected Architecture Implementation

## Executive Summary

The current implementation creates **multiple `ticket_items`** (one per day) linked by `period_group_id`. The user's corrected architecture requires **ONE `ticket_item`** for the entire period with `start_date`/`end_date`, using a new **`ticket_item_overrides`** table for days that differ from the base.

This is a significant architectural change affecting the database, creation logic, and scheduler rendering.

---

## Current State Analysis

| Component | Current State |
|-----------|---------------|
| `ticket_item_overrides` table | **Does not exist** |
| `ticket_items` for period | Multiple rows (1 per day per participant) with `period_group_id` linking |
| `useCreateBooking.ts` | Creates N ticket_items in a loop |
| `numberOfPersons` | Manual +/- buttons (lines 626-648), not synced with participants |
| Per-day flexibility | None - same instructor/time for all days |

---

## Implementation Plan

### Phase A: Database Schema Change

**New Table: `ticket_item_overrides`**

```text
ticket_item_overrides
├── id (uuid, PK)
├── ticket_item_id (uuid, FK -> ticket_items.id)
├── override_date (date, NOT NULL)
├── instructor_id (uuid, FK -> instructors.id, NULLABLE)
├── start_time (time, NULLABLE)
├── end_time (time, NULLABLE)
├── price_adjustment (numeric, NULLABLE) -- for time-based price changes
├── created_at (timestamp)
├── updated_at (timestamp)
└── UNIQUE(ticket_item_id, override_date)
```

RLS Policies: Same as `ticket_items` (authenticated users can manage)

---

### Phase B: Fix Pricing Bug (Auto-Sync)

**File**: `src/components/bookings/wizard/Step2ProductDates.tsx`

**Current** (Lines 616-661):
```
Manual +/- buttons control numberOfPersons independent of selectedParticipants
```

**Change**:
1. Remove manual +/- buttons for private lessons
2. Add `useEffect` to auto-sync with `selectedParticipants.length`
3. Show read-only display

```typescript
// Auto-sync numberOfPersons with selected participants for private lessons
useEffect(() => {
  if (state.productType === "private") {
    const count = Math.min(state.selectedParticipants.length || 1, MAX_PERSONS);
    if (count !== state.numberOfPersons) {
      setNumberOfPersons(count);
    }
  }
}, [state.productType, state.selectedParticipants.length]);
```

**UI**: Replace interactive buttons with:
```
Teilnehmer: 2 Personen (basierend auf ausgewählten Teilnehmern)
```

---

### Phase C: Extend Booking Wizard State

**File**: `src/contexts/BookingWizardContext.tsx`

Add new state fields:

```typescript
interface BookingWizardState {
  // ... existing fields ...
  
  // Per-day overrides for period bookings
  dayInstructorOverrides: Record<string, string | null>;  // { "2025-02-10": "instructor-uuid" }
  dayTimeOverrides: Record<string, { startTime: string; endTime: string }>;
}
```

Add setters:

```typescript
setDayInstructorOverride: (date: string, instructorId: string | null) => void;
setDayTimeOverride: (date: string, startTime: string, endTime: string) => void;
clearDayOverrides: () => void;
```

Update `initialState`:
```typescript
dayInstructorOverrides: {},
dayTimeOverrides: {},
```

---

### Phase D: Create PeriodDayPlanner UI Component

**New File**: `src/components/bookings/wizard/PeriodDayPlanner.tsx`

Collapsible component shown in Step 3 for multi-day private lessons:

```text
┌─────────────────────────────────────────────────────────────────┐
│ 📅 Tagesplanung                                     [▼ Collapse]│
│ Standardwerte können für einzelne Tage überschrieben werden     │
├─────────────────────────────────────────────────────────────────┤
│ Mo, 10.02.                                                      │
│ [10:00▾] - [12:00▾]  [Leila A. ▾]                    ✓ Standard │
│                                                                 │
│ Di, 11.02.                                                      │
│ [10:00▾] - [12:00▾]  [Max M. ▾]                     ⚠ Angepasst │
│                                                                 │
│ Mi, 12.02.                                                      │
│ [09:00▾] - [11:00▾]  [Leila A. ▾]                   ⚠ Angepasst │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Default values inherit from base instructor/time slot
- Dropdowns to override instructor or time per day
- Visual badge: Green check for base, Amber warning for overrides
- Uses existing `InstructorSelector` component for instructor dropdown
- Availability check per row (reuse `useInstructorAvailabilityCheck`)

**Integration**: Add to `Step3InstructorDetails.tsx` below instructor selection, conditional on `selectedDates.length > 1 && productType === "private"`

---

### Phase E: Update Creation Logic (Critical)

**File**: `src/hooks/useCreateBooking.ts`

**REMOVE** the current loop that creates multiple `ticket_items` for period bookings.

**NEW LOGIC** for private period bookings:

```typescript
// Check if this is a period booking
const isPeriodBooking = state.productType === "private" && state.selectedDates.length > 1;

if (isPeriodBooking) {
  const sortedDates = [...state.selectedDates].sort();
  const baseStartTime = state.timeSlot?.split(" - ")[0] || "10:00";
  const baseEndTime = state.timeSlot?.split(" - ")[1] || "12:00";
  
  // Calculate total price for ALL days (including override variations)
  let totalPrice = 0;
  for (const dateStr of sortedDates) {
    const dayTime = state.dayTimeOverrides[dateStr] || { 
      startTime: baseStartTime, 
      endTime: baseEndTime 
    };
    const dayPrice = calculatePrivateLessonPrice(
      new Date(dateStr),
      dayTime.startTime,
      dayTime.endTime,
      participantCount,
      rates,
      highSeasonPeriods
    );
    totalPrice += dayPrice.totalPrice;
  }
  
  // Create ONE ticket_item for the entire period
  const { data: ticketItem } = await supabase
    .from("ticket_items")
    .insert({
      ticket_id: ticket.id,
      product_id: productId,
      date: sortedDates[0],           // start_date (or use dedicated field)
      // Note: ticket_items.date is start, need end_date field
      time_start: baseStartTime,
      time_end: baseEndTime,
      instructor_id: state.instructorId,  // base instructor
      unit_price: totalPrice,             // total for all days
      participant_id: state.selectedParticipants[0]?.id,
      meeting_point: state.meetingPoint,
      status: "booked",
      period_group_id: crypto.randomUUID(),
      // ... other fields
    })
    .select()
    .single();
  
  // Create overrides for days that differ from base
  const overrides = [];
  for (const dateStr of sortedDates) {
    const dayInstructor = state.dayInstructorOverrides[dateStr];
    const dayTime = state.dayTimeOverrides[dateStr];
    
    const hasInstructorOverride = dayInstructor && dayInstructor !== state.instructorId;
    const hasTimeOverride = dayTime && (
      dayTime.startTime !== baseStartTime || 
      dayTime.endTime !== baseEndTime
    );
    
    if (hasInstructorOverride || hasTimeOverride) {
      overrides.push({
        ticket_item_id: ticketItem.id,
        override_date: dateStr,
        instructor_id: hasInstructorOverride ? dayInstructor : null,
        start_time: hasTimeOverride ? dayTime.startTime : null,
        end_time: hasTimeOverride ? dayTime.endTime : null,
      });
    }
  }
  
  if (overrides.length > 0) {
    await supabase.from("ticket_item_overrides").insert(overrides);
  }
  
  // Create ticket_item_instructors entries
  await supabase.from("ticket_item_instructors").insert({
    ticket_item_id: ticketItem.id,
    instructor_id: state.instructorId,
  });
  
  // Also add override instructors
  const uniqueOverrideInstructors = [
    ...new Set(
      Object.values(state.dayInstructorOverrides)
        .filter(id => id && id !== state.instructorId)
    )
  ];
  for (const instructorId of uniqueOverrideInstructors) {
    await supabase.from("ticket_item_instructors").insert({
      ticket_item_id: ticketItem.id,
      instructor_id: instructorId,
    });
  }
}
```

---

### Phase F: Update Scheduler Rendering

The scheduler currently expands period bookings into daily blocks. This logic needs to:

1. Read the single `ticket_item` with its date range
2. Generate daily blocks for each date in the range
3. Apply overrides from `ticket_item_overrides` for specific days

**Files to check/modify**:
- `src/components/scheduler/hooks/useSchedulerData.ts`
- `src/components/scheduler/utils/periodBlockUtils.ts` (if exists)

The scheduler should query:
```sql
SELECT ti.*, tio.*
FROM ticket_items ti
LEFT JOIN ticket_item_overrides tio ON tio.ticket_item_id = ti.id
WHERE ti.period_group_id IS NOT NULL
```

---

### Phase G: Prefill from Scheduler

**File**: `src/contexts/BookingWizardContext.tsx`

Update `prefillFromScheduler` to preserve per-day times:

```typescript
const prefillFromScheduler = async (instructorId: string, appointments: AppointmentSlot[]) => {
  // ... existing logic ...
  
  // If appointments have different times, set up day overrides
  const timeOverrides: Record<string, { startTime: string; endTime: string }> = {};
  const baseAppt = appointments[0];
  const baseEndTime = calculateEndTime(baseAppt.startTime, baseAppt.durationMinutes);
  
  for (const appt of appointments) {
    const apptEndTime = calculateEndTime(appt.startTime, appt.durationMinutes);
    if (appt.startTime !== baseAppt.startTime || apptEndTime !== baseEndTime) {
      timeOverrides[appt.date] = {
        startTime: appt.startTime,
        endTime: apptEndTime,
      };
    }
  }
  
  setState(prev => ({
    ...prev,
    dayTimeOverrides: timeOverrides,
    // ... other fields
  }));
};
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Add `ticket_item_overrides` table |
| `src/components/bookings/wizard/Step2ProductDates.tsx` | Modify | Auto-sync `numberOfPersons` |
| `src/contexts/BookingWizardContext.tsx` | Modify | Add override state fields and setters |
| `src/components/bookings/wizard/PeriodDayPlanner.tsx` | Create | Per-day configuration UI |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Modify | Integrate `PeriodDayPlanner` |
| `src/hooks/useCreateBooking.ts` | Modify | Create ONE ticket_item + overrides |
| Scheduler data hooks | Modify | Expand single ticket_item with overrides |

---

## Implementation Order

1. **Phase A** - Database: Create `ticket_item_overrides` table
2. **Phase B** - Quick fix: Auto-sync `numberOfPersons` (immediate pricing fix)
3. **Phase C** - State: Add override fields to context
4. **Phase D** - UI: Create `PeriodDayPlanner` component
5. **Phase E** - Backend: Update `useCreateBooking` (critical)
6. **Phase F** - Scheduler: Update rendering to use overrides
7. **Phase G** - Integration: Prefill from scheduler appointments

---

## Expected Behavior After Implementation

| Scenario | Result |
|----------|--------|
| 2 participants selected | `numberOfPersons` auto-sets to 2, correct pricing |
| 3-day period, same settings | ONE `ticket_item`, zero overrides |
| 3-day period, Tuesday different instructor | ONE `ticket_item` + 1 override row |
| 3-day period, different times from scheduler | ONE `ticket_item` + N override rows for differing times |
| Scheduler view | Expands single item into daily blocks, applies overrides |
| Invoice | Single line item with total price |

---

## Technical Notes

### Why ONE ticket_item vs multiple?

| Aspect | Multiple Items | Single Item + Overrides |
|--------|----------------|-------------------------|
| Invoice | Complex grouping | Simple single line |
| Referential integrity | Fragmented | Unified |
| Edit booking | Update many rows | Update one + overrides |
| Cancellation | Cancel many rows | Cancel one |
| Scheduler | Already handles expansion | Same expansion logic |

### Backward Compatibility

Existing bookings with multiple `ticket_items` linked by `period_group_id` will continue to work. New bookings will use the single-item architecture.

