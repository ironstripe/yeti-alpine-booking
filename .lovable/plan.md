

# Fix Open Bookings Showing Green in Scheduler

## Problem

Private bookings with status "Offen" (open/unpaid) are incorrectly displayed in green instead of orange in the scheduler. The bug is in the `isPaid` calculation logic.

## Root Cause

In `src/hooks/useSchedulerData.ts` line 277:
```typescript
isPaid: (ticket?.paid_amount || 0) >= (ticket?.total_amount || 0),
```

When `total_amount` is 0, null, or not set, the comparison `0 >= 0` returns `true`, incorrectly marking the booking as paid.

## Solution

Update the `isPaid` logic to require:
1. A positive `total_amount` (there must be something to pay)
2. `paid_amount >= total_amount` (fully paid)

## Changes

**File:** `src/hooks/useSchedulerData.ts`

### Line 277 - Fix isPaid calculation:

Change:
```typescript
isPaid: (ticket?.paid_amount || 0) >= (ticket?.total_amount || 0),
```

To:
```typescript
isPaid: (ticket?.total_amount || 0) > 0 && (ticket?.paid_amount || 0) >= (ticket?.total_amount || 0),
```

This ensures:
- If `total_amount` is 0 or null → `isPaid = false` (open)
- If `total_amount > 0` and `paid_amount >= total_amount` → `isPaid = true` (paid)
- Otherwise → `isPaid = false` (open/partial)

## Color Reference

From `scheduler-utils.ts`:
- **Green** (`bg-emerald-500`): Paid private lessons
- **Orange** (`bg-orange-500`): Unpaid/open private lessons

