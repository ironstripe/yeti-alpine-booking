

# Fix: Global Search Shows All Matching Results + Add Participants

## Problem Summary

1. **Search results hidden**: The `cmdk` library applies client-side filtering that hides valid server-side results. When typing "Ivo", results may be filtered out if cmdk's internal matching doesn't find them.

2. **No participant search**: The global search only covers Customers, Instructors, and Bookings. Participants (children) are not searchable.

---

## Current Search Scope

| Entity | Fields Searched | Status |
|--------|-----------------|--------|
| Customers | first_name, last_name, email, phone | ✅ Works (but hidden) |
| Instructors | first_name, last_name, email | ✅ Works (but hidden) |
| Bookings | ticket_number only | ✅ Works |
| **Participants** | - | ❌ Missing |

---

## Solution

### Part 1: Disable cmdk Client-Side Filtering

Update the `CommandDialog` to accept `commandProps` so we can pass `shouldFilter={false}`:

**File: `src/components/ui/command.tsx`**
- Add `commandProps` to `CommandDialogProps` interface
- Spread `commandProps` onto the inner `Command` component

**File: `src/components/CommandBar.tsx`**
- Pass `commandProps={{ shouldFilter: false }}` to disable double-filtering

### Part 2: Add Participant Search

**File: `src/lib/search.ts`**
- Add new `searchParticipants()` function that searches the `customer_participants` table by first_name, last_name

**File: `src/components/CommandBar.tsx`**
- Add `ParticipantResults` component that displays matching participants
- Navigate to the parent customer's detail page when selected

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/command.tsx` | Add `commandProps` passthrough to CommandDialog |
| `src/components/CommandBar.tsx` | Disable filtering + add ParticipantResults component |
| `src/lib/search.ts` | Add `searchParticipants()` function |

---

## Technical Details

### 1. command.tsx - Add commandProps

```tsx
interface CommandDialogProps extends DialogProps {
  commandProps?: React.ComponentPropsWithoutRef<typeof CommandPrimitive>;
}

const CommandDialog = ({ children, commandProps, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command className="..." {...commandProps}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};
```

### 2. CommandBar.tsx - Disable filter + add participants

```tsx
<CommandDialog 
  open={open} 
  onOpenChange={onOpenChange} 
  commandProps={{ shouldFilter: false }}
>
```

Add participant search section:
```tsx
{debouncedQuery.length >= 2 && (
  <>
    <CustomerResults query={debouncedQuery} onSelect={handleSelect} />
    <ParticipantResults query={debouncedQuery} onSelect={handleSelect} />
    <BookingResults query={debouncedQuery} onSelect={handleSelect} />
    <InstructorResults query={debouncedQuery} onSelect={handleSelect} />
  </>
)}
```

### 3. search.ts - Add participant search

```typescript
export interface ParticipantSearchResult {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  customer_id: string;
  customer_name: string;
}

export async function searchParticipants(query: string): Promise<ParticipantSearchResult[]> {
  const { data, error } = await supabase
    .from("customer_participants")
    .select(`
      id, 
      first_name, 
      last_name, 
      birth_date,
      customer_id,
      customers (first_name, last_name)
    `)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .limit(5);

  if (error) throw error;

  return (data || []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    birth_date: p.birth_date,
    customer_id: p.customer_id,
    customer_name: p.customers
      ? `${p.customers.first_name || ""} ${p.customers.last_name}`.trim()
      : "Unbekannt",
  }));
}
```

### 4. ParticipantResults Component

```tsx
function ParticipantResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (path: string) => void;
}) {
  const { data: participants, isLoading } = useQuery({
    queryKey: ["command-participant-search", query],
    queryFn: () => searchParticipants(query),
    enabled: query.length >= 2,
  });

  if (isLoading || !participants?.length) return null;

  return (
    <CommandGroup heading="Teilnehmer">
      {participants.map((participant) => (
        <CommandItem
          key={participant.id}
          onSelect={() => onSelect(`/customers/${participant.customer_id}`)}
          className="flex items-center gap-3"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">
              {participant.first_name} {participant.last_name}
            </span>
            <span className="text-xs text-muted-foreground">
              Teilnehmer bei {participant.customer_name}
            </span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
```

---

## Expected Behavior After Fix

| Search Query | Results Shown |
|--------------|---------------|
| "Ivo" | All customers, instructors, participants with "Ivo" in name |
| "Ivo St" | Filtered to those matching "Ivo St" (e.g., "Ivo Streiff") |
| "Robin" | Participants named Robin + any customers/instructors |
| "T-2025-001" | Booking with that ticket number |

---

## Testing Checklist

1. Press Cmd+K to open Command Bar
2. Type "Ivo" - should show Ivo Streiff immediately
3. Type "Ivo St" - results narrow down to Streiff matches
4. Type "Robin" - should show Robin as a participant
5. Click a participant result - navigates to parent customer page
6. Verify quick actions still show when search is empty
7. Verify instructors and bookings still searchable

