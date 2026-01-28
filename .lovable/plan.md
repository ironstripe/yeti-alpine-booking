

# Instructor Booking Confirmation UI

## Overview

Implement the frontend components for instructors to confirm or decline their assigned bookings. This adds a new "Bestätigungen" tab to the instructor portal's bottom navigation with a badge showing pending count, a new confirmations page, and a decline modal.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useConfirmBooking.ts` | Create | Mutation hook for calling `set-booking-confirmation` edge function |
| `src/hooks/usePendingBookingsCount.ts` | Create | Query hook for fetching pending booking count (for badge) |
| `src/components/instructor-portal/DeclineBookingModal.tsx` | Create | Modal for declining with reason |
| `src/components/instructor-portal/PendingBookingCard.tsx` | Create | Card component displaying booking details with confirm/decline buttons |
| `src/pages/InstructorConfirmations.tsx` | Create | New page listing pending bookings |
| `src/components/instructor-portal/InstructorLayout.tsx` | Modify | Add 5th nav tab "Bestätigungen" with badge |
| `src/App.tsx` | Modify | Add route for `/instructor/confirmations` |

---

## Technical Implementation

### 1. useConfirmBooking Hook

```text
src/hooks/useConfirmBooking.ts
```

- Uses `useMutation` from TanStack Query
- Calls `supabase.functions.invoke('set-booking-confirmation', { body })`
- Invalidates queries: `instructor-pending-bookings`, `instructor-pending-count`
- Shows toast on success/error (German labels)
- Returns `mutate`, `isPending`, `isSuccess`

### 2. usePendingBookingsCount Hook

```text
src/hooks/usePendingBookingsCount.ts
```

- Uses existing `useUserRole()` to get `instructorId`
- Queries `ticket_items` with filters:
  - `instructor_id = instructorId`
  - `instructor_confirmation = 'pending'`
  - `date >= today` (only future/today bookings)
- Uses `{ count: 'exact', head: true }` for efficient count
- `refetchInterval: 30000` for live updates
- Returns `{ count, isLoading }`

### 3. DeclineBookingModal Component

```text
src/components/instructor-portal/DeclineBookingModal.tsx
```

Props:
```typescript
interface DeclineBookingModalProps {
  ticketItemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Features:
- Uses `Dialog` from shadcn/ui
- Required `Textarea` for decline reason
- Warning message: "Das Büro wird benachrichtigt..."
- Touch-friendly button sizes (min 44px height)
- Disabled state while pending
- Clears reason on close

### 4. PendingBookingCard Component

```text
src/components/instructor-portal/PendingBookingCard.tsx
```

Props:
```typescript
interface PendingBookingCardProps {
  booking: {
    id: string;
    date: string;
    time_start: string | null;
    time_end: string | null;
    products: { name: string; type: string } | null;
    tickets: { customers: { first_name: string | null; last_name: string } | null } | null;
    customer_participants: Array<{
      first_name: string;
      last_name: string | null;
      skill_levels: { name: string } | null;
    }>;
    internal_notes: string | null;
    meeting_point: string | null;
  };
  onConfirm: () => void;
  onDecline: () => void;
  isConfirming: boolean;
}
```

Features:
- Collapsible card (like `LessonCard`)
- Shows: date, time, product, customer, participants with levels
- Meeting point and internal notes (if present)
- Two full-width buttons: "Bestätigen" (green/primary) and "Ablehnen" (outline)
- Touch-friendly 44px minimum button height
- Uses date-fns for German date formatting

### 5. InstructorConfirmations Page

```text
src/pages/InstructorConfirmations.tsx
```

Structure:
```text
InstructorLayout
├── Header ("Bestätigungen" + count badge)
├── Loading skeleton
├── Error state
├── Empty state (checkmark icon + "Alles erledigt!")
└── List of PendingBookingCard components
```

Query:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['instructor-pending-bookings', instructorId],
  queryFn: async () => {
    // Get instructor ID via useUserRole
    // Query ticket_items with:
    //   - instructor_id = instructorId
    //   - instructor_confirmation = 'pending'
    //   - date >= today
    // Select:
    //   - id, date, time_start, time_end, meeting_point, internal_notes
    //   - products (name, type)
    //   - tickets -> customers (first_name, last_name)
    //   - customer_participants (first_name, last_name) -> skill_levels (name)
    // Order by date ASC, time_start ASC
  }
});
```

