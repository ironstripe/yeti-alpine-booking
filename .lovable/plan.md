

# Fix: Allow Resending Invitations to Users Who Haven't Set Password Yet

## Problem Identified

The edge function returns **"Ivo hat bereits einen aktiven Account"** when trying to resend an invitation.

**Root Cause:** The current logic checks `last_sign_in_at` to determine if a user has an "active account". However:
- Clicking the invitation link triggers a recovery session, which populates `last_sign_in_at`
- The user may not have actually completed setting their password
- This blocks all future invitation resends even if the user never finished onboarding

```text
Current Flow:
1. User receives invitation email
2. User clicks link → session created → last_sign_in_at = now()
3. User sees password form but doesn't complete it (or link expired)
4. Office tries to resend invitation → "bereits einen aktiven Account" ❌
```

---

## Solution

Instead of checking `last_sign_in_at`, check if the user has an **encrypted password set**. This accurately determines if they completed the onboarding:

- `encrypted_password` is empty/null → user never set a password → allow resend
- `encrypted_password` is set → user has a working account → block resend (or show different message)

**Note:** The `encrypted_password` field is not directly accessible via the Admin API's `listUsers()`. However, we can check:
1. **`email_confirmed_at`** - set when user confirms email
2. **`confirmed_at`** - general confirmation timestamp
3. Or simply **remove the blocking check entirely** and always allow resending

### Recommended Approach: Always Allow Resend

Since recovery links expire anyway and generate new tokens each time, there's no security risk in allowing resends. The office should always be able to send a fresh invitation.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/invite-instructor/index.ts` | Remove the "active account" blocking logic, always allow resend |

---

## Technical Changes

**Before (lines 139-146):**
```typescript
if (existingUser) {
  // User already exists - check if they have signed in
  if (existingUser.last_sign_in_at) {
    return new Response(
      JSON.stringify({ error: `${instructor.first_name} hat bereits einen aktiven Account` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // ...
}
```

**After:**
```typescript
if (existingUser) {
  // User already exists - allow resending invitation
  // The recovery link will generate fresh tokens
  authUserId = existingUser.id;
  console.log("Existing user found, will resend invitation:", authUserId);
} else {
  // Create new user
  // ...
}
```

Optionally, we can add an **info log** noting whether the user previously signed in, but don't block the resend.

---

## Alternative: Add "Account aktiviert" Status in UI

If the office needs to know whether an instructor has actually activated their account, we could add a UI indicator on the instructor detail page showing:
- "Eingeladen, noch nicht aktiviert"
- "Konto aktiv"

This would be based on whether the user has ever set a password (which we can track via a new column or by checking if they can log in).

---

## Expected Behavior After Fix

| Scenario | Current | After Fix |
|----------|---------|-----------|
| First invitation | ✅ Works | ✅ Works |
| User clicked link but didn't set password | ❌ "Active account" error | ✅ Resends invitation |
| User set password and logged in | ❌ "Active account" error | ✅ Resends new recovery link |

---

## Testing Checklist

1. Delete existing auth user for test email OR use current blocked instructor
2. Click "Einladen" on instructor detail page
3. Verify invitation email is received
4. Click invitation link → see password form
5. Don't set password, close page
6. Click "Einladen" again → should succeed and send new email
7. Complete password setup with new email link
8. Verify login works with new password

