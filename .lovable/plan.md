
# Add Existing Client Linking to Event Guest Registration

## Problem

Currently, the "Gast anmelden" dialog only allows manual entry of guest data. When adding a private course participant, the office staff cannot search and link existing customers/participants from the database - they must re-enter all information manually.

## Solution

Modify the AddGuestDialog to allow searching and linking existing `customer_participants` when the source is "private_course". This provides:
- Autocomplete search for existing participants
- Auto-fill of name, birth year, and contact info from linked record
- Proper `participant_id` linking in the `event_participants` table

---

## Technical Implementation

### Phase 1: Create Participant Search Hook

**New file: `src/hooks/useParticipantSearch.ts`**

```typescript
// Search customer_participants by name with debounce
// Returns: id, first_name, last_name, birth_date, customer info
// Query across customer_participants joined with customers for contact data
```

### Phase 2: Modify AddGuestDialog

**File: `src/components/events/AddGuestDialog.tsx`**

| Change | Details |
|--------|---------|
| Add state | `selectedParticipant` for linked participant |
| Add state | `searchMode` toggle between search/manual |
| Conditional UI | Show search input when source is "private_course" |
| Auto-fill | Pre-fill form fields when participant selected |
| Submit logic | Include `participant_id` in mutation payload |

### UI Flow

```text
Source: [x] Privatkurs-Gast  [ ] Walk-in

When "Privatkurs-Gast" selected:
+-----------------------------------------------+
| 🔍 Teilnehmer suchen...              [Manual] |
+-----------------------------------------------+
| > Max Mustermann (Jahrgang 2015)              |
| > Anna Beispiel (Jahrgang 2012)               |
+-----------------------------------------------+

After selection:
+-----------------------------------------------+
| ✓ Max Mustermann                    [Ändern]  |
|   Jahrgang 2015 · kontakt@email.com           |
+-----------------------------------------------+

When "Walk-in" selected:
- Current manual entry form (unchanged)
```

### Phase 3: Update Schema Usage

The `useCreateEventParticipant` hook already supports `participant_id` - just need to pass it:

```typescript
createParticipant.mutate({
  event_id: event.id,
  category_id: data.category_id,
  source: "private_course",
  participant_id: selectedParticipant.id,  // Link to existing
  // guest_* fields can be null when linked
  payment_status: data.payment_status,
  fee_amount: event.guest_fee,
});
```

---

## Files to Modify

| Action | File | Purpose |
|--------|------|---------|
| **CREATE** | `src/hooks/useParticipantSearch.ts` | Search hook with debounce |
| **MODIFY** | `src/components/events/AddGuestDialog.tsx` | Add search UI and linking |

## Implementation Details

### useParticipantSearch Hook

```typescript
interface SearchableParticipant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
  };
}

export function useParticipantSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);
  
  return useQuery({
    queryKey: ["participant-search", debouncedQuery],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_participants")
        .select(`
          id, first_name, last_name, birth_date,
          customer:customers!customer_participants_customer_id_fkey (
            id, first_name, last_name, email, phone
          )
        `)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(10);
      return data;
    },
    enabled: debouncedQuery.length >= 2,
  });
}
```

### Modified AddGuestDialog Flow

1. User selects "Privatkurs-Gast"
2. Search input appears (similar to CustomerSearch component)
3. User types name → debounced search
4. Results show participant name + birth year + parent contact
5. User selects participant → form auto-fills:
   - `guest_first_name` from `participant.first_name`
   - `guest_last_name` from `participant.last_name`  
   - `guest_birth_year` calculated from `participant.birth_date`
   - `guest_phone` from `participant.customer.phone`
   - `guest_email` from `participant.customer.email`
6. User can still edit pre-filled values if needed
7. On submit, both `participant_id` AND `guest_*` fields are saved

### Zod Schema Update

```typescript
const guestSchema = z.object({
  source: z.enum(["private_course", "walkin"]),
  participant_id: z.string().nullable().optional(),  // NEW
  guest_first_name: z.string().min(1, "Vorname erforderlich"),
  // ... rest unchanged
});
```

---

## User Experience

| Scenario | Behavior |
|----------|----------|
| Private course guest exists | Search → Select → Auto-fill → Confirm category/payment |
| Private course guest new | Click "Manuell eingeben" → Manual form |
| Walk-in | Direct manual entry (current behavior) |

## Benefits

1. **Data consistency**: Links to actual participant record
2. **Time saving**: No re-typing of existing data
3. **Traceability**: Can see which event participants are linked to booking data
4. **Reporting**: Can query participants across events via `participant_id`
