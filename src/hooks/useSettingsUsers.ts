import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AppRole } from "./useUserRole";

export interface UserWithRole {
  user_id: string | null;
  email: string;
  roles: AppRole[];
  instructor_id: string | null;
  instructor_name: string | null;
  created_at: string;
  last_sign_in: string | null;
  invitation_status: 'invited' | 'not_invited';
}

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useSettingsUsers() {
  return useQuery({
    queryKey: ["settings-users"],
    queryFn: async () => {
      // Get auth token for edge function call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Fetch all data in parallel for faster loading
      const [authResult, rolesResult, instructorsResult] = await Promise.all([
        supabase.functions.invoke<{ users: AuthUser[] }>("list-auth-users"),
        supabase.from("user_roles").select("user_id, role, created_at"),
        supabase.from("instructors").select("id, email, first_name, last_name, created_at")
      ]);

      if (authResult.error) {
        console.error("Error fetching auth users:", authResult.error);
        throw authResult.error;
      }
      if (rolesResult.error) throw rolesResult.error;

      const authUsers = authResult.data?.users || [];
      const userRoles = rolesResult.data;
      const instructors = instructorsResult.data;

      // Create auth user lookup by email (lowercase)
      const authUserByEmail = new Map<string, AuthUser>();
      for (const authUser of authUsers) {
        if (authUser.email) {
          authUserByEmail.set(authUser.email.toLowerCase(), authUser);
        }
      }

      // Group roles by user_id
      const rolesMap = new Map<string, AppRole[]>();
      for (const role of userRoles || []) {
        if (!rolesMap.has(role.user_id)) {
          rolesMap.set(role.user_id, []);
        }
        rolesMap.get(role.user_id)!.push(role.role as AppRole);
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
      for (const [, authUser] of authUserByEmail) {
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

      // Sort by name/email
      return resultList.sort((a, b) => 
        (a.instructor_name || a.email).localeCompare(b.instructor_name || b.email)
      );
    },
  });
}

export function useAddUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      toast.success("Rolle hinzugefügt");
    },
    onError: (error) => {
      console.error("Error adding role:", error);
      toast.error("Fehler beim Hinzufügen");
    },
  });
}

export function useRemoveUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      toast.success("Rolle entfernt");
    },
    onError: (error) => {
      console.error("Error removing role:", error);
      toast.error("Fehler beim Entfernen");
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("E-Mail zum Zurücksetzen wurde gesendet");
    },
    onError: (error) => {
      console.error("Error resetting password:", error);
      toast.error("Fehler beim Senden der E-Mail");
    },
  });
}
