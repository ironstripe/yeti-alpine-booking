
# Fix: Dashboard Open Bookings Not Showing Unpaid Tickets

## Summary

The `OpenBookingsBox` component uses incorrect status filters that don't match actual database values. The fix aligns the dashboard query with the existing booking status priority system and includes payment-based filtering.

---

## Root Cause

| Dashboard Filter | Actual DB Status Values |
|-----------------|------------------------|
| `draft` | 0 tickets |
| `incomplete` | 0 tickets |
| `pending_instructor` | 0 tickets |
| `pending_payment` | 0 tickets |
| **Not included:** `pending_confirmation` | **47 tickets** |
| **Not included:** `confirmed` | **526 tickets** |

The dashboard shows 0 open bookings while 10+ unpaid tickets exist with `status = 'pending_confirmation'`.

---

## Solution

Update `OpenBookingsBox` to show bookings that need attention based on **payment status**, not just workflow status. This aligns with the existing `BookingStatusBadge` priority hierarchy.

### Updated Query Logic

```typescript
// OLD: Filter by workflow status (doesn't work)
.in("status", ["draft", "incomplete", "pending_instructor", "pending_payment"])

// NEW: Show bookings that are unpaid and not cancelled
const { data, error } = await supabase
  .from("tickets")
  .select(`
    id,
    ticket_number,
    status,
    total_amount,
    paid_amount,
    customers (first_name, last_name)
  `)
  .neq("status", "cancelled")
  .gt("total_amount", 0)
  .or("paid_amount.lt.total_amount,paid_amount.is.null,paid_amount.eq.0")
  .order("created_at", { ascending: false })
  .limit(10);

// Then filter client-side for unpaid bookings
const unpaidTickets = data.filter(ticket => 
  (ticket.paid_amount || 0) < (ticket.total_amount || 0)
);
```

### Updated Issue Display

```typescript
function getBookingIssue(ticket: OpenBooking): string {
  const paidAmount = ticket.paid_amount || 0;
  const totalAmount = ticket.total_amount || 0;
  
  if (paidAmount === 0) {
    return `Offen: CHF ${totalAmount.toFixed(0)}`;
  }
  if (paidAmount < totalAmount) {
    return `Teilbezahlt: CHF ${paidAmount.toFixed(0)} / ${totalAmount.toFixed(0)}`;
  }
  return "Prüfung erforderlich";
}
```

---

## Changes

### File: `src/components/dashboard/OpenBookingsBox.tsx`

1. **Update interface** to include payment fields:
```typescript
interface OpenBooking {
  id: string;
  ticket_number: string;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  customer_name: string;
  issue: string;
}
```

2. **Update query** to fetch unpaid bookings:
   - Remove status-based filter
   - Add payment fields to select
   - Filter for non-cancelled tickets with total_amount > 0
   - Client-side filter for unpaid (paid_amount < total_amount)

3. **Update issue text** to show payment amounts

---

## Expected Result

| Before | After |
|--------|-------|
| Shows 0 bookings | Shows 10+ unpaid bookings |
| Filters by non-existent status values | Filters by actual payment status |
| Issue text: "Entwurf - nicht abgeschlossen" | Issue text: "Offen: CHF 160" |

---

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/dashboard/OpenBookingsBox.tsx` |
