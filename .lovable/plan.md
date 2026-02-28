

# Fix: Slow AI Reply Generation

## Problem
The `generate-reply` edge function performs 6+ sequential network calls before even reaching the AI model, plus a very large system prompt. Each step waits for the previous one to complete.

## Root Causes
1. **Sequential DB queries**: Conversation, channel config, knowledge docs, customer data, booking history -- all run one after another
2. **Knowledge docs downloaded in a loop**: 2 files downloaded one at a time from storage
3. **Nested edge function call**: `check-instructor-availability` is invoked via HTTP (cold start + execution)
4. **Large prompt**: ~800 lines of system prompt + full knowledge base content sent on every request

## Solution

### 1. Parallelize Independent Queries
**File:** `supabase/functions/generate-reply/index.ts`

After fetching the conversation (which is needed for everything else), run all independent queries in parallel using `Promise.all`:

```text
// BEFORE (sequential):
fetch conversation -> fetch config -> fetch docs -> fetch customer -> fetch tickets -> check availability -> call AI

// AFTER (parallel where possible):
fetch conversation -> Promise.all([config, docs, customer]) -> Promise.all([tickets, availability]) -> call AI
```

Specifically:
- `getChannelConfig()`, knowledge document fetch, and customer lookup can all run in parallel
- Booking history and availability check can run in parallel (both depend on customer data)

### 2. Download Knowledge Docs in Parallel
Replace the sequential for-loop with `Promise.all` for downloading the 2 knowledge documents simultaneously.

### 3. Call check-instructor-availability Directly (Inline)
Instead of invoking a separate edge function via HTTP (which adds cold-start latency), import and call the availability logic directly as a function within `generate-reply`. This eliminates one full HTTP round-trip.

However, since edge functions are separate deployments, the simpler approach is to **query the DB directly** in `generate-reply` instead of calling the edge function. We'll extract the core query logic (find instructor + check conflicts) and run it inline.

### 4. Trim the System Prompt
- Cache knowledge base content (it rarely changes) -- not feasible in stateless edge functions, but we can at least skip downloading if no docs exist
- Remove redundant examples from the prompt (the channel-specific examples are ~30 lines that could be shortened)

## Implementation Details

### File: `supabase/functions/generate-reply/index.ts`

**Change 1: Parallel queries after conversation fetch**
```typescript
// Run independent queries in parallel
const [channelConfig, knowledgeBaseContent, customerResult] = await Promise.all([
  getChannelConfig(supabase, channel),
  fetchKnowledgeBase(supabase),       // New extracted function
  conv.matched_customer_id 
    ? supabase.from("customers").select("*").eq("id", conv.matched_customer_id).single()
    : Promise.resolve({ data: null, error: null }),
]);
```

**Change 2: Parallel knowledge doc downloads**
```typescript
async function fetchKnowledgeBase(supabase: any): Promise<string> {
  const { data: documents } = await supabase
    .from("ai_knowledge_documents")
    .select("storage_path, file_name");
  
  if (!documents || documents.length === 0) return "";
  
  // Download ALL docs in parallel
  const results = await Promise.all(
    documents.map(async (doc) => {
      try {
        const { data } = await supabase.storage
          .from("ai_knowledge_base")
          .download(doc.storage_path);
        if (data) {
          const text = await data.text();
          return `\n--- ${doc.file_name} ---\n${text}\n--- ENDE ---`;
        }
      } catch {}
      return "";
    })
  );
  
  return results.filter(Boolean).join("");
}
```

**Change 3: Inline availability check (query DB directly)**
Instead of `supabase.functions.invoke("check-instructor-availability", ...)`, run the instructor lookup and conflict queries directly within this function. This saves one full HTTP round-trip + cold start.

**Change 4: Parallel booking history + availability**
```typescript
const [bookingHistory, availabilityContext] = await Promise.all([
  fetchBookingHistory(supabase, customerId),
  instructorRequest?.is_requested 
    ? checkAvailabilityInline(supabase, instructorRequest, extractedData)
    : Promise.resolve(null),
]);
```

## Expected Impact
- **Before**: ~6-8 sequential network calls (each 100-500ms) = 2-5 seconds before AI call
- **After**: ~3 parallel groups = 0.5-1.5 seconds before AI call
- The AI model call itself (~2-4 seconds) cannot be parallelized but the prompt stays the same size

## Files Modified
1. `supabase/functions/generate-reply/index.ts` -- parallelize queries, inline availability check

## Deployment
Redeploy `generate-reply` edge function after changes.

