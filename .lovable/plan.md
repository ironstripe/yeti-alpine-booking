
# Fix: Inbox Sidebar Badge Count Mismatch

## Problem

The sidebar shows "20 new messages" while the inbox overview shows "0 new requests, 16 in progress". This happens because:

| Hook | Filter | Result |
|------|--------|--------|
| `useConversationCounts` (sidebar) | `status = 'unread'` only | Counts outbound too + stale cache |
| `useInboxStats` (overview) | `status = 'unread'` + `direction = 'inbound'` | Correct count |

The database currently has **0 unread conversations** - the sidebar is showing stale cached data.

## Root Causes

1. **Missing direction filter**: Sidebar counts ALL unread messages including outbound, while inbox overview correctly counts only inbound
2. **No auto-refresh**: `useConversationCounts` lacks `refetchInterval`, so it relies on invalidation which can be missed
3. **Realtime gap**: The realtime subscription only activates when the Inbox page is mounted

## Solution

Update `useConversationCounts` to match the filtering logic of `useInboxStats`:

```text
Before (useConversationCounts):
  SELECT count(*) WHERE status = 'unread'

After (useConversationCounts):
  SELECT count(*) WHERE status = 'unread' AND direction = 'inbound'
```

Also add `refetchInterval` to keep the sidebar badge fresh.

## Changes

### File: `src/hooks/useConversations.ts`

**Modify `useConversationCounts` function:**

1. Add `direction = 'inbound'` filter to the unread count query
2. Add `refetchInterval: 60000` to match `useInboxStats` behavior
3. (Optional) Add `refetchOnWindowFocus: true` explicitly for clarity

```typescript
export function useConversationCounts() {
  return useQuery({
    queryKey: ["conversation-counts"],
    queryFn: async () => {
      const [allResult, unreadResult, whatsappResult, emailResult] = await Promise.all([
        // All inbound conversations
        supabase.from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("direction", "inbound"),
        
        // Unread inbound conversations (matches useInboxStats)
        supabase.from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("status", "unread")
          .eq("direction", "inbound"),  // <-- ADD THIS
        
        // WhatsApp inbound
        supabase.from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("channel", "whatsapp")
          .eq("direction", "inbound"),
        
        // Email inbound
        supabase.from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("channel", "email")
          .eq("direction", "inbound"),
      ]);

      return {
        all: allResult.count || 0,
        unread: unreadResult.count || 0,
        whatsapp: whatsappResult.count || 0,
        email: emailResult.count || 0,
      };
    },
    refetchInterval: 60000,  // <-- ADD: Refresh every 60 seconds
    refetchOnWindowFocus: true,  // <-- ADD: Refresh on tab focus
  });
}
```

## Why This Fixes It

| Before | After |
|--------|-------|
| Sidebar counts all unread (including outbound) | Sidebar counts only inbound unread |
| Cache can go stale indefinitely | Auto-refreshes every 60 seconds |
| Mismatch with inbox overview stats | Matches inbox overview exactly |

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/hooks/useConversations.ts` |

## Verification

After implementing:
1. Sidebar badge should show 0 (matching the 0 unread inbound in database)
2. Inbox overview "Neue" should also show 0
3. Both values should stay in sync even without page navigation
