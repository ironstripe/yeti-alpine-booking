
# Password Reset Implementation Plan

## Current State

The "Passwort vergessen?" link on the login page shows a placeholder toast: "Funktion kommt bald". Users cannot reset their password.

## Solution

Implement a complete password reset flow using Supabase Auth:

1. User clicks "Passwort vergessen?" → Opens dialog to enter email
2. System sends reset email via Supabase
3. User clicks link in email → Redirects to reset password page
4. User enters new password → Updates password and redirects to login

---

## Technical Implementation

### Phase 1: Add Reset Password Method to AuthContext

**File: `src/contexts/AuthContext.tsx`**

Add a new `resetPassword` method:

```typescript
interface AuthContextType {
  // ... existing
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { error: error as Error | null };
};
```

### Phase 2: Create Reset Password Page

**New file: `src/pages/ResetPassword.tsx`**

Similar to SetPassword.tsx but for password reset:
- Extracts tokens from URL hash
- Establishes session via `setSession()`
- Shows password form
- Updates password via `updateUser()`
- Redirects to login on success

### Phase 3: Update Login Page

**File: `src/pages/Login.tsx`**

Replace the placeholder `handleForgotPassword` with:
- Show inline email input (collapsible)
- Call `resetPassword()` from AuthContext
- Show success message when email sent

### Phase 4: Add Route

**File: `src/App.tsx`**

Add route for `/reset-password`:

```typescript
<Route path="/reset-password" element={<ResetPassword />} />
```

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| **MODIFY** | `src/contexts/AuthContext.tsx` | Add `resetPassword` method |
| **CREATE** | `src/pages/ResetPassword.tsx` | Password reset form page |
| **MODIFY** | `src/pages/Login.tsx` | Replace placeholder with email form |
| **MODIFY** | `src/App.tsx` | Add `/reset-password` route |

---

## User Flow

```text
Login Page
    │
    ▼
[Passwort vergessen?] clicked
    │
    ▼
Email input appears
    │
    ▼
User enters email → [Zurücksetzen] clicked
    │
    ▼
Toast: "E-Mail gesendet"
    │
    ▼
User clicks link in email
    │
    ▼
/reset-password#access_token=...&type=recovery
    │
    ▼
Password form shown
    │
    ▼
User sets new password
    │
    ▼
Success → Redirect to /login
```

---

## UI Design

### Login Page - Forgot Password Section

```text
[Passwort vergessen?]
       ↓ (expanded)
+----------------------------------------+
| E-Mail für Passwort-Reset:             |
| [email@example.com        ]            |
| [Zurücksetzen]  [Abbrechen]            |
+----------------------------------------+
```

### Reset Password Page

```text
+----------------------------------------+
|           🔐 Neues Passwort            |
|                                        |
| Bitte gib ein neues Passwort ein.      |
|                                        |
| Neues Passwort:                        |
| [••••••••••••••••      ]               |
|                                        |
| Passwort bestätigen:                   |
| [••••••••••••••••      ]               |
|                                        |
| [    Passwort speichern    ]           |
+----------------------------------------+
```

---

## Error Handling

| Scenario | Message |
|----------|---------|
| Invalid email format | "Ungültige E-Mail-Adresse" |
| Email not found | "E-Mail wurde gesendet" (no leak) |
| Link expired | "Link ungültig oder abgelaufen" |
| Passwords don't match | "Passwörter stimmen nicht überein" |
| Password too short | "Passwort muss mindestens 6 Zeichen haben" |

---

## Security Notes

1. **No email enumeration**: Always show success message even if email doesn't exist
2. **Rate limiting**: Supabase handles rate limiting on reset emails
3. **Token expiry**: Recovery tokens expire after 1 hour (Supabase default)
4. **HTTPS only**: Redirect URL uses `window.location.origin` (inherits HTTPS from published site)
