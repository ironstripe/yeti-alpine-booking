

# Display Vegetarian Option in Price Breakdown and Summary

## Problem

The vegetarian option for Mittagsbetreuung (lunch care) is correctly stored and saved to the database in both shared and individual booking modes. However, it is **not displayed** in:

1. **PriceBreakdown** - The lunch section only shows total days and price, not which participants have vegetarian meals
2. **BookingSummaryCards** - Missing lunch details entirely for each participant

## Current Data Flow

The vegetarian option is properly tracked in:
- **Shared mode**: `state.vegetarianSelections[participantId]` 
- **Individual mode**: `state.participantBookings[participantId].isVegetarian`

Both paths correctly save to `ticket_items.is_vegetarian` during booking creation.

---

## Solution

### Changes to PriceBreakdown.tsx

Add per-participant lunch breakdown with vegetarian indicator:

```text
Before:
┌─────────────────────────────────────────────────────────┐
│ Mittagsbetreuung                                        │
│   8 Tage × CHF 25.00                    CHF 200.00      │
└─────────────────────────────────────────────────────────┘

After:
┌─────────────────────────────────────────────────────────┐
│ Mittagsbetreuung                                        │
│   Robin Mustermann: 4 Tage 🥬           CHF 100.00      │
│   Lisa Mustermann: 4 Tage               CHF 100.00      │
└─────────────────────────────────────────────────────────┘
```

### Changes to BookingSummaryCards.tsx

Add a lunch section in the Course card showing:
- Which participants have lunch
- Which days for each participant
- Vegetarian indicator (🥬 or badge)

---

## Implementation Steps

### Step 1: Update PriceBreakdown.tsx

1. Build per-participant lunch data structure
2. For **individual mode**: Read from `state.participantBookings[id].lunchDays` and `.isVegetarian`
3. For **shared mode**: Read from `state.lunchSelections[id]` and `state.vegetarianSelections[id]`
4. Render individual lunch lines with vegetarian badge

### Step 2: Update BookingSummaryCards.tsx

1. Add a new "Mittagsbetreuung" section in the summary
2. Show each participant who has lunch days selected
3. Display their selected days
4. Show vegetarian indicator (Leaf icon or badge)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/PriceBreakdown.tsx` | 1. Calculate per-participant lunch details<br>2. Include vegetarian flag per participant<br>3. Display individual lunch lines with 🥬 indicator |
| `src/components/bookings/wizard/BookingSummaryCards.tsx` | 1. Add lunch summary section<br>2. Show per-participant lunch days<br>3. Display vegetarian preference with badge |

---

## Expected Result

### PriceBreakdown
```text
┌─────────────────────────────────────────────────────────┐
│ Preisdetails                                            │
├─────────────────────────────────────────────────────────┤
│ Robin Mustermann                                        │
│   Red Prince/Princess · 4 Tage          CHF 285.00      │
│                                                         │
│ Lisa Mustermann                                         │
│   Blue King/Queen · 4 Tage              CHF 285.00      │
│                                                         │
│ Mittagsbetreuung                                        │
│   Robin: 4 Tage × CHF 25           🥬   CHF 100.00      │
│   Lisa: 4 Tage × CHF 25                 CHF 100.00      │
├─────────────────────────────────────────────────────────┤
│ Zwischensumme                           CHF 770.00      │
│ MwSt. (7.7%)                            CHF  59.29      │
├─────────────────────────────────────────────────────────┤
│ TOTAL                                   CHF 770.00      │
└─────────────────────────────────────────────────────────┘
```

### BookingSummaryCards - New Lunch Section
```text
┌─────────────────────────────────────────────────────────┐
│ MITTAGSBETREUUNG                          [Ändern]      │
├─────────────────────────────────────────────────────────┤
│ 🍽️ Robin Mustermann                                     │
│    Mo, Di, Mi, Do · 🥬 Vegetarisch                      │
│                                                         │
│ 🍽️ Lisa Mustermann                                      │
│    Mo, Di, Mi, Do                                       │
└─────────────────────────────────────────────────────────┘
```

