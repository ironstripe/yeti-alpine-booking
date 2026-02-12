

# Fix: Cancellation Status Display in BookingStatusBadge

## Issue 1: Status Badge Not Showing "Storniert"

The cancellation flow sets the ticket status to `"storno"` (full cancellation) or `"partial_cancelled"` (partial), but `BookingStatusBadge` only checks for `status === "cancelled"` -- a value that is never actually used. As a result, cancelled bookings fall through to the payment status display and show "Offen" instead of "Storniert".

### Fix

Update `BookingStatusBadge.tsx` to check for the actual status values:

| Current | Should Match |
|---------|-------------|
| `status === "cancelled"` | `status === "storno"` or `status === "cancelled"` or `status === "partial_cancelled"` |

For partial cancellations, show a distinct label like "Teilstorniert" so staff can distinguish them.

## Issue 2: Timeline Already Works

The database confirms that both `BOOKING_CANCELLED` and `STATUS_CHANGED` events were logged by the triggers. The timeline data is present and should render correctly in the "Verlauf & Kommentare" tab. If it wasn't visible, it may have been a matter of switching to the correct tab.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/bookings/BookingStatusBadge.tsx` | Update the cancelled check from `status === "cancelled"` to also match `"storno"` and `"partial_cancelled"` |

## Technical Detail

```text
// Before (line 16)
if (status === "cancelled") {

// After
if (status === "cancelled" || status === "storno") {
  // Show: "Storniert"
}

// Add new block for partial cancellation
if (status === "partial_cancelled") {
  // Show: "Teilstorniert" with orange/red styling
}
```

This is a one-line fix in a single file. No backend changes needed -- the triggers and timeline are working correctly.
