

# Fix: Invitation Link Shows "Expired" Prematurely

## Problem Identified

When clicking the invitation link, users see "Link ungültig oder abgelaufen" even though the link is valid.

**Root Cause:** Race condition in the authentication flow:

1. User clicks link → Supabase `/verify` validates token → redirects to `/set-password` with auth tokens in URL hash
2. `SetPassword` component renders immediately and checks `!user`
3. Auth tokens haven't been parsed yet → `user` is `null` → shows "expired" message
4. A moment later, `onAuthStateChange` fires with the session, but UI already shows error

The auth logs confirm the link **was valid** - verification succeeded at 18:18:15 with `user_signedup` event.

---

## Solution

Add a dedicated "recovery pending" state that waits for the URL hash tokens to be processed before concluding the link is invalid.

### Key Changes to `SetPassword.tsx`:

1. **Add `isVerifying` state** - tracks whether we're still waiting for the recovery flow
2. **Check for recovery tokens in URL** - if `#access_token` or `#type=recovery` is present, wait for auth
3. **Add timeout** - if no session after reasonable time (e.g., 5 seconds), then show expired
4. **Listen specifically for `PASSWORD_RECOVERY` event** - this is the event Supabase fires for recovery links

---

## Technical Implementation

```typescript
// Add new state
const [isVerifying, setIsVerifying] = useState(true);

useEffect(() => {
  // Check if URL has recovery tokens (indicates we came from email link)
  const hash = window.location.hash;
  const hasRecoveryTokens = hash.includes('access_token') || hash.includes('type=recovery');
  
  if (!hasRecoveryTokens && !user) {
    // No tokens in URL and no user - link was likely already used or expired
    setIsVerifying(false);
    return;
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    
    if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
      // Successfully authenticated via recovery link
      setIsVerifying(false);
      setError(null);
    }
    
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      // Session established
      setIsVerifying(false);
    }
  });

  // Timeout fallback - if no auth event after 5 seconds, assume link is invalid
  const timeout = setTimeout(() => {
    if (!user) {
      setIsVerifying(false);
    }
  }, 5000);

  return () => {
    subscription.unsubscribe();
    clearTimeout(timeout);
  };
}, [user]);

// Show loading while verifying (instead of immediately showing "expired")
if (authLoading || isVerifying) {
  return (
    <div className="...">
      <Loader2 className="animate-spin" />
      <p>Link wird überprüft...</p>
    </div>
  );
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SetPassword.tsx` | Add `isVerifying` state, check URL hash, wait for auth events |

---

## Expected Flow After Fix

1. User clicks invitation link
2. Redirected to `/set-password` with `#access_token=...` in URL
3. Page shows "Link wird überprüft..." spinner
4. Supabase client parses tokens, fires `PASSWORD_RECOVERY` event
5. `isVerifying` becomes `false`, `user` is now set
6. Page shows password form
7. User sets password → redirected to instructor portal

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Valid link, first click | Shows spinner → shows password form |
| Link clicked twice | Shows spinner → timeout → shows "expired" (correct) |
| Direct navigation to `/set-password` (no tokens) | Immediately shows "expired" |
| Already logged in user visits page | Shows password form (they can reset password) |

---

## Testing Checklist

1. Send new invitation to `ivo.streiff71@gmail.com`
2. Click link in email the first time
3. Should see "Link wird überprüft..." briefly
4. Should then see password form
5. Set password → should redirect to `/instructor`
6. Click same link again → should show "expired" (correct behavior)

