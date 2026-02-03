
# Fix: Login Page Flickering Issue

## Problem Analysis

The PWA service worker is caching ALL Supabase API endpoints including authentication endpoints (`/auth/v1/*`). This causes:

1. Stale session data being returned from cache
2. `onAuthStateChange` firing with cached session → `loading` state changes
3. `LoginRoute` switches between loading spinner and Login component
4. Login component **remounts**, resetting email/password state
5. User can't type in password field because form keeps resetting

## Root Cause

In `vite.config.ts`:
```javascript
urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,  // Matches /auth/* endpoints
```

Auth endpoints should **NEVER** be cached as they deal with session state.

## Solution

Exclude auth endpoints from service worker caching by updating the URL pattern regex.

### Code Changes

**File:** `vite.config.ts` (line 78)

Change:
```javascript
urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
```

To:
```javascript
urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
```

This ensures only the REST API (`/rest/v1/*`) is cached, not authentication (`/auth/v1/*`), storage, or realtime endpoints.

## Summary

| File | Change |
|------|--------|
| `vite.config.ts` | Update service worker URL pattern to exclude `/auth/` endpoints |

## Technical Notes

- Only `/rest/v1/*` endpoints (database queries) should be cached
- Auth endpoints (`/auth/v1/*`) must always go to network for accurate session state
- This prevents stale authentication data from causing component remounts
- After deployment, users may need to clear their browser cache or the service worker will update automatically
