
# Fix: Time Block Sync Between Mini-Scheduler and PeriodDayPlanner

## Root Cause

When a user applies their mini-scheduler multi-selection, the context correctly updates `state.timeSlot` to the most frequent selected time (e.g., "12:00 - 13:00"). However, a useEffect in Step2 immediately **overwrites it** with the stale local dropdown values ("10:00 - 12:00") because:

1. `setTimeSlot` is recreated on every render (no `useCallback`), triggering the write effect
2. The sync effect only runs when local state is null, so it never picks up the new context value

This is why Feb 11 (and any date without an explicit override) shows the old time picker value instead of the time selected in the scheduler.

## Fix Strategy

Use a ref-based mechanism to distinguish between **local changes** (user picks from dropdowns) and **external changes** (applyMiniSchedulerSelection updates context). This prevents the write effect from overwriting external updates.

---

## Changes

### File 1: `src/components/bookings/wizard/Step2ProductAllocation.tsx`

**Replace the two sync/write useEffects (lines 211-232) with a ref-guarded version:**

- Add a `localTimeSlotRef` that tracks the last value written by the local dropdowns
- **Write effect**: Still writes local startTime/endTime to context, but also updates the ref. Remove `setTimeSlot`/`setDuration` from dependencies to prevent re-firing on function reference changes.
- **Sync effect**: Detects when `state.timeSlot` differs from the ref (meaning it was changed externally), and syncs local state accordingly. Sets the ref to prevent the subsequent write effect from overwriting.

```text
Before:
  useEffect → writes local startTime/endTime to context (fires too often)
  useEffect → syncs context to local (only when local is null)

After:
  ref tracks last locally-written timeSlot
  useEffect → writes local to context + updates ref
  useEffect → if context differs from ref, sync context to local + update ref
```

**Also update `handleApplyMultiSelection`**: After calling `applyMiniSchedulerSelection()`, read the new `state.timeSlot` from context and update local `startTime`/`endTime` directly to stay in sync.

### File 2: `src/contexts/BookingWizardContext.tsx` (minor)

Wrap `setTimeSlot` and `setDuration` in `useCallback` to prevent unnecessary effect re-triggers across all consumers.

---

## Data Flow After Fix

```text
User picks time dropdown:
  startTime/endTime change → write effect → context.timeSlot updated → ref updated

User clicks "Auswahl übernehmen":
  applyMiniSchedulerSelection() → context.timeSlot = "12:00 - 13:00"
  → sync effect detects mismatch with ref
  → updates local startTime="12:00", endTime="13:00"
  → updates ref to "12:00 - 13:00"
  → write effect fires but value matches → no-op

PeriodDayPlanner:
  receives baseTimeSlot="12:00 - 13:00" → shows correct time for all dates
  Feb 11 (no override) falls back to base → shows 12:00 - 13:00 (correct)
```

---

## Testing Checklist

- Select base time 10:00-12:00 from dropdowns
- Multi-select 3 slots in mini-scheduler at different times (e.g., 11-12, 12-13, 12-13)
- Click "Auswahl übernehmen"
- Verify PeriodDayPlanner shows: base time = 12:00-13:00, overrides for slots that differ
- Verify Feb 11 shows the correct time (not 10:00-12:00)
- Verify time picker dropdowns update to match the new base time
- Verify manually changing time picker still works after applying selection
