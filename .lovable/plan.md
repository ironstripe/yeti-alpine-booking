
# Fix: Race Condition in Test Login Flow

## Problem
When `supabase.auth.setSession()` is called in `TestInstructorLogin`, the navigation to `/instructor` happens before the `AuthContext` receives the `onAuthStateChange` event. This causes `InstructorLayout` to see `user = null` and redirect to `/login`.

## Solution
Wait for the auth state to fully propagate before navigating by listening for the `onAuthStateChange` event after calling `setSession()`.

## Technical Changes

### File: `src/pages/TestInstructorLogin.tsx`

Replace the current navigation logic with a more robust approach:

```typescript
// Current (problematic):
const { error: sessionError } = await supabase.auth.setSession({...});
// ... success state ...
setTimeout(() => {
  navigate("/instructor", { replace: true });
}, 1500);

// Fixed:
const { error: sessionError } = await supabase.auth.setSession({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
});

if (sessionError) { /* error handling */ }

// Wait for auth state to fully propagate
await new Promise<void>((resolve) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (session) {
        subscription.unsubscribe();
        resolve();
      }
    }
  );
  // Fallback timeout in case event doesn't fire
  setTimeout(() => {
    subscription.unsubscribe();
    resolve();
  }, 2000);
});

// Store role AFTER session is confirmed
localStorage.setItem("yety_active_role", "teacher");

// Now safe to navigate
setInstructorName(data.instructor?.name || "Instruktor");
setStatus("success");

// Brief delay to show success message, then redirect
setTimeout(() => {
  navigate("/instructor", { replace: true });
}, 1000);
```

## Key Changes
1. **Wait for `onAuthStateChange`**: Listen for the auth event that confirms the session is active
2. **Fallback timeout**: Prevent infinite waiting if something goes wrong
3. **Role storage timing**: Move `localStorage.setItem` after session confirmation
4. **Reduced visual delay**: Since we wait for auth, we can show success briefly then navigate

## Why This Works
- `setSession()` triggers `onAuthStateChange` internally
- We wait until that event fires with a valid session
- Only then do we navigate to `/instructor`
- `InstructorLayout` will now see the authenticated user

## Alternative Considered
Could modify `InstructorLayout` to not redirect during initial mounting, but that's riskier as it could create security holes. The login page fix is cleaner.
