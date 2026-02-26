

# Replace Calendar with RangeDatePicker in Step2ProductAllocation

## What changes

Swap the basic `Calendar` component for the existing `RangeDatePicker` component in the date selection area of Step2ProductAllocation. This adds click-and-drag date selection while keeping all existing date picking functionality (single clicks, month navigation, past-date disabling).

## Technical details

### File: `src/components/bookings/wizard/Step2ProductAllocation.tsx`

1. **Update import**: Replace `Calendar` import with `RangeDatePicker` from `@/components/ui/range-date-picker`

2. **Replace the Calendar component** (lines 561-570) with:
   ```tsx
   <RangeDatePicker
     selected={state.selectedDates.map((d) => parseISO(d))}
     onSelect={(dates) => handleDateSelect(dates)}
     month={selectedMonth}
     onMonthChange={setSelectedMonth}
     minDate={new Date(new Date().setHours(0, 0, 0, 0))}
     showQuickActions={true}
     className="rounded-md border bg-background text-xs"
   />
   ```

3. **Simplify `handleDateSelect`** (lines 410-415): The `RangeDatePicker` always passes `Date[]` (never `undefined`), so the `undefined` check can be removed, but keeping it is harmless.

No other files need changes. The `RangeDatePicker` component already supports all needed features: drag selection, single click toggle, range mode, quick actions (Mo-Fr, full week), and visual selection summary.

