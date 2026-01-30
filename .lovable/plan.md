
# Fix: Bypass Login Redirect for Test Links

## Root Cause Analysis
The `InstructorLayout` immediately redirects to `/login` when it detects no user, but the auth state from `setSession()` hasn't fully propagated through React's state updates yet. Even though we wait for `onAuthStateChange`, the navigation to `/instructor` and the mount of `InstructorLayout` can happen before the component tree re-renders with the new user state.

## Solution: Add Initial Mount Delay

Modify `InstructorLayout` to wait for at least one render cycle before checking auth, giving the auth context time to fully update. This is a common pattern for protecting routes that might be accessed via programmatic session injection.

## Technical Changes

### File: `src/components/instructor-portal/InstructorLayout.tsx`

Add a brief mount delay before the "redirect to login" logic fires:

```typescript
// Add new state
const [hasInitialized, setHasInitialized] = useState(false);

// Add initialization effect
useEffect(() => {
  // Wait for auth context to stabilize before checking auth
  const timeout = setTimeout(() => {
    setHasInitialized(true);
  }, 100);
  return () => clearTimeout(timeout);
}, []);

// Modify the redirect effect to wait for initialization
useEffect(() => {
  if (!hasInitialized) return; // Don't redirect until we've had time to initialize
  if (!authLoading && !user) {
    navigate("/login");
  }
}, [hasInitialized, authLoading, user, navigate]);
```

## Why This Works
1. When TestInstructorLogin calls `setSession()` and navigates to `/instructor`
2. InstructorLayout mounts but waits 100ms before checking auth
3. During this 100ms, AuthContext receives the `onAuthStateChange` event and updates `user`
4. When InstructorLayout checks auth, user is already populated
5. No redirect to login

## Alternative Approaches Considered

1. **Pass tokens via URL/state**: Complex and less secure
2. **Session storage flag**: Hacky and could create security issues
3. **Modify AuthContext**: Would affect all routes, higher risk

The mount delay approach is the safest and most targeted fix.

## Files to Modify
- `src/components/instructor-portal/InstructorLayout.tsx`

## Testing
After the fix, these links should work directly:
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-alpha-2026`
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-beta-2026`
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-gamma-2026`
