

# Fix: Scheduler Loading Error

## Root Cause

The recent scheduler redesign added a query to fetch participant counts for group courses using:
```typescript
.from("groups")
.select(`
  *,
  ticket_items!ticket_items_group_id_fkey(id, status)  // <-- This FK doesn't exist
`)
```

**The database schema shows:**
- `ticket_items` table has NO `group_id` column
- There is no foreign key relationship between `groups` and `ticket_items`
- The error is: `"Could not find a relationship between 'groups' and 'ticket_items' in the schema cache"`

---

## Solution

Remove the non-existent relationship query from `useSchedulerData.ts`. Since there's no `group_id` in `ticket_items`, participant counts cannot be fetched this way.

---

## Implementation

### File: `src/hooks/useSchedulerData.ts`

**Change the groups query (lines 121-133) from:**
```typescript
const groupsQuery = useQuery({
  queryKey: ["scheduler-groups", startDateStr, endDateStr],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("groups")
      .select(`
        *,
        ticket_items!ticket_items_group_id_fkey(id, status)
      `)
      .lte("start_date", endDateStr)
      .gte("end_date", startDateStr)
      .not("instructor_id", "is", null);

    if (error) throw error;
    return data;
  },
});
```

**To:**
```typescript
const groupsQuery = useQuery({
  queryKey: ["scheduler-groups", startDateStr, endDateStr],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .lte("start_date", endDateStr)
      .gte("end_date", startDateStr)
      .not("instructor_id", "is", null);

    if (error) throw error;
    return data;
  },
});
```

**Also update the group booking transformation (lines 206-209) from:**
```typescript
// Calculate current participant count from ticket_items
const ticketItems = (g as any).ticket_items || [];
const currentParticipants = ticketItems.filter(
  (ti: { status: string }) => ti.status !== 'cancelled'
).length;
```

**To:**
```typescript
// Note: Participant counts not available without group_id FK
// This could be implemented via a separate count query if needed
const currentParticipants = 0;
```

---

## Technical Notes

- The capacity display feature (`currentParticipants / maxParticipants`) will show `(0/X)` for now
- A proper solution would require either:
  1. Adding a `group_id` column + FK to `ticket_items`, OR
  2. Using a different relationship (e.g., matching by group name + date range)
- This fix restores scheduler functionality immediately

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useSchedulerData.ts` | Remove broken FK query, update participant count logic |

