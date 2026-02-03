
# Fix Slow User Loading in Settings

## Problem

The "Benutzer & Rollen" page takes too long to load because:
1. Three data fetches run sequentially (edge function → user_roles → instructors)
2. Edge function has cold start overhead
3. All users are fetched without pagination

## Solution

Parallelize all data fetching to reduce total wait time from ~3x to ~1x.

## Changes

### File: `src/hooks/useSettingsUsers.ts`

Change sequential queries to parallel using `Promise.all()`:

**Before (Sequential):**
```typescript
const authData = await supabase.functions.invoke("list-auth-users");  // Wait
const userRoles = await supabase.from("user_roles").select(...);      // Wait
const instructors = await supabase.from("instructors").select(...);   // Wait
```

**After (Parallel):**
```typescript
const [authResult, rolesResult, instructorsResult] = await Promise.all([
  supabase.functions.invoke("list-auth-users"),
  supabase.from("user_roles").select("user_id, role, created_at"),
  supabase.from("instructors").select("id, email, first_name, last_name")
]);
```

## Expected Improvement

| Metric | Before | After |
|--------|--------|-------|
| Total wait time | ~3-5 seconds | ~1-2 seconds |
| Network calls | 3 sequential | 3 parallel |

The edge function call (slowest due to cold start) and database queries will now execute simultaneously, so total time = max(single query time) instead of sum(all query times).
