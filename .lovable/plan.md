

# Show All Staff in Users with Invitation Status

## Overview

Update the Users settings page to show all instructors/staff from the database, with clear indication of whether they've been invited (have an auth account) or not.

## Current Behavior

- Only shows users who have an auth account (signed up)
- Instructors without an auth account don't appear in the list

## New Behavior

- Shows all instructors from the database
- Additionally shows any auth users who aren't linked to instructors
- Each entry shows invitation status: "Eingeladen" (has auth account) or "Nicht eingeladen" (no auth account)

## Changes

### 1. Update Type Definition

**File: `src/hooks/useSettingsUsers.ts`**

Add invitation status to the interface:

```typescript
export interface UserWithRole {
  user_id: string | null;      // null for uninvited instructors
  email: string;
  roles: AppRole[];
  instructor_id: string | null;
  instructor_name: string | null;
  created_at: string;
  last_sign_in: string | null;
  invitation_status: 'invited' | 'not_invited';  // NEW
}
```

### 2. Update Data Fetching Logic

**File: `src/hooks/useSettingsUsers.ts`**

Merge both data sources:

```typescript
// Create lookup of auth users by email (lowercase)
const authUserByEmail = new Map<string, AuthUser>();
for (const authUser of authUsers) {
  if (authUser.email) {
    authUserByEmail.set(authUser.email.toLowerCase(), authUser);
  }
}

// Build final list: start with all instructors
const resultList: UserWithRole[] = [];

for (const instructor of instructors || []) {
  const authUser = authUserByEmail.get(instructor.email.toLowerCase());
  
  resultList.push({
    user_id: authUser?.id || null,
    email: instructor.email,
    roles: authUser ? rolesMap.get(authUser.id) || [] : [],
    instructor_id: instructor.id,
    instructor_name: `${instructor.first_name} ${instructor.last_name}`,
    created_at: instructor.created_at,
    last_sign_in: authUser?.last_sign_in_at || null,
    invitation_status: authUser ? 'invited' : 'not_invited',
  });
  
  // Mark this auth user as processed
  if (authUser) {
    authUserByEmail.delete(instructor.email.toLowerCase());
  }
}

// Add remaining auth users (not linked to instructors)
for (const [email, authUser] of authUserByEmail) {
  resultList.push({
    user_id: authUser.id,
    email: authUser.email,
    roles: rolesMap.get(authUser.id) || [],
    instructor_id: null,
    instructor_name: null,
    created_at: authUser.created_at,
    last_sign_in: authUser.last_sign_in_at,
    invitation_status: 'invited',
  });
}
```

### 3. Update UI to Show Status

**File: `src/pages/SettingsUsers.tsx`**

Add status badge and invite action:

```tsx
// In table header
<TableHead>Status</TableHead>

// In table row
<TableCell>
  {user.invitation_status === 'invited' ? (
    <Badge variant="secondary" className="text-green-600">
      <Check className="h-3 w-3 mr-1" />
      Eingeladen
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      <Clock className="h-3 w-3 mr-1" />
      Nicht eingeladen
    </Badge>
  )}
</TableCell>

// In dropdown menu - add invite option for uninvited users
{user.invitation_status === 'not_invited' && user.instructor_id && (
  <DropdownMenuItem onClick={() => handleInvite(user)}>
    <Mail className="h-4 w-4 mr-2" />
    Einladen
  </DropdownMenuItem>
)}
```

### 4. Add Invite Handler

**File: `src/pages/SettingsUsers.tsx`**

Add invitation mutation and handler:

```typescript
const inviteInstructor = useInviteInstructor();

const handleInvite = async (user: UserWithRole) => {
  if (user.instructor_id) {
    await inviteInstructor.mutateAsync(user.instructor_id);
  }
};
```

## Summary

| Change | File |
|--------|------|
| Add `invitation_status` field | `useSettingsUsers.ts` |
| Merge instructors + auth users | `useSettingsUsers.ts` |
| Show status badge | `SettingsUsers.tsx` |
| Add "Einladen" action | `SettingsUsers.tsx` |

## Result

- All staff visible in one place
- Clear indication who has been invited
- Quick action to invite uninvited staff directly from the list

