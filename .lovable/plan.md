
# Dynamic Private Lesson Booking for Multiple Participants (V2)

## Overview

Implement a grouping algorithm that automatically splits participants into compatible instructor groups based on skill level, then presents this proposal in the booking wizard UI so staff can review, customize instructors per group, and finalize in a single transaction.

## Current State

- The wizard already supports up to 6 participants per booking
- Existing "Individuelle Buchung" mode handles different skill levels by splitting into separate product bookings
- Private lessons currently assign a single instructor to all participants
- Skill levels exist in the `skill_levels` table with `sort_order`, `target_group` (adult/child), and `color` fields
- Adults use 4-tier color levels (green=1, blue=2, red=3, black=4); children use training-based levels (sort_order 1-10 for ski)

## Implementation Plan

### Part 1: Grouping Algorithm (Pure TypeScript Utility)

**New file: `src/lib/private-lesson-grouping.ts`**

A client-side utility (no edge function needed -- all data is already available in the wizard context) that:

1. Takes a list of participants with their skill levels and birth dates
2. Resolves each participant's `sort_order` by:
   - For adults (>16): mapping `level_current_season` color values to adult sort_order (green=1, blue=2, red=3, black=4)
   - For children (<=16): mapping `level_current_season` legacy values to child sort_order from `LEVEL_HIERARCHY` index
   - Unknown/missing levels default to sort_order 1 (beginner)
3. Applies compatibility rules:
   - **Rule 0 (Max Group Size)**: Max 5 participants per group
   - **Rule A (Beginner Lock)**: sort_order=1 participants only group with other sort_order=1
   - **Rule B (Advanced Flex)**: If all participants have sort_order >= 5 (children only), allow difference up to 2
   - **Rule C (Standard)**: Otherwise, max sort_order difference of 1
   - **Rule D (Adult/Child Mix)**: Map adult colors to child tiers (Green=1-2, Blue=3-4, Red=5-6, Black=7+). If the mapped tiers overlap, they are compatible but generate a soft warning
4. Groups participants greedily: sort by sort_order ascending, then iterate and assign to existing groups or create new ones
5. Returns: `{ groups: Group[], warnings: string[] }` where each Group has `{ participants, sortOrderRange, warning? }`

### Part 2: Price Calculation Per Group

**Update: `src/lib/pricing/private-lesson-pricing.ts`**

Add a helper function `calculateMultiGroupPrice()` that:
- Takes an array of groups (each with participant count)
- For each group: `basePrice + (participantCount - 1) * additionalPersonRate`
- Returns per-group prices and total

### Part 3: Wizard Context Updates

**Update: `src/contexts/BookingWizardContext.tsx`**

Add new state fields for the multi-group private lesson flow:

```text
privateGroupProposal: {
  groups: Array<{
    id: string
    participantIds: string[]
    instructorId: string | null
    instructor: Instructor | null
    startTime: string | null
    endTime: string | null
  }>
} | null
```

Add actions: `setPrivateGroupProposal`, `setGroupInstructor`, `setGroupTime`

### Part 4: UI - Grouping Proposal in Step 2

**Update: `src/components/bookings/wizard/Step2ProductDates.tsx`**

When `productType === "private"` and `selectedParticipants.length > 1`:

1. After the user selects dates and base time slot, automatically run the grouping algorithm
2. If all participants fit in 1 group (compatible): show current flow unchanged (single instructor)
3. If participants need multiple groups: render a **Group Proposal Panel**:

```text
+------------------------------------------+
| Gruppenvorschlag                         |
| 2 Gruppen erforderlich                   |
+------------------------------------------+
| Gruppe 1 (3 Personen)                    |
| - Lisa (Anfanger), Max (Anfanger),       |
|   Tom (Anfanger)                         |
| Skilehrer: [Dropdown v]                  |
| Zeit: 10:00 - 12:00 [Change]            |
| Preis: CHF 85 + 2x20 = CHF 125          |
+------------------------------------------+
| Gruppe 2 (2 Personen)                    |
| - Sarah (Rote Piste), Jan (Rote Piste)   |
| Skilehrer: [Dropdown v]                  |
| Zeit: 10:00 - 12:00 [Change]            |
| Preis: CHF 85 + 1x20 = CHF 105          |
+------------------------------------------+
| Warnung: Mischung von Erwachsenen und    |
| Kindern kann die Lerneffektivitat        |
| reduzieren.                              |
+------------------------------------------+
| Gesamtpreis: CHF 230                     |
+------------------------------------------+
```

Each group gets:
- Its own instructor dropdown (reusing `InstructorSelection` component or a simplified version)
- Its own time slot selection (start/end dropdowns)
- A price breakdown line

### Part 5: New Component - PrivateGroupProposal

**New file: `src/components/bookings/wizard/PrivateGroupProposal.tsx`**

A dedicated component that:
- Displays the grouped participants as cards
- Shows skill level badges for each participant
- Provides instructor selection per group (filtered by sport and availability)
- Shows time selection per group
- Displays per-group and total pricing
- Renders Rule D warnings inline

### Part 6: Step 3 Adjustments

**Update: `src/components/bookings/wizard/Step3InstructorDetails.tsx`**

When a multi-group proposal is active:
- Skip the single instructor selection (already done per-group in Step 2)
- Show a read-only summary of group assignments
- Keep meeting point, preferences, and notes sections as-is

### Part 7: Booking Creation

**Update: `src/hooks/useCreateBooking.ts`**

When `privateGroupProposal` is set:
- Create one ticket (parent)
- For each group, create `ticket_items` with the group's specific instructor, time, and per-group pricing
- Each participant in a group gets their own `ticket_item` row linked to that group's instructor

### Part 8: Step 4 Summary

**Update: `src/components/bookings/wizard/Step4Summary.tsx` and `BookingSummaryCards.tsx`**

Show the multi-group breakdown in the summary:
- Group 1: participants, instructor, time, price
- Group 2: participants, instructor, time, price
- Total price

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/private-lesson-grouping.ts` | Grouping algorithm + compatibility rules |
| `src/components/bookings/wizard/PrivateGroupProposal.tsx` | Multi-group UI component |

## Files to Modify

| File | Change |
|------|--------|
| `src/contexts/BookingWizardContext.tsx` | Add `privateGroupProposal` state + actions |
| `src/components/bookings/wizard/Step2ProductDates.tsx` | Integrate grouping algorithm, render proposal |
| `src/components/bookings/wizard/Step3InstructorDetails.tsx` | Skip single instructor when multi-group active |
| `src/components/bookings/wizard/Step4Summary.tsx` | Show multi-group summary |
| `src/components/bookings/wizard/BookingSummaryCards.tsx` | Render group breakdown |
| `src/components/bookings/wizard/PriceBreakdown.tsx` | Support multi-group pricing |
| `src/hooks/useCreateBooking.ts` | Create ticket_items per group with correct instructors |

## No Database Changes Required

All grouping logic runs client-side using existing `skill_levels` data. The `ticket_items` table already supports different `instructor_id` values per row, so multi-instructor bookings work with the current schema.

## Key Design Decisions

- **Client-side algorithm**: No edge function needed since skill level data is small and already cached
- **Max 5 per group** (not per booking): The existing 6-participant booking limit stays, but groups within are capped at 5
- **Greedy grouping**: Simple and predictable; sorts by level then fills groups sequentially
- **Instructor selection per group in Step 2**: Keeps the flow compact rather than spreading across steps
- **Backward compatible**: Single-participant and compatible-group bookings continue to work exactly as before
