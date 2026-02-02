
# Handle Pre-existing Auth Users When Creating Instructors

## Current Situation

The system has two separate concepts:
1. **Login accounts** (`auth.users`) - Created when any user logs in
2. **Instructor records** (`instructors` table) - Created by admin for staff

The linking happens via email matching in `useUserRole`:
- Fetches `instructorId` by matching user email to instructor email
- Fetches roles from `user_roles` table

## Problem Scenario

1. User logs in as tester/external → `auth.users` entry created
2. Later, admin creates instructor with same email → `instructors` entry created
3. **Gap**: The user doesn't have "teacher" role in `user_roles`, so they can't access instructor portal

## Solution: Auto-assign Role on Instructor Creation

When an instructor is created, check if an auth user exists with that email and assign the appropriate role.

### Implementation Approach

**Option A: Backend trigger (preferred)**
Create a database function/trigger that runs after instructor insert:
1. Look up auth user by email
2. If found, insert "teacher" role into `user_roles`

**Option B: Frontend hook enhancement**
After successful instructor creation:
1. Call edge function to check/assign role
2. More complex but doesn't require DB trigger

### Recommended: Edge Function Approach

Since we can't directly query `auth.users` from frontend and database triggers can't easily access auth schema, we'll use an edge function.

---

## Technical Changes

### 1. Create Edge Function: `link-instructor-to-user`

**File: `supabase/functions/link-instructor-to-user/index.ts`**

This function:
- Takes instructor email and optionally the desired roles
- Checks if auth user exists with that email
- Adds "teacher" role to `user_roles` if not present
- Returns whether a link was made

```typescript
// Pseudo-logic:
1. Receive { email, roles: ["teacher"] }
2. Use admin API to find auth user by email
3. If found, ensure user_roles has required roles
4. Return { linked: true/false, userId }
```

### 2. Update `useCreateInstructor` Hook

**File: `src/hooks/useCreateInstructor.ts`**

After successful instructor creation, call the edge function to link:

```typescript
onSuccess: async (data) => {
  // Try to link if auth user exists
  await supabase.functions.invoke("link-instructor-to-user", {
    body: { 
      email: data.email,
      roles: data.roles // e.g., ["ski"] maps to "teacher", ["office"] maps to "office"
    }
  });
  
  queryClient.invalidateQueries({ queryKey: ["instructors"] });
}
```

### 3. Role Mapping Logic

| Instructor roles | user_roles entry |
|------------------|------------------|
| `["ski"]`, `["snowboard"]`, or any teaching role | `teacher` |
| `["office"]` | `office` |
| Both teaching + office | Both `teacher` + `office` |

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/link-instructor-to-user/index.ts` | **NEW** - Edge function to link auth users |
| `src/hooks/useCreateInstructor.ts` | Call edge function after creation |

---

## Result

- Pre-existing auth users automatically get correct roles when instructor created
- No manual intervention needed
- Instructor portal becomes accessible immediately
- Works for all role combinations (teacher, office, both)

---

## Edge Cases Handled

1. **Auth user exists, instructor created later** → Role added automatically
2. **Instructor created first, user registers later** → Existing flow (invite-instructor) handles this
3. **Office-only staff** → Gets "office" role, not "teacher"
4. **Mixed roles (teacher + office)** → Gets both roles assigned
