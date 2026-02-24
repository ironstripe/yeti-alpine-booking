

# Fix Password Reset Flow

## Problem

When a user clicks the password reset link from their email, they land in the main app (dashboard) instead of seeing the "set new password" form. The root cause is a race condition between Supabase's automatic token processing and the app's routing.

## Root Cause

The Supabase client (PKCE flow) automatically detects and processes recovery tokens from the URL. It fires a `PASSWORD_RECOVERY` auth event, but the `AuthContext` ignores this event entirely -- it only handles `SIGNED_IN`, `SIGNED_OUT`, etc. As a result:

1. Supabase processes the recovery link and authenticates the user
2. The `SIGNED_IN` event fires, setting the user in AuthContext
3. The app sees an authenticated user and renders the dashboard
4. The `/reset-password` page's manual hash-parsing logic finds nothing (tokens already consumed)

## Solution

### 1. Handle `PASSWORD_RECOVERY` event in AuthContext

Add a `PASSWORD_RECOVERY` case to the `onAuthStateChange` handler. When detected, set the session/user AND navigate to `/reset-password`. This ensures the user always lands on the password form, regardless of which URL they initially hit.

**File**: `src/contexts/AuthContext.tsx`
- Add `PASSWORD_RECOVERY` to the switch statement
- Set session and user (same as `SIGNED_IN`)
- Use `window.location.replace('/reset-password')` to redirect if not already on that page (using `window.location` instead of React Router because this fires outside component context)

### 2. Simplify ResetPassword page

Remove the manual hash-parsing `useEffect` entirely. It's unnecessary because the Supabase client already handles token exchange automatically. The component just needs to check if the user is authenticated (which AuthContext guarantees after the recovery event).

**File**: `src/pages/ResetPassword.tsx`
- Remove the `establishSession` useEffect and related state (`isVerifying`, `verificationComplete`)
- Keep the simple flow: if `authLoading` show spinner, if no `user` show "invalid link", if `user` show password form

## Files Summary

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Handle `PASSWORD_RECOVERY` event, redirect to `/reset-password` |
| `src/pages/ResetPassword.tsx` | Remove manual token parsing, simplify to auth-state-only logic |

## Result

After the fix:
1. User clicks reset link in email
2. Supabase client processes tokens, fires `PASSWORD_RECOVERY`
3. AuthContext sets the user and redirects to `/reset-password`
4. ResetPassword page detects authenticated user, shows "set new password" form
5. User sets password, gets signed out, redirected to login

