

# UX Enhancement: Inline Time Block Editing on Confirmation Page

## Problem Summary

When users multi-select time slots with different times in the mini-scheduler, the confirmation page ("KURS" card) doesn't reflect these differences. It shows the same base time for all dates, making it impossible to verify or adjust selections without navigating back through multiple steps.

## The User Journey Today (Broken)

```
1. Mini-Scheduler → Select Fri 12-13, Sat 11-12, Sun 13-14
2. Click "Auswahl übernehmen"
3. Proceed to Step 3, then Step 4 (Confirmation)
4. KURS card shows:
   - Fr., 06.02.2026  12:00 - 13:00
   - Sa., 07.02.2026  12:00 - 13:00  ← WRONG! Should be 11:00-12:00
   - So., 08.02.2026  12:00 - 13:00  ← WRONG! Should be 13:00-14:00
5. To fix: Click "Ändern" → Step 2 → Navigate to Step 3 → Open PeriodDayPlanner
```

## The Ideal User Journey (Proposed)

```
1. Mini-Scheduler → Select Fri 12-13, Sat 11-12, Sun 13-14
2. Click "Auswahl übernehmen"
3. Proceed to Confirmation
4. KURS card shows actual times with inline editing:
   +------------------------------------------+
   | KURS                            [Ändern] |
   +------------------------------------------+
   | Privatstunde · 1 Stunde · Ski            |
   |                                          |
   | ⏱ Fr., 06.02.2026  12:00 - 13:00        |
   |   [+ Zeitblock]                          |
   |                                          |
   | ⏱ Sa., 07.02.2026  11:00 - 12:00  ⚠️    |
   |   [+ Zeitblock]                          |
   |                                          |
   | ⏱ So., 08.02.2026  13:00 - 14:00  ⚠️    |
   |   [+ Zeitblock]                          |
   +------------------------------------------+
```

---

## Implementation Plan

### Phase 1: Fix Display in BookingSummaryCards

**File:** `src/components/bookings/wizard/BookingSummaryCards.tsx`

Update the "KURS" card to:
- Read `state.dayTimeOverrides` for each date
- Display the actual time per day (not just `state.timeSlot`)
- Show a warning badge if time differs from base

**Current Code (Lines 129-141):**
```jsx
<div className="space-y-1">
  {state.selectedDates.map((dateStr) => (
    <div key={dateStr} className="...">
      <Calendar className="h-4 w-4" />
      <span>{format(date, "EEE, dd.MM.yyyy")}</span>
      {state.timeSlot && <span>{state.timeSlot}</span>}  // ← Always shows base time
    </div>
  ))}
</div>
```

**New Code:**
```jsx
<div className="space-y-2">
  {state.selectedDates.map((dateStr) => {
    const dayBlocks = state.dayTimeOverrides[dateStr] || [];
    const hasOverrides = dayBlocks.length > 0;
    const blocksToShow = hasOverrides 
      ? dayBlocks 
      : [{ id: 'base', startTime: baseStart, endTime: baseEnd }];
    
    return (
      <div key={dateStr}>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">
            {format(new Date(dateStr), "EEE, dd.MM.yyyy")}
          </span>
        </div>
        {blocksToShow.map((block, i) => (
          <div key={block.id} className="ml-6 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{block.startTime} - {block.endTime}</span>
            {hasOverrides && <Badge variant="outline">Angepasst</Badge>}
          </div>
        ))}
      </div>
    );
  })}
</div>
```

---

### Phase 2: Add Inline "+ Zeitblock" Functionality

**Option A: Minimal (Recommended)**
Add a simple "+ Zeitblock" link under each day that expands a compact time picker inline:

```
| ⏱ Fr., 06.02.2026  12:00 - 13:00        |
|   [+ Zeitblock hinzufügen]               |
|                                          |
| ⏱ Sa., 07.02.2026  11:00 - 12:00        |
|   ⏱ 14:00 - 16:00  [🗑️]                 | ← Additional block
|   [+ Zeitblock hinzufügen]               |
```

Clicking "+ Zeitblock" shows a mini-form:
```
| [10:00 ▼] bis [12:00 ▼] [Hinzufügen] [×] |
```

**Option B: Full Inline PeriodDayPlanner**
Embed a simplified version of PeriodDayPlanner directly in the KURS card. More powerful but adds complexity to the confirmation page.

---

### Phase 3: Connect to Context Functions

The `BookingWizardContext` already has all required functions:
- `addTimeBlock(date, startTime, endTime, instructorId?)`
- `updateTimeBlock(date, blockId, startTime, endTime, instructorId?)`
- `removeTimeBlock(date, blockId)`
- `setDayTimeOverride(date, startTime, endTime)`

Wire these to the inline UI components.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/bookings/wizard/BookingSummaryCards.tsx` | Display actual per-day times, add inline "+ Zeitblock" |
| `src/contexts/BookingWizardContext.tsx` | No changes needed (functions already exist) |

---

## Visual Design

**Default State (Single Block Per Day):**
```
┌─────────────────────────────────────────┐
│ 📅 Fr., 06.02.2026   12:00 - 13:00      │
│    [+ Zeitblock]                        │
└─────────────────────────────────────────┘
```

**Expanded State (Adding Block):**
```
┌─────────────────────────────────────────┐
│ 📅 Fr., 06.02.2026   12:00 - 13:00      │
│    ┌────────────────────────────────┐   │
│    │ [14:00 ▼] bis [16:00 ▼]        │   │
│    │        [Hinzufügen] [Abbrechen]│   │
│    └────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Multiple Blocks:**
```
┌─────────────────────────────────────────┐
│ 📅 Fr., 06.02.2026                      │
│    ⏱ 10:00 - 12:00                      │
│    ⏱ 14:00 - 16:00  [🗑️]               │
│    [+ Zeitblock]                        │
└─────────────────────────────────────────┘
```

---

## UX Benefits

1. **Transparency**: Users see exactly what they selected
2. **Direct Manipulation**: Add/remove blocks without leaving the page
3. **Reduced Friction**: No need to navigate back 2 steps to make small adjustments
4. **Error Prevention**: Visual confirmation before final booking

---

## Testing Checklist

- [ ] Multi-select different times in mini-scheduler → confirm actual times shown in KURS card
- [ ] Click "+ Zeitblock" → verify inline form appears
- [ ] Add a second block → verify it appears in list
- [ ] Remove a block → verify it disappears
- [ ] Complete booking → verify ticket_items created correctly with all blocks

---

## Estimated Effort

| Task | Time |
|------|------|
| Phase 1: Fix display | 0.5 days |
| Phase 2: Add inline editing | 1 day |
| Phase 3: Testing | 0.5 days |
| **Total** | **2 days** |

