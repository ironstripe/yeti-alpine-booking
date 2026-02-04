

# Phase 6: Period Booking Creation in Wizard

## Current State

The booking flow from the scheduler is already partially implemented:
1. Users can select multiple time slots in the scheduler (drag/shift+click)
2. The `SelectionToolbar` passes appointments to the wizard via URL: `/bookings/new?instructor=X&appointments=[...]`
3. The `BookingWizardContext.prefillFromScheduler()` pre-fills instructor and dates
4. The `useCreateBooking` hook creates individual `ticket_items` per date

**Gap**: When creating multi-day private lessons, the system does NOT:
- Generate a `period_group_id` to link the days together
- Create `ticket_item_period_metadata` to store the base configuration
- Check instructor availability across the entire period

---

## Implementation Plan

### 1. Add Availability Check Hook

**New File**: `src/hooks/useInstructorAvailabilityCheck.ts`

Create a hook that checks an instructor's availability for a date range at a specific time:

```typescript
interface AvailabilityCheckParams {
  instructorId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

interface ConflictResult {
  date: string;
  conflictType: "private" | "group" | "absence" | "office";
  description: string;
}

export function useInstructorAvailabilityCheck() {
  return useMutation({
    mutationFn: async (params: AvailabilityCheckParams): Promise<ConflictResult[]> => {
      // Query ticket_items, group_course_instances, instructor_absences
      // for the date range and check for time overlaps
    }
  });
}
```

**Logic**:
- Generate all dates between startDate and endDate
- For each date, check for overlapping bookings (ticket_items, group_course_instances)
- Check for absences (instructor_absences, instructor_recurring_blocks)
- Return array of conflicts with human-readable descriptions

---

### 2. Update useCreateBooking Hook

**File**: `src/hooks/useCreateBooking.ts`

Modify the private lesson creation logic to:

1. **Detect period bookings**: If `state.selectedDates.length > 1` for private lessons
2. **Generate period_group_id**: Create a UUID to link all ticket_items
3. **Create ticket_item_period_metadata**: Store base configuration

```typescript
// Inside mutationFn, after creating ticket but before creating ticket_items:

// Check if this is a period booking (multi-day private lesson)
const isPeriodBooking = state.productType === "private" && state.selectedDates.length > 1;
let periodGroupId: string | null = null;

if (isPeriodBooking) {
  // Generate period group ID
  periodGroupId = crypto.randomUUID();
  
  // Sort dates to get range
  const sortedDates = [...state.selectedDates].sort();
  const periodStartDate = sortedDates[0];
  const periodEndDate = sortedDates[sortedDates.length - 1];
  
  // Create period metadata
  const { error: metadataError } = await supabase
    .from("ticket_item_period_metadata")
    .insert({
      period_group_id: periodGroupId,
      base_instructor_id: state.instructorId,
      base_time_start: state.timeSlot?.split(" - ")[0] || "10:00",
      base_time_end: state.timeSlot?.split(" - ")[1] || "12:00",
      start_date: periodStartDate,
      end_date: periodEndDate,
    });
  
  if (metadataError) throw metadataError;
}

// Then, when creating ticket_items, add period_group_id:
ticketItems.push({
  // ... existing fields ...
  period_group_id: periodGroupId, // Add this
  is_period_override: false,       // Add this
});
```

---

### 3. Update Booking Wizard UI

**File**: `src/components/bookings/wizard/Step3InstructorDetails.tsx`

Add an availability check section when an instructor is selected for multi-day bookings:

- Trigger availability check when instructor is selected
- Display results:
  - **Green**: "Lehrer ist für den gesamten Zeitraum verfügbar"
  - **Yellow/Warning**: List conflicting days with details
- Allow proceeding with conflicts (non-blocking warning)

```tsx
// Add to Step3InstructorDetails.tsx
const { mutate: checkAvailability, data: conflicts, isPending } = useInstructorAvailabilityCheck();

// Trigger when instructor changes
useEffect(() => {
  if (state.instructorId && state.selectedDates.length > 1) {
    checkAvailability({
      instructorId: state.instructorId,
      startDate: state.selectedDates[0],
      endDate: state.selectedDates[state.selectedDates.length - 1],
      startTime: state.timeSlot?.split(" - ")[0] || "10:00",
      endTime: state.timeSlot?.split(" - ")[1] || "12:00",
    });
  }
}, [state.instructorId, state.selectedDates, state.timeSlot]);

// Render availability status
{state.selectedDates.length > 1 && state.instructorId && (
  <AvailabilityStatus conflicts={conflicts} isLoading={isPending} />
)}
```

---

### 4. Create Availability Status Component

**New File**: `src/components/bookings/wizard/AvailabilityStatus.tsx`

```tsx
interface AvailabilityStatusProps {
  conflicts: ConflictResult[] | undefined;
  isLoading: boolean;
}

export function AvailabilityStatus({ conflicts, isLoading }: AvailabilityStatusProps) {
  if (isLoading) {
    return <Skeleton className="h-12 w-full" />;
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription>
          Lehrer ist für den gesamten Zeitraum verfügbar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-amber-200 bg-amber-50">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle>Konflikte gefunden</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1">
          {conflicts.map((c, i) => (
            <li key={i} className="text-sm">
              {formatDate(c.date)} - {c.description}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Die Buchung kann trotzdem erstellt werden. Konflikte müssen später aufgelöst werden.
        </p>
      </AlertDescription>
    </Alert>
  );
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useInstructorAvailabilityCheck.ts` | Create | Check instructor availability for date range |
| `src/hooks/useCreateBooking.ts` | Modify | Add period_group_id and metadata creation |
| `src/components/bookings/wizard/AvailabilityStatus.tsx` | Create | Display availability check results |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Modify | Integrate availability check UI |

---

## Key Implementation Details

### Period Detection Logic

A booking is considered a "period booking" when:
- `productType === "private"`
- `selectedDates.length > 1`
- All dates share the same time slot and instructor

### UUID Generation

Use `crypto.randomUUID()` which is available in modern browsers and Deno runtime.

### Non-Blocking Warnings

Conflicts should be warnings, not blockers. Users may intentionally create overlapping bookings that will be resolved later by:
- Assigning a different instructor for specific days (using the override system)
- Canceling conflicting bookings

---

## Test Scenarios

1. **Single-day booking**: No period_group_id created, behaves as before
2. **Multi-day booking (no conflicts)**: 
   - period_group_id generated
   - metadata created with base configuration
   - Green availability status shown
3. **Multi-day booking (with conflicts)**:
   - Same as above
   - Yellow warning with conflict list
   - Booking can still be created
4. **Edit existing period booking**: Not part of this phase (handled by Phase 4 modification logic)

