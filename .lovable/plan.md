

# Fix: Context-Aware Back Navigation from Booking Detail

## Problem

When a user navigates from a **Customer Detail page** to a **Booking Detail page** and clicks "Zurück" (Back), they are taken to the Booking List (`/bookings`) instead of returning to the Customer Detail page where they started.

## Solution

Implement the same pattern already used for scheduler navigation: pass a `from` parameter in the URL to track the navigation origin and use it to determine the correct back destination.

## Technical Changes

### 1. Update BookingHistoryCard.tsx

**File**: `src/components/customers/detail/BookingHistoryCard.tsx`

Pass the customer ID as a query parameter when navigating to a booking:

```typescript
// Line 66: Change from
navigate(`/bookings/${ticket.id}`)

// To
navigate(`/bookings/${ticket.id}?from=customer&customerId=${customerId}`)
```

This requires adding `customerId` as a prop to the component.

---

### 2. Update BookingDetail.tsx

**File**: `src/pages/BookingDetail.tsx`

Extract the `from=customer` and `customerId` parameters and adjust the back button behavior:

```typescript
// Around line 54: Add customer context
const fromCustomer = searchParams.get("from") === "customer";
const customerId = searchParams.get("customerId");

// Around line 252: Update the back button
<Button 
  variant="outline" 
  onClick={() => {
    if (fromCustomer && customerId) {
      navigate(`/customers/${customerId}`);
    } else {
      navigate("/bookings");
    }
  }}
>
  <ArrowLeft className="h-4 w-4 mr-2" />
  Zurück
</Button>
```

---

### 3. Update BookingHistoryCard Props

**File**: `src/components/customers/detail/BookingHistoryCard.tsx`

Add `customerId` to the component's props interface:

```typescript
interface BookingHistoryCardProps {
  tickets: Ticket[];
  isLoading?: boolean;
  customerId: string;  // Add this
}
```

---

### 4. Update CustomerDetail.tsx

**File**: `src/pages/CustomerDetail.tsx`

Pass the `customerId` prop to `BookingHistoryCard`:

```typescript
// Line 118
<BookingHistoryCard 
  tickets={tickets} 
  isLoading={isLoadingTickets} 
  customerId={customer.id}  // Add this
/>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/customers/detail/BookingHistoryCard.tsx` | Add `customerId` prop, pass it in navigation URL |
| `src/pages/BookingDetail.tsx` | Read `from=customer` param, navigate back to customer if present |
| `src/pages/CustomerDetail.tsx` | Pass `customerId` prop to `BookingHistoryCard` |

---

## Expected Behavior After Fix

| Journey Start | Navigate To | Click "Zurück" | Result |
|---------------|-------------|----------------|--------|
| Customer Detail | Booking Detail | Yes | Returns to Customer Detail |
| Booking List | Booking Detail | Yes | Returns to Booking List |
| Scheduler | Booking Detail | Yes | Returns to Scheduler (existing) |

