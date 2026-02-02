
# Show All User Emails & Add Password Management

## Problem
Currently, the Settings/Users page only shows the email for the logged-in user. All other users display truncated IDs because the frontend cannot access `auth.users` directly.

## Solution

### 1. New Edge Function: `list-auth-users`

**File:** `supabase/functions/list-auth-users/index.ts`

Returns all auth users using the admin API:
```typescript
// Returns: { users: [{ id, email, created_at, last_sign_in_at }] }
```

### 2. New Edge Function: `reset-user-password`

**File:** `supabase/functions/reset-user-password/index.ts`

Sends password reset email to a user:
```typescript
// Input: { email: string }
// Uses supabaseAdmin.auth.resetPasswordForEmail()
```

### 3. Update `useSettingsUsers` Hook

**File:** `src/hooks/useSettingsUsers.ts`

- Call `list-auth-users` edge function to get all users with emails
- Merge with `user_roles` data
- Add `last_sign_in` field for reference

### 4. Update Settings Users Page

**File:** `src/pages/SettingsUsers.tsx`

- Add "Aktionen" column with dropdown menu
- Actions per user:
  - **Passwort zurücksetzen** - sends reset email
  - (Future: Role management)

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/list-auth-users/index.ts` | **NEW** - List all auth users with emails |
| `supabase/functions/reset-user-password/index.ts` | **NEW** - Send password reset email |
| `supabase/config.toml` | Register new functions |
| `src/hooks/useSettingsUsers.ts` | Fetch all users via edge function |
| `src/pages/SettingsUsers.tsx` | Add actions column with password reset |

---

## Technical Details

### Edge Function: list-auth-users
```typescript
const { data } = await supabaseAdmin.auth.admin.listUsers();
return data.users.map(u => ({
  id: u.id,
  email: u.email,
  created_at: u.created_at,
  last_sign_in_at: u.last_sign_in_at
}));
```

### Edge Function: reset-user-password
```typescript
await supabaseAdmin.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/reset-password`
});
```

### Updated Hook Flow
```
┌──────────────────────────────────────┐
│  useSettingsUsers()                  │
├──────────────────────────────────────┤
│  1. Call list-auth-users edge fn     │
│  2. Fetch user_roles from DB         │
│  3. Fetch instructors for linking    │
│  4. Merge all data by user_id        │
│  5. Return complete user list        │
└──────────────────────────────────────┘
```

### UI Changes

| Current | After |
|---------|-------|
| `916bc71b...` | `admin@example.com` |
| No actions | Dropdown: Passwort zurücksetzen |

---

## User Flow for Password Reset

1. Admin opens Settings > Users
2. Clicks "..." menu on any user row
3. Selects "Passwort zurücksetzen"
4. Confirmation dialog appears
5. On confirm: Edge function sends reset email
6. Toast: "E-Mail zum Zurücksetzen gesendet"
