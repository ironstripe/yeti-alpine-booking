
# Fix Test Data Generator Timeout Issue

## Problem

The edge function times out (default 60s limit) when generating group course data because it makes too many sequential database operations:
- 8 weeks × 11 courses × ~10 participants = ~880 enrollments
- Each enrollment requires ~6 sequential DB calls
- Total: 5,000+ individual database operations

## Solution

Optimize the edge function with batch operations and reduce sequential queries.

## Implementation

### File: `supabase/functions/generate-test-bookings/index.ts`

**Key Optimizations:**

1. **Pre-generate ticket numbers** in batch instead of per-enrollment
2. **Batch insert customers, participants, tickets, and enrollments** per course
3. **Reuse existing customers more aggressively** (increase reuse rate from 30% to 70%)
4. **Process courses in parallel** within each week using `Promise.all`
5. **Reduce the default weeks** from 8 to 4 for faster generation

### Changes:

**1. Add batch insert helper:**
```typescript
async function batchInsert(supabase: any, table: string, records: any[]): Promise<any[]> {
  if (records.length === 0) return [];
  
  // Insert in chunks of 50 to avoid payload limits
  const results: any[] = [];
  for (let i = 0; i < records.length; i += 50) {
    const chunk = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from(table)
      .insert(chunk)
      .select();
    
    if (error) throw error;
    results.push(...(data || []));
  }
  return results;
}
```

**2. Pre-fetch more customers for reuse:**
```typescript
// Fetch up to 200 existing customers for reuse
const { data: existingCustomers } = await supabase
  .from("customers")
  .select("id, last_name")
  .limit(200);

// 70% reuse existing, 30% create new (inverted from before)
```

**3. Pre-generate ticket numbers:**
```typescript
async function generateTicketNumbers(supabase: any, count: number): Promise<string[]> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from("tickets")
    .select("ticket_number")
    .like("ticket_number", `YETY-${year}-%`)
    .order("ticket_number", { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (data && data.length > 0) {
    const match = data[0].ticket_number.match(/YETY-\d{4}-(\d+)/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  return Array.from({ length: count }, (_, i) => 
    `YETY-${year}-${(nextNumber + i).toString().padStart(5, "0")}`
  );
}
```

**4. Batch enrollment creation per course:**
```typescript
// Collect all data for a course, then batch insert
const customersToCreate: any[] = [];
const participantsToCreate: any[] = [];
const ticketsToCreate: any[] = [];
const ticketItemsToCreate: any[] = [];
const enrollmentsToCreate: any[] = [];

// Pre-generate ticket numbers for all enrollments in this course
const ticketNumbers = await generateTicketNumbers(supabase, targetParticipants);

for (let i = 0; i < targetParticipants; i++) {
  // Build records without inserting yet
  // ... 
}

// Batch inserts
const customers = await batchInsert(supabase, 'customers', customersToCreate);
const participants = await batchInsert(supabase, 'customer_participants', participantsToCreate);
const tickets = await batchInsert(supabase, 'tickets', ticketsToCreate);
const ticketItems = await batchInsert(supabase, 'ticket_items', ticketItemsToCreate);
await batchInsert(supabase, 'group_course_enrollments', enrollmentsToCreate);
```

**5. Update UI default:**
```typescript
// In TestDataGenerator.tsx
const [weeksToGenerate, setWeeksToGenerate] = useState(4); // Changed from 8
```

## Changes Summary

| File | Change |
|------|--------|
| `generate-test-bookings/index.ts` | Add batch operations, pre-generate ticket numbers, optimize customer reuse |
| `TestDataGenerator.tsx` | Reduce default weeks from 8 to 4 |

## Technical Notes

- Batch inserts reduce DB calls from ~6 per enrollment to ~5 total batches per course
- Pre-fetching 200 customers allows better reuse without per-enrollment queries
- Processing drops from 5,000+ calls to ~500 calls (10x improvement)
- Edge function should complete within 30-40 seconds instead of timing out
