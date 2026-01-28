

# Invite Instructor Feature

## Overview

Implement a complete "Invite Instructor" feature that allows admin/office staff to invite existing instructors (who were imported from the old system) to create an auth account and join the platform.

**Current State:**
- Instructors are linked to users via **email matching** (`useUserRole.ts` line 50)
- There is **no `user_id` column** on the `instructors` table
- Most imported instructors have no corresponding `auth.users` account
- The `user_roles` table uses the `app_role` enum: `admin`, `office`, `teacher`

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     INVITE INSTRUCTOR FLOW                       │
└─────────────────────────────────────────────────────────────────┘

  Admin clicks "Einladen" button
            │
            ▼
  ┌───────────────────────┐
  │ Frontend calls Edge   │
  │ Function with         │
  │ instructor_id         │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │ Edge Function         │
  │ (invite-instructor)   │
  │                       │
  │ 1. Verify caller is   │
  │    admin/office       │
  │                       │
  │ 2. Check instructor   │
  │    email not already  │
  │    in auth.users      │
  │                       │
  │ 3. Call supabase      │
  │    .auth.admin        │
  │    .inviteUserByEmail │
  │                       │
  │ 4. Insert teacher     │
  │    role in user_roles │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │ Supabase sends        │
  │ magic link email      │
  │ to instructor         │
  └───────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/invite-instructor/index.ts` | Edge Function to handle invitation |
| `src/hooks/useInviteInstructor.ts` | React hook with mutation logic |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/InstructorDetail.tsx` | Add "Einladen" button |
| `src/hooks/useInstructorDetail.ts` | Add `hasAuthAccount` check |
| `supabase/config.toml` | Register new Edge Function |

---

## Technical Implementation

### 1. Edge Function: `invite-instructor`

```typescript
// supabase/functions/invite-instructor/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create admin client for auth operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create user client to verify caller's role
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // 1. Verify the caller is authenticated and has admin/office role
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const userRoles = roles?.map(r => r.role) || [];
    if (!userRoles.includes("admin") && !userRoles.includes("office")) {
      return new Response(
        JSON.stringify({ error: "Keine Berechtigung. Nur Admin/Büro kann einladen." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 2. Get instructor data
    const { instructor_id } = await req.json();
    
    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from("instructors")
      .select("id, email, first_name, last_name")
      .eq("id", instructor_id)
      .single();
    
    if (instructorError || !instructor) {
      return new Response(
        JSON.stringify({ error: "Skilehrer nicht gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 3. Check if user already exists in auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === instructor.email.toLowerCase()
    );
    
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: `${instructor.first_name} hat bereits einen Account` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 4. Invite user by email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      instructor.email,
      {
        data: {
          first_name: instructor.first_name,
          last_name: instructor.last_name,
        },
        redirectTo: "https://yeti-alpine-booking.lovable.app/instructor"
      }
    );
    
    if (inviteError) {
      console.error("Invite error:", inviteError);
      return new Response(
        JSON.stringify({ error: `Einladung fehlgeschlagen: ${inviteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 5. Assign teacher role to the new user
    if (inviteData.user) {
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: inviteData.user.id,
          role: "teacher"
        });
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Einladung an ${instructor.email} gesendet`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 2. Add Hook: `useInviteInstructor`

```typescript
// src/hooks/useInviteInstructor.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useHasAuthAccount(instructorEmail: string | undefined) {
  return useQuery({
    queryKey: ["instructor-has-auth", instructorEmail],
    queryFn: async () => {
      if (!instructorEmail) return false;
      
      // Check if user exists by trying to fetch auth users via an RPC
      // Since we can't query auth.users directly, we use email matching logic
      const { data: users } = await supabase
        .from("user_roles")
        .select("user_id")
        .limit(1);
      
      // For now, we'll let the Edge Function handle the check
      // This query is a placeholder - the actual check happens server-side
      return false;
    },
    enabled: !!instructorEmail,
  });
}

