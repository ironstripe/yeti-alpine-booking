

# Fix: Set Password Page Not Establishing Session from Recovery Link

## Problem Identified

When clicking the invitation link:
1. User clicks link → Supabase `/verify` validates token successfully (303 redirect)
2. Browser redirects to `/set-password#access_token=xxx&refresh_token=xxx&type=recovery`
3. **The Supabase JS client does NOT automatically establish a session from the hash**
4. `SetPassword` component waits for auth events, but none arrive
5. After 5 seconds timeout → shows "expired" message

**Why this happens**: The Supabase client's automatic hash detection doesn't always work reliably, especially:
- When the page loads before the client is fully initialized
- In recovery flows where timing is critical
- When there's existing session state that interferes

---

## Solution

Manually extract the tokens from the URL hash and explicitly call `supabase.auth.setSession()` to establish the session. This is a proven pattern from Supabase community solutions.

### Key Changes to `SetPassword.tsx`:

1. **Parse URL hash manually** - Extract `access_token` and `refresh_token` from hash
2. **Call `setSession()` explicitly** - Establish the session before the timeout
3. **Handle errors gracefully** - If `setSession` fails, show the expired message

---

## Technical Implementation

```typescript
// src/pages/SetPassword.tsx

useEffect(() => {
  const establishSession = async () => {
    // If already verified or user exists, skip
    if (verificationComplete.current || user) {
      setIsVerifying(false);
      return;
    }

    // Parse tokens from URL hash
    const hash = window.location.hash.substring(1); // Remove #
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    console.log("SetPassword: Checking URL hash", { 
      hasAccessToken: !!accessToken, 
      hasRefreshToken: !!refreshToken, 
      type 
    });

    if (!accessToken || !refreshToken) {
      // No tokens in URL - check if we already have a session
      if (!user) {
        console.log("SetPassword: No tokens and no user, marking as expired");
        setIsVerifying(false);
        verificationComplete.current = true;
      }
      return;
    }

    // Explicitly establish session from tokens
    try {
      console.log("SetPassword: Establishing session from URL tokens");
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("SetPassword: Failed to establish session", error);
        setIsVerifying(false);
        verificationComplete.current = true;
        return;
      }

      if (data.session) {
        console.log("SetPassword: Session established successfully");
        // Clear the hash from URL for cleanliness (optional)
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (err) {
      console.error("SetPassword: Error establishing session", err);
    }

    setIsVerifying(false);
    verificationComplete.current = true;
  };

  establishSession();
}, [user]);
```

---

## Why This Works

1. **Explicit token handling** - We don't rely on Supabase's automatic hash detection
2. **`setSession()` is reliable** - This API is designed exactly for this use case
3. **Immediate feedback** - No need for timeout; we know immediately if tokens are valid
4. **Clean URL** - After establishing session, we remove the tokens from the URL

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SetPassword.tsx` | Replace the current useEffect with explicit token parsing and `setSession()` call |

---

## Expected Flow After Fix

1. User clicks invitation link
2. Supabase verifies token, redirects to `/set-password#access_token=xxx&refresh_token=xxx`
3. Page loads, extracts tokens from hash
4. Calls `supabase.auth.setSession({ access_token, refresh_token })`
5. Session established → `user` becomes available via `onAuthStateChange`
6. Page shows password form immediately (no 5 second wait)
7. User sets password → redirected to instructor portal

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Valid recovery link | Extracts tokens → `setSession` succeeds → shows form |
| Expired/used link | Tokens invalid → `setSession` fails → shows "expired" |
| No tokens in URL | Immediately shows "expired" |
| Already logged in user | Skips token handling → shows form |

---

## Testing Checklist

1. Send new invitation via "Einladen" button
2. Click link in email within seconds of receiving
3. Should immediately see password form (no spinner wait)
4. Set password → redirected to `/instructor`
5. Click same link again → should show "expired" (correct)
6. Verify login works with new password