### 6. InstructorLayout Navigation Update

Add 5th navigation item with badge:

```typescript
// Updated navItems array
const navItems = [
  { title: "Heute", url: "/instructor", icon: Home },
  { title: "Plan", url: "/instructor/schedule", icon: Calendar },
  { title: "Bestätigen", url: "/instructor/confirmations", icon: ClipboardCheck },  // NEW
  { title: "Abwesend", url: "/instructor/availability", icon: Hand },
  { title: "Profil", url: "/instructor/profile", icon: User },
];
```

Changes:
- Import `ClipboardCheck` from lucide-react
- Import `Badge` from components/ui/badge
- Import `usePendingBookingsCount` hook
- Add hook call: `const { data: pendingCount } = usePendingBookingsCount()`
- Add "Bestätigungen" to navItems with badge overlay
- Update side drawer navigation to include new item
- Add page title case: `"/instructor/confirmations": "Bestätigungen"`

Badge implementation in bottom nav:
```typescript
{item.url === "/instructor/confirmations" && pendingCount > 0 && (
  <Badge 
    variant="destructive" 
    className="absolute -top-1 -right-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
  >
    {pendingCount > 9 ? "9+" : pendingCount}
  </Badge>
)}
```

### 7. App.tsx Route Addition

```typescript
// Inside instructor routes section (line ~138)
<Route path="/instructor/confirmations" element={<InstructorConfirmations />} />
```

Also add import at top:
```typescript
import InstructorConfirmations from "./pages/InstructorConfirmations";
```

---

## UI/UX Specifications

### Mobile-First Design
- All buttons minimum 44x44px touch target
- Cards have adequate tap spacing
- Bottom navigation accessible with thumb
- Content has `pb-20` to avoid nav overlap

### States
- **Loading**: Skeleton cards matching final layout
- **Empty**: Centered checkmark icon + "Alles erledigt!" message
- **Error**: Alert with error message + retry hint
- **Confirming**: Disabled buttons with spinner

### German Translations
| English | German |
|---------|--------|
| Confirmations | Bestätigungen |
| Confirm | Bestätigen |
| Decline | Ablehnen |
| Cancel | Abbrechen |
| pending bookings | offene Buchungen |
| All done! | Alles erledigt! |
| Customer | Kunde |
| Participants | Teilnehmer |
| Note from office | Notiz vom Büro |

---

## Data Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│ InstructorLayout                                                │
│   └── usePendingBookingsCount() → Badge count                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ InstructorConfirmations page                                    │
│   └── useQuery(['instructor-pending-bookings'])                 │
│       └── Maps to PendingBookingCard components                 │
└─────────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐              ┌───────────────────┐
    │ Click Confirm │              │ Click Decline     │
    │               │              │                   │
    │ useConfirmBooking()          │ Opens DeclineModal│
    │   action: 'confirm'          │                   │
    │                              │   User enters     │
    │                              │   reason          │
    │                              │                   │
    │                              │ useConfirmBooking()
    │                              │   action: 'decline'
    └───────────────┘              │   reason: '...'   │
            │                      └───────────────────┘
            └───────────────┬───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Edge Function: set-booking-confirmation                         │
│   • Updates ticket_items                                        │
│   • Logs to instructor_activity_log                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Query Invalidation                                              │
│   • ['instructor-pending-bookings'] → List refreshes            │
│   • ['instructor-pending-count'] → Badge updates                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Existing Patterns Followed

1. **Layout**: Uses `InstructorLayout` wrapper like all other instructor pages
2. **Hooks**: Follows `useInstructorPortalData.ts` pattern with `useUserRole().instructorId`
3. **Cards**: Similar structure to `LessonCard.tsx` with collapsible content
4. **Navigation**: Extends existing `navItems` array pattern
5. **Styling**: Uses existing Tailwind classes and shadcn/ui components
6. **German UI**: Consistent with existing German labels throughout

