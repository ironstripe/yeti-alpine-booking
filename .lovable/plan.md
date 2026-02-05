
# UX Enhancement: Period Booking Flow

## Current State Analysis

### What Works
- `MiniSchedulerGrid` already supports Ctrl+Click multi-selection
- Selected slots show a blue ring + checkmark icon
- An action bar appears with "Auswahl übernehmen" button
- `applyMiniSchedulerSelection()` populates `dayTimeOverrides`

### What's Broken
1. **PeriodDayPlanner is hidden**: Currently in Step 3, inside a collapsed section. Users can't see their day-by-day schedule until after leaving Step 2.
2. **No instructional hint**: Users don't know about Ctrl+Click functionality.
3. **Delayed feedback**: After multi-selecting slots, users must click "Auswahl übernehmen" then navigate to Step 3 to verify their selections.

---

## Implementation Plan

### Phase 1: Move PeriodDayPlanner to Step 2

**File:** `src/components/bookings/wizard/Step2ProductAllocation.tsx`

**Changes:**
1. Import `PeriodDayPlanner` component
2. Render it immediately after the calendar when:
   - Product type is "private"
   - More than 1 date is selected
3. Pass the current state values as props

**Location:** After the calendar and time selection area (around line 537), add:

```jsx
{/* Period Day Planner - Show immediately for multi-day private lessons */}
{state.productType === "private" && state.selectedDates.length > 1 && (
  <div className="mt-4">
    <PeriodDayPlanner
      selectedDates={state.selectedDates}
      baseInstructor={state.instructor}
      baseTimeSlot={state.timeSlot}
      dayInstructorOverrides={state.dayInstructorOverrides}
      dayTimeOverrides={state.dayTimeOverrides}
      onInstructorChange={setDayInstructorOverride}
      onTimeChange={(date, startTime, endTime) => setDayTimeOverride(date, startTime, endTime)}
      onAddTimeBlock={addTimeBlock}
      onUpdateTimeBlock={updateTimeBlock}
      onRemoveTimeBlock={removeTimeBlock}
      onRemoveInstructorOverride={removeDayInstructorOverride}
      onRemoveTimeOverride={removeDayTimeOverride}
      sport={state.sport}
    />
  </div>
)}
```

**Context Functions to Add to Destructuring:** 
- `setDayInstructorOverride`
- `setDayTimeOverride`
- `addTimeBlock`
- `updateTimeBlock`
- `removeTimeBlock`
- `removeDayInstructorOverride`
- `removeDayTimeOverride`

---

### Phase 2: Add Instructional Hint for Multi-Select

**File:** `src/components/bookings/wizard/Step2ProductAllocation.tsx`

**Location:** Above the MiniSchedulerGrid (around line 867)

**Add:**
```jsx
{/* Multi-select instruction hint */}
{state.selectedDates.length > 1 && (
  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
    <Info className="h-3.5 w-3.5 flex-shrink-0" />
    <span>
      <strong>Tipp:</strong> Halte <kbd className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px] font-mono">Ctrl</kbd> gedrückt, um mehrere Zeitslots auszuwählen.
    </span>
  </div>
)}
```

---

### Phase 3: Live Update Flow

**Current Behavior:**
1. User Ctrl+Clicks slots → `toggleMiniSchedulerSlot()` adds to `miniSchedulerSelections[]`
2. User clicks "Auswahl übernehmen" → `applyMiniSchedulerSelection()` converts to `dayTimeOverrides`
3. User navigates to Step 3 to see PeriodDayPlanner

**New Behavior:**
1. User Ctrl+Clicks slots → Same as before
2. User clicks "Auswahl übernehmen" → `applyMiniSchedulerSelection()` runs
3. PeriodDayPlanner (now in Step 2) **immediately shows the updated day-by-day schedule**

This requires **no code changes** to the context - just moving the UI component.

---

### Phase 4: Remove Duplicate from Step 3

**File:** `src/components/bookings/wizard/Step3InstructorDetails.tsx`

**Changes:**
- Keep the `PeriodDayPlanner` in Step 3 as well, but set it to `defaultOpen={false}` since the primary editing now happens in Step 2
- Alternatively, remove it entirely from Step 3 if we want to avoid confusion

**Recommendation:** Keep it in Step 3 but collapsed by default, as a "review" option. Users who prefer to edit in Step 3 (after instructor selection) can still do so.

---

## Visual Flow After Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: PRODUCT & ALLOCATION                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Calendar with selected dates: 9, 10, 11]                       │
│                                                                 │
│ ZEITFENSTER                                                     │
│ [11:00 ▼] → [12:00 ▼]  2h                                       │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ 📅 TAGESÜBERSICHT                              [2 Tage]   │   │
│ │                                                           │   │
│ │ Mo., 09.02.2025                                           │   │
│ │   🕐 11:00 - 12:00  👤 Nicht zugewiesen                   │   │
│ │   [+ Zeitblock hinzufügen]                                │   │
│ │                                                           │   │
│ │ Di., 10.02.2025                                           │   │
│ │   🕐 11:00 - 12:00  👤 Nicht zugewiesen                   │   │
│ │   [+ Zeitblock hinzufügen]                                │   │
│ │                                                           │   │
│ │ Mi., 11.02.2025                                           │   │
│ │   🕐 11:00 - 12:00  👤 Nicht zugewiesen                   │   │
│ │   [+ Zeitblock hinzufügen]                                │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ ℹ️ Tipp: Halte Ctrl gedrückt, um mehrere Slots zu wählen  │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ [MINI SCHEDULER GRID - Instructor availability]                 │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ 3 Slots ausgewählt    [Abbrechen] [Auswahl übernehmen]    │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | Add PeriodDayPlanner, add context function imports, add multi-select hint |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Set PeriodDayPlanner `defaultOpen={false}` (optional) |

---

## Testing Checklist

- [ ] Select 3 dates → verify PeriodDayPlanner appears immediately in Step 2
- [ ] Change base time → verify all days update in PeriodDayPlanner
- [ ] Ctrl+Click 3 different time slots in mini-scheduler → verify action bar appears
- [ ] Click "Auswahl übernehmen" → verify PeriodDayPlanner updates with selected times
- [ ] Add a second time block for one day → verify it appears with "Zusätzlicher Block" badge
- [ ] Proceed to Step 3 → verify instructor selection still works
- [ ] Complete booking → verify all time blocks are saved correctly

---

## Estimated Effort

| Task | Time |
|------|------|
| Phase 1: Move PeriodDayPlanner | 30 min |
| Phase 2: Add instruction hint | 10 min |
| Phase 3: Verify live updates | 10 min |
| Phase 4: Adjust Step 3 | 10 min |
| Testing | 30 min |
| **Total** | **~1.5 hours** |
