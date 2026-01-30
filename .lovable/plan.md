
# Fix: Align Sidebar Badge with Inbox Stats

## Summary

The sidebar badge shows ALL conversations (19), while the inbox stats only count "unread" and "read" statuses. This creates a confusing mismatch where the badge suggests 19 new items but the stats show only 15 actionable conversations.

---

## Current State

| Source | What it shows | Current value |
|--------|--------------|---------------|
| Sidebar badge | ALL conversations | 19 |
| "Neue Anfragen" | status=unread + inbound | 0 |
| "In Bearb." | status=read + inbound | 15 |
| **Hidden** | status=spam | 3 |
| **Hidden** | status=converted | 1 |

---

## Solution

Change the sidebar badge to show **unread** conversation count instead of total count. This aligns with standard inbox behavior where the badge indicates items needing attention.

### Why "unread" count?
- Standard inbox behavior (Gmail, Outlook all show unread count)
- Badge should indicate "items needing attention"
- Matches user expectation when seeing a notification badge

---

## Changes

### File: `src/components/layout/AppSidebar.tsx`

Update `getBadgeCount` function to return `unread` count instead of `all`:

```typescript
// OLD: Shows all conversations (misleading)
const getBadgeCount = (url: string): number | null => {
  if (url === "/inbox") {
    return conversationCounts?.all || null;
  }
  return null;
};

// NEW: Shows unread count (standard inbox behavior)
const getBadgeCount = (url: string): number | null => {
  if (url === "/inbox") {
    return conversationCounts?.unread || null;
  }
  return null;
};
```

---

## Expected Result

| Before | After |
|--------|-------|
| Sidebar shows 19 | Sidebar shows 0 (unread count) |
| Mismatch with inbox stats | Badge matches "Neue Anfragen" stat |
| Badge always visible | Badge only shows when new messages arrive |

---

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/layout/AppSidebar.tsx` |
