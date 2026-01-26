
# Fix Status Display Inconsistency Between Booking Overview and Detail

## Problem Summary
The bookings overview shows "Ausstehend" (Pending) while the detail page shows "Bestätigt" (Confirmed) for the same booking. This occurs because:

- **Overview**: Uses `BookingStatusBadge` with instructor confirmation logic
- **Detail Page**: Directly displays `ticket.status` without checking instructor confirmation

## Root Cause
The detail page (`BookingDetail.tsx` lines 236-239) displays status using simple logic:
```typescript
<Badge variant={ticket.status === 'confirmed' ? 'default' : 'secondary'}>
  {ticket.status === 'confirmed' ? 'Bestätigt' : ticket.status}
</Badge>
```

This ignores the `instructor_confirmation` field on ticket items, which the overview correctly considers.

## Solution

### File to Modify: `src/pages/BookingDetail.tsx`

**Change:** Replace the inline status Badge with the `BookingStatusBadge` component used in the overview.

**Current Code (lines 236-239):**
```typescript
<Badge variant={ticket.status === 'confirmed' ? 'default' : 'secondary'}>
  {ticket.status === 'confirmed' ? 'Bestätigt' : ticket.status}
</Badge>
```

**New Code:**
```typescript
<BookingStatusBadge
  status={ticket.status}
  paymentStatus={computedPaymentStatus}
  hasUnconfirmedInstructor={hasUnconfirmedInstructor}
/>
```

### Additional Changes:

1. **Add Import:** Import `BookingStatusBadge` from `@/components/bookings/BookingStatusBadge`

2. **Compute Required Values:** Add computation logic before the return statement:
```typescript
// Compute payment status
const totalAmount = ticket.total_amount || 0;
const paidAmount = ticket.paid_amount || 0;
let computedPaymentStatus: "paid" | "open" | "overdue" | "partial" = "open";
if (paidAmount >= totalAmount && totalAmount > 0) {
  computedPaymentStatus = "paid";
} else if (paidAmount > 0 && paidAmount < totalAmount) {
  computedPaymentStatus = "partial";
}

// Check for unconfirmed instructors
const hasUnconfirmedInstructor = ticket.items?.some(
  (item: any) => item.instructor_id && item.instructor_confirmation !== "confirmed"
) || false;
```

---

## Technical Details

### Status Priority Logic (preserved from `BookingStatusBadge`):
1. **Cancelled** → 🔴 Storniert
2. **Draft** → ⚪ Entwurf  
3. **Unconfirmed Instructor** → 🟠 Ausstehend
4. **Paid** → 🟢 Bezahlt
5. **Partial** → 🟡 Teilbezahlt
6. **Open** → 🟡 Offen

### Data Flow:
```text
ticket_items.instructor_confirmation = "pending"
         ↓
hasUnconfirmedInstructor = true
         ↓
BookingStatusBadge shows "🟠 Ausstehend"
```

---

## Expected Outcome
After implementation:
- Both overview and detail pages show **"🟠 Ausstehend"** for bookings with pending instructor confirmations
- Status display is consistent across the entire application
- Users can trust that the same status is shown everywhere

## Files Changed
| File | Change |
|------|--------|
| `src/pages/BookingDetail.tsx` | Add import, compute values, use `BookingStatusBadge` component |
