import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AppRole } from "./useUserRole";

export interface UserWithRole {
  user_id: string;
  email: string;
  roles: AppRole[];
  instructor_id: string | null;
  instructor_name: string | null;
  created_at: string;
  last_sign_in: string | null;
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

      // Fetch all auth users via edge function
      const { data: authData, error: authError } = await supabase.functions.invoke<{ users: AuthUser[] }>(
        "list-auth-users"
      );

      if (authError) {
        console.error("Error fetching auth users:", authError);
        throw authError;
      }

      const authUsers = authData?.users || [];

      // Get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at");

      if (rolesError) throw rolesError;

      // Get all instructors for email matching
      const { data: instructors } = await supabase
        .from("instructors")
        .select("id, email, first_name, last_name");

      // Create email lookup from instructors
      const instructorByEmail = new Map<string, { id: string; name: string }>();
      if (instructors) {
        for (const instructor of instructors) {
          instructorByEmail.set(instructor.email.toLowerCase(), {
            id: instructor.id,
            name: `${instructor.first_name} ${instructor.last_name}`,
          });
        }
      }

      // Create auth user lookup by ID
      const authUserById = new Map<string, AuthUser>();
      for (const authUser of authUsers) {
        authUserById.set(authUser.id, authUser);
      }

      // Group roles by user_id
      const rolesMap = new Map<string, AppRole[]>();
      const roleCreatedAt = new Map<string, string>();
      
      for (const role of userRoles || []) {
        if (!rolesMap.has(role.user_id)) {
          rolesMap.set(role.user_id, []);
          roleCreatedAt.set(role.user_id, role.created_at);
        }
        rolesMap.get(role.user_id)!.push(role.role as AppRole);
      }

      // Build final user list from auth users
      const usersMap = new Map<string, UserWithRole>();
      
      for (const authUser of authUsers) {
        const email = authUser.email || "";
        const instructorInfo = instructorByEmail.get(email.toLowerCase());
        
        usersMap.set(authUser.id, {
          user_id: authUser.id,
          email: email,
          roles: rolesMap.get(authUser.id) || [],
          instructor_id: instructorInfo?.id || null,
          instructor_name: instructorInfo?.name || null,
          created_at: roleCreatedAt.get(authUser.id) || authUser.created_at,
          last_sign_in: authUser.last_sign_in_at,
        });
      }

      // Sort by email
      return Array.from(usersMap.values()).sort((a, b) => 
        a.email.localeCompare(b.email)
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
