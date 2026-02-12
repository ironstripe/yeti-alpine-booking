

# Keep Cancelled Bookings with Outstanding Amounts in Payment Tracking

## Problem

The dashboard widgets "Offene Buchungen" and "Zahlungen ausstehend" currently exclude cancelled bookings using `.neq("status", "cancelled")`. Since the actual DB value for cancellations is `"storno"`, these bookings slip through by accident today -- but this is fragile and incorrect. The business rule should be explicit: **any booking with an outstanding balance should appear in payment tracking, regardless of its status.**

## Solution

Remove the status exclusion filter from both dashboard payment queries. The client-side filter `paid_amount < total_amount` already ensures only unpaid bookings are shown. Cancelled bookings with cancellation fees still owed will correctly appear.

### Changes

| File | Change |
|------|--------|
| `src/components/dashboard/OpenBookingsBox.tsx` (line 48) | Remove `.neq("status", "cancelled")` |
| `src/components/dashboard/PendingPaymentsCard.tsx` (line 43) | Remove `.neq("status", "cancelled")` |

### Additional: Show cancellation context in the issue text

Update the `getBookingIssue` function in `OpenBookingsBox.tsx` to accept the status and show "Stornogebühr: CHF X" instead of "Offen: CHF X" when the booking is cancelled/storno.

| File | Change |
|------|--------|
| `src/components/dashboard/OpenBookingsBox.tsx` | Update `getBookingIssue` to accept status and label cancelled bookings as "Stornogebühr" |
| `src/components/dashboard/PendingPaymentsCard.tsx` | No label change needed -- it already shows the remaining amount generically |

## What stays the same

- `BookingStatusBadge` -- already fixed in last change
- Bookings list page (`useTickets`) -- already shows all statuses
- Availability/conflict checks -- these correctly exclude cancelled bookings since cancelled lessons shouldn't block scheduling

