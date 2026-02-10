

# Continue Multi-Group Ticket Implementation

## Remaining Work

Three areas need completion to finalize the multi-group private lesson booking flow:

### 1. Ticket Items Creation (`useCreateBooking.ts`)

Currently, when `privateGroupProposal` has multiple groups, the pricing calculation is skipped (line 109) but the actual ticket_items generation still follows the single-instructor shared booking path. This means all participants get the same instructor, time, and price -- ignoring the per-group assignments.

**Changes:**
- After the existing `if (!state.privateGroupProposal || ...groups.length <= 1)` block (around line 109), add a new branch that handles multi-group creation
- For each group in `privateGroupProposal.groups`:
  - Calculate the per-group price using `calculatePrivateLessonPrice` with the group's specific `startTime`/`endTime` and `participantCount`
  - For each participant in that group, for each selected date, create a `ticket_item` with:
    - The group's `instructorId` (not the global `state.instructorId`)
    - The group's `startTime`/`endTime`
    - The group's calculated `unitPrice`
- Recalculate and update the ticket `total_amount` from the sum of all group items
- Handle period metadata creation per group (if multi-day)
- Skip the normal shared booking item creation when multi-group is active

### 2. Price Breakdown Display (`PriceBreakdown.tsx`)

The price breakdown currently only shows a single private lesson line item. When multi-group is active, it should show per-group pricing.

**Changes:**
- Add a check for `state.privateGroupProposal?.groups.length > 1`
- When active, render one line item per group showing:
  - "Gruppe 1 (N Personen)" with time slot and price
  - Base price + additional person surcharge breakdown
  - "Gruppe 2 (N Personen)" similarly
- Sum all groups for the subtotal instead of using `unitPrice * daysCount`

### 3. Summary Cards Multi-Group Course Card (`BookingSummaryCards.tsx`)

The Course Card currently shows dates with `InlineTimeBlockEditor` assuming a single time slot. When multi-group is active, the course card should reflect per-group time slots instead of the global one.

**Changes:**
- When `privateGroupProposal` has multiple groups, show dates grouped by time slot per group
- Each group's time should be displayed alongside its participants

## Technical Details

### useCreateBooking.ts -- Multi-group branch (inserted around line 327)

```text
// Before the existing shared booking loop at line 367:
if (state.privateGroupProposal && state.privateGroupProposal.groups.length > 1) {
  // For each group:
  //   1. Get group's startTime, endTime, instructorId
  //   2. Calculate price via calculatePrivateLessonPrice(date, startTime, endTime, participantCount, rates, highSeasonPeriods)
  //   3. For each participant in group, for each date, push ticket_item with group-specific values
  //   4. Handle period metadata if multi-day
  // Skip the normal "else" shared booking path
}
```

### PriceBreakdown.tsx -- Multi-group section (replacing private lesson block around line 326)

```text
When privateGroupProposal has >1 groups:
  - For each group, calculate price using calculateMultiGroupPrice
  - Show "Gruppe 1 (3 Personen) - 10:00-12:00: CHF X"
  - Show "Gruppe 2 (2 Personen) - 10:00-12:00: CHF Y"
  - Use sum as courseTotal
```

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useCreateBooking.ts` | Add multi-group ticket_items creation branch + total recalculation |
| `src/components/bookings/wizard/PriceBreakdown.tsx` | Add multi-group pricing display |
| `src/components/bookings/wizard/BookingSummaryCards.tsx` | Show per-group time info in course card |

