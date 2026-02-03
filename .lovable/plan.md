
# Add Role Management for Users

## Overview

Add the ability to toggle roles (admin, office, teacher) for users in the Settings > Users page.

## Current State

- The `useSettingsUsers.ts` hook already has `useAddUserRole()` and `useRemoveUserRole()` mutations
- The SettingsUsers page displays roles but has no UI to add/remove them
- Only users with a `user_id` (i.e., those who've been invited) can have roles assigned

## Implementation

### File: `src/pages/SettingsUsers.tsx`

**1. Import the role mutation hooks**

```typescript
import { useSettingsUsers, useResetUserPassword, useAddUserRole, useRemoveUserRole, UserWithRole } from "@/hooks/useSettingsUsers";
```

**2. Add the hooks in the component**

```typescript
const addRole = useAddUserRole();
const removeRole = useRemoveUserRole();
```

**3. Add role toggle handler**

```typescript
const handleToggleRole = async (user: UserWithRole, role: AppRole) => {
  if (!user.user_id) return; // Can't assign roles to non-invited users
  
  const hasRole = user.roles.includes(role);
  if (hasRole) {
    await removeRole.mutateAsync({ userId: user.user_id, role });
  } else {
    await addRole.mutateAsync({ userId: user.user_id, role });
  }
};
```

**4. Add role management items to the dropdown menu**

After the existing menu items, add a submenu or additional items for role toggling:

```tsx
{/* Role management - only for invited users */}
{user.user_id && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuLabel className="text-xs text-muted-foreground">
      Rollen verwalten
    </DropdownMenuLabel>
    {(['admin', 'office', 'teacher'] as const).map((role) => {
      const config = roleConfig[role];
      const Icon = config.icon;
      const hasRole = user.roles.includes(role);
      
      return (
        <DropdownMenuItem
          key={role}
          onClick={() => handleToggleRole(user, role)}
          disabled={addRole.isPending || removeRole.isPending}
        >
          <Icon className={`h-4 w-4 mr-2 ${config.color}`} />
          {config.label}
          {hasRole && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuItem>
      );
    })}
  </>
)}
```

**5. Add required imports**

```typescript
import { DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { AppRole } from "@/hooks/useUserRole";
```

## User Flow

1. Click the "⋮" menu on a user row
2. See existing actions (Invite / Reset Password)
3. See "Rollen verwalten" section with checkmark indicators
4. Click a role to toggle it on/off
5. Toast confirms success

## Constraints

- Role toggles only appear for users with a `user_id` (invited users)
- Non-invited instructors must first be invited before roles can be assigned
- The current user can modify their own roles (be careful with admin removal!)

## Technical Details

- Uses existing `useAddUserRole` and `useRemoveUserRole` mutations
- No database changes required (user_roles table already supports all three roles)
- Mutations handle query invalidation automatically
