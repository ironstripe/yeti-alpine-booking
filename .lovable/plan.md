

# Fix: End-to-End User Creation & Role Sync

## Problems Identified

1. **No "Add User" in Settings/Users**: Staff must go to "Skilehrer" to create a person, then come back to Settings/Users to invite and manage roles. This is fragmented and confusing.

2. **Roles not synced on invite**: The `invite-instructor` edge function hardcodes `role: "teacher"` (line 169-174) when creating the auth user, completely ignoring the instructor's actual `roles` array (e.g. `["ski", "office"]`). So an office-only person still gets "teacher" role.

3. **`link-instructor-to-user` only runs on creation**: This function correctly maps instructor roles to user_roles, but it only fires when creating an instructor -- not when inviting. The invite path bypasses it entirely.

## Solution

### Fix 1: Add "Neuer Benutzer" Button to Settings/Users

Add a dialog on the Settings/Users page with a simplified form:
- First name, last name, email (required)
- Role checkboxes: Admin, Buro, Lehrer (at least one required)
- On submit: creates an instructor record, then immediately invites them

This creates a single-step flow: one click to create + invite + assign roles.

| File | Change |
|------|--------|
| `src/pages/SettingsUsers.tsx` | Add "Neuer Benutzer" button in CardHeader |
| `src/components/settings/NewUserDialog.tsx` (new) | Simple form: name, email, role checkboxes |

The dialog will:
1. Create an instructor record with appropriate `roles` array (mapping: Lehrer -> `["ski"]`, Buro -> `["office"]`, both -> `["ski", "office"]`)
2. Immediately call `invite-instructor` to send the invitation
3. Invalidate queries to refresh the list

### Fix 2: Update `invite-instructor` to Sync Actual Roles

The edge function currently does:
```text
// Line 169 - PROBLEM: hardcoded "teacher" only
.upsert({ user_id: authUserId, role: "teacher" }, ...)
```

Change it to:
1. Fetch the instructor's `roles` array from the DB (already fetching instructor, just add `roles` to the select)
2. Map instructor roles to user_roles using the same logic as `link-instructor-to-user`:
   - `ski` or `snowboard` in roles -> assign `teacher`
   - `office` in roles -> assign `office`
3. Upsert all mapped roles, not just "teacher"

| File | Change |
|------|--------|
| `supabase/functions/invite-instructor/index.ts` | Fetch instructor.roles, map and upsert all applicable user_roles |

### Fix 3: Refresh Settings Users After Invite

Currently `useInviteInstructor` only invalidates `["instructor"]` and `["instructors"]` queries. Add invalidation for `["settings-users"]` so the user list updates immediately after inviting.

| File | Change |
|------|--------|
| `src/hooks/useInviteInstructor.ts` | Add `queryClient.invalidateQueries({ queryKey: ["settings-users"] })` in onSuccess |

## End-to-End Flow After Fix

```text
Settings/Users -> "Neuer Benutzer" button
  -> Fill: Name, Email, Roles (Admin/Buro/Lehrer)
  -> Submit
    1. Creates instructor record with mapped roles array
    2. Calls invite-instructor
    3. invite-instructor creates auth user
    4. invite-instructor reads instructor.roles, maps to user_roles (teacher/office/admin)
    5. Sends invitation email
    6. User list refreshes showing new user with correct roles and "Eingeladen" status
```

## Files Summary

| File | Action |
|------|--------|
| `src/components/settings/NewUserDialog.tsx` | Create |
| `src/pages/SettingsUsers.tsx` | Add button + dialog |
| `supabase/functions/invite-instructor/index.ts` | Fix role mapping |
| `src/hooks/useInviteInstructor.ts` | Add settings-users invalidation |

