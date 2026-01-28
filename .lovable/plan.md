
# Fix Group Course Price Calculation in Booking Summary

## Problem Summary

The "Abschluss" (summary) step shows incorrect prices for group course bookings:

1. **Not using correct product prices**: The system tries to match products by name (`"X Tag"`), which doesn't match actual product names
2. **Not using tiered pricing**: Group courses have tiered pricing (1 day = CHF 150, 4 days = CHF 285, etc.) stored in `product_price_tiers` table, but this is not fetched
3. **Not calculating per participant**: With 2 participants, the price should be calculated for each participant and summed

## Current Database Structure

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ products table                                                          │
├──────────────────────────────────────┬──────────────────────────────────┤
│ id: 00bb1fd0...                      │ type: "group"                    │
│ name: "Gruppenkurs"                  │ pricing_type: "tiered"           │
│ price: 0 (not used for tiered)       │                                  │
└──────────────────────────────────────┴──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ product_price_tiers table                                               │
├──────────────┬──────────────────┬───────────────────────────────────────┤
│ day_count    │ cumulative_price │ product_id                            │
├──────────────┼──────────────────┼───────────────────────────────────────┤
│ 1            │ 150.00           │ 00bb1fd0...                           │
│ 2            │ 200.00           │ 00bb1fd0...                           │
│ 3            │ 245.00           │ 00bb1fd0...                           │
│ 4            │ 285.00           │ 00bb1fd0...                           │
│ 5            │ 320.00           │ 00bb1fd0...                           │
└──────────────┴──────────────────┴───────────────────────────────────────┘
```

---

## Solution

### Changes to `PriceBreakdown.tsx`

1. **Use `useProducts` hook** which already fetches price tiers
2. **Handle participant-specific booking mode** - iterate over each participant's booking
3. **Calculate tiered pricing correctly** using the `calculatePrice` utility
4. **Display per-participant line items** showing each participant's course and price

### Pricing Logic

**Participant-Specific Mode (Individual Booking)**:
```text
For each participant:
  1. Get their selected dates (e.g., 4 days)
  2. Get their group course's linked product_id
  3. Look up price tiers for that product
  4. Calculate price for 4 days = CHF 285 (cumulative)
  
Total = Sum of all participant prices + Lunch total - Discounts
```

**Shared Mode (All participants same course)**:
```text
1. Get shared dates (e.g., 4 days)
2. Calculate single course price = CHF 285
3. Multiply by participant count = CHF 285 × 2 = CHF 570
4. Add lunch, apply discounts
```

---

## Implementation Steps

### Step 1: Refactor Product Fetching

Replace the simple products query with `useProducts` hook that includes price tiers:

```typescript
// OLD:
const { data: products = [], isLoading } = useQuery({
  queryKey: ["products"],
  queryFn: async () => { ... }
});

// NEW:
import { useProducts, ProductWithTiers } from "@/hooks/useProducts";
import { calculatePrice } from "@/lib/pricing-utils";

const { data: products = [], isLoading } = useProducts({ 
  isActive: true, 
  includeTiers: true 
});
```

### Step 2: Handle Participant-Specific Mode

When `state.useParticipantSpecificBooking` is true:

```typescript
if (state.useParticipantSpecificBooking) {
  // Calculate for each participant
  const lineItems = [];
  let totalCoursePrice = 0;
  
  for (const participant of state.selectedParticipants) {
    const booking = state.participantBookings[participant.id];
    if (!booking) continue;
    
    // Get the linked product from group course
    const groupCourse = groupCourses.find(c => c.id === booking.groupCourseId);
    const productId = groupCourse?.product_id;
    const product = products.find(p => p.id === productId);
    
    // Calculate price based on number of days
    const daysCount = booking.dates.length;
    const price = calculatePrice(product, daysCount);
    
    lineItems.push({
      participantName: `${participant.first_name} ${participant.last_name}`,
      courseName: groupCourse?.name,
      days: daysCount,
      price: price,
    });
    
    totalCoursePrice += price;
  }
}
```

### Step 3: Update Display

Show per-participant breakdown:

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
│   8 Tage × CHF 25.00                    CHF 200.00      │
├─────────────────────────────────────────────────────────┤
│ Zwischensumme                           CHF 770.00      │
│ MwSt. (7.7%)                            CHF  59.29      │
├─────────────────────────────────────────────────────────┤
│ TOTAL                                   CHF 770.00      │
└─────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/PriceBreakdown.tsx` | 1. Use `useProducts` hook with tiers<br>2. Fetch group courses for product linkage<br>3. Handle participant-specific mode<br>4. Use `calculatePrice()` for tiered pricing<br>5. Display per-participant line items |

---

## Additional Considerations

1. **Group Courses Query**: Need to fetch group courses to get `product_id` linkage for each participant's selected course
2. **Fallback for Shared Mode**: Keep original logic for non-participant-specific bookings but multiply by participant count
3. **Lunch Calculation**: Already handles participant-specific lunch selections via `state.lunchSelections`

---

## Expected Result

After fix:
- Robin (4 days, Red Prince) = CHF 285
- Lisa (4 days, Blue King) = CHF 285
- Total before lunch = CHF 570
- With lunch (if selected) = CHF 570 + lunch total
- Correct tiered pricing applied based on days per participant
