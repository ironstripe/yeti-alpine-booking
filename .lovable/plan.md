
# Plan: Add "Buchung stornieren" Button to Booking Detail Page

## Overview
Wire the existing `CancellationDialog` component to the BookingDetail page sidebar, allowing staff to cancel bookings directly from the detail view.

## Changes Required

### File: `src/pages/BookingDetail.tsx`

**1. Add Import**
```tsx
import { CancellationDialog } from "@/components/bookings/CancellationDialog";
import { XCircle } from "lucide-react"; // For the button icon
```

**2. Add State for Dialog**
```tsx
const [showCancellation, setShowCancellation] = useState(false);
```

**3. Add Button to Sidebar Actions** (after "Erinnerung senden" button, around line 456)
```tsx
<Button 
  variant="outline" 
  className="w-full justify-start text-destructive hover:text-destructive"
  onClick={() => setShowCancellation(true)}
>
  <XCircle className="h-4 w-4 mr-2" />
  Buchung stornieren
</Button>
```

**4. Add CancellationDialog Component** (before closing fragment, around line 588)

Transform ticket data to match the expected interface:
```tsx
{ticket && (
  <CancellationDialog
    booking={{
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      customer_id: ticket.customer_id,
      customer_name: `${ticket.customer?.first_name || ''} ${ticket.customer?.last_name || ''}`.trim(),
      product_name: ticket.items?.[0]?.product?.name || 'Buchung',
      start_date: ticket.items?.[0]?.date || '',
      end_date: ticket.items?.[ticket.items.length - 1]?.date || '',
      start_time: ticket.items?.[0]?.time_start || undefined,
      total_amount: ticket.total_amount || 0,
      amount_paid: ticket.paid_amount || 0,
      booking_days: ticket.items?.map((item: any) => item.date).filter(Boolean) || [],
    }}
    open={showCancellation}
    onOpenChange={setShowCancellation}
    onSuccess={() => {
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", id] });
      toast.success("Buchung erfolgreich storniert");
    }}
  />
)}
```

**5. Get queryClient** (already imported, just need to use it)
```tsx
const queryClient = useQueryClient();
```

## Data Mapping

| CancellationDialog Field | Source from Ticket |
|--------------------------|-------------------|
| `id` | `ticket.id` |
| `ticket_number` | `ticket.ticket_number` |
| `customer_id` | `ticket.customer_id` |
| `customer_name` | Concatenated from `ticket.customer` |
| `product_name` | First item's product name |
| `start_date` | First ticket_item date |
| `end_date` | Last ticket_item date |
| `start_time` | First ticket_item time_start |
| `total_amount` | `ticket.total_amount` |
| `amount_paid` | `ticket.paid_amount` |
| `booking_days` | All unique dates from ticket_items |

## Result
- Red-styled "Buchung stornieren" button appears in sidebar
- Clicking opens CancellationDialog with all booking data pre-filled
- On successful cancellation, page refreshes with updated status

## Technical Details
- No new dependencies required
- Uses existing `useQueryClient` already imported
- Button styled with `text-destructive` for visual warning
- Dialog handles all AGB fee calculation, Kulanz documentation, and credit creation