export function useInviteInstructor() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instructorId: string) => {
      const { data, error } = await supabase.functions.invoke("invite-instructor", {
        body: { instructor_id: instructorId },
      });
      
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      toast.success("Einladung gesendet!", {
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["instructor"] });
    },
    onError: (error) => {
      toast.error("Einladung fehlgeschlagen", {
        description: error.message,
      });
    },
  });
}
```

### 3. Modify `InstructorDetail.tsx`

Add the invite button to the action buttons section:

```tsx
// Add imports
import { Mail, Loader2 } from "lucide-react";
import { useInviteInstructor } from "@/hooks/useInviteInstructor";
import { useUserRole } from "@/hooks/useUserRole";

// Inside component, add hook calls
const { isAdminOrOffice } = useUserRole();
const inviteMutation = useInviteInstructor();

// Add to the button group (around line 83-92)
{isAdminOrOffice && (
  <Button 
    variant="outline" 
    size="sm" 
    onClick={() => instructor?.id && inviteMutation.mutate(instructor.id)}
    disabled={inviteMutation.isPending}
  >
    {inviteMutation.isPending ? (
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
    ) : (
      <Mail className="h-4 w-4 mr-2" />
    )}
    <span className="hidden sm:inline">Einladen</span>
  </Button>
)}
```

### 4. Update `supabase/config.toml`

Add the new Edge Function registration:

```toml
[functions.invite-instructor]
verify_jwt = true
```

---

## Security Considerations

| Check | Implementation |
|-------|----------------|
| Authentication | Edge Function verifies `Authorization` header |
| Authorization | Checks `user_roles` for `admin` or `office` role |
| Email validation | Supabase handles email format validation |
| Duplicate prevention | Checks `auth.users` before sending invite |
| Role assignment | Automatically assigns `teacher` role on invite |

---

## Email Flow

When `inviteUserByEmail` is called:
1. Supabase sends a magic link to the instructor's email
2. The email uses Supabase's built-in template (or custom if configured)
3. Clicking the link redirects to `/instructor` with the user authenticated
4. The `useUserRole` hook automatically matches the new auth user to the instructor via email

---

## UI States

| State | Button Appearance |
|-------|-------------------|
| Normal | "Einladen" with Mail icon |
| Loading | Spinner + "Einladen" |
| Success | Toast: "Einladung gesendet!" |
| Error | Toast: "Einladung fehlgeschlagen" with error message |
| Already has account | Edge Function returns error, toast shows message |

---

## German Translations

| Key | Translation |
|-----|-------------|
| Invite button | Einladen |
| Success toast | Einladung gesendet! |
| Error toast | Einladung fehlgeschlagen |
| Already has account | {Name} hat bereits einen Account |
| Permission denied | Keine Berechtigung. Nur Admin/Büro kann einladen. |
| Not authenticated | Nicht authentifiziert |
| Instructor not found | Skilehrer nicht gefunden |

---

## Testing Checklist

1. **Permission Check**
   - Login as office/admin user
   - Navigate to an instructor's detail page
   - Verify "Einladen" button is visible
   
2. **Login as Teacher**
   - Login as a teacher user
   - Navigate to an instructor's detail page
   - Verify "Einladen" button is NOT visible

3. **Send Invitation**
   - Click "Einladen" on an instructor without account
   - Verify loading spinner appears
   - Verify success toast appears
   
4. **Check Email Delivery**
   - Check instructor's email inbox
   - Verify magic link email arrives
   
5. **Verify Role Assignment**
   - After invitation, query `user_roles` table
   - Verify `teacher` role was created for the new user

6. **Duplicate Prevention**
   - Try to invite an instructor who already has an account
   - Verify error message is shown

7. **Test Magic Link**
   - Click the magic link in the email
   - Verify redirect to `/instructor` page
   - Verify user is logged in and can access instructor features

---

## Future Enhancements

1. **Bulk Invite** - Allow inviting multiple instructors at once from the list view
2. **Resend Invite** - Add ability to resend invitation if original expired
3. **Invite Status** - Show "Einladung ausstehend" badge for invited but not yet confirmed instructors
4. **Custom Email Template** - Create branded invitation email template

