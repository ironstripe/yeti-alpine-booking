
# Add First-Time Login Hint Text

## Overview

Add a helpful hint on the login page for invited users (instructors) who haven't set their password yet.

## Change

### File: `src/pages/Login.tsx`

Add a hint text box below the password field (before the submit button) that only shows on the login view (not sign-up):

```tsx
{/* First-time user hint - only show on login */}
{!isSignUp && (
  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900">
    <p className="text-xs text-blue-700 dark:text-blue-300">
      <strong>Neu eingeladen?</strong> Falls du noch kein Passwort gesetzt hast, 
      nutze "Passwort vergessen?" um ein neues Passwort zu erstellen.
    </p>
  </div>
)}
```

**Location:** After the password field div (line 211), before the submit button (line 213).

## Result

- New users see clear guidance immediately
- No confusion about what to do if they lost/missed the invitation email
- Subtle blue styling to stand out without being alarming
