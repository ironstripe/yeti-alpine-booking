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
}

export function useSettingsUsers() {
  return useQuery({
    queryKey: ["settings-users"],
    queryFn: async () => {
      // Get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at");

      if (rolesError) throw rolesError;

      // Group by user_id
      const usersMap = new Map<string, UserWithRole>();
      
      for (const role of userRoles) {
        if (!usersMap.has(role.user_id)) {
          usersMap.set(role.user_id, {
            user_id: role.user_id,
            email: "",
            roles: [],
            instructor_id: null,
            instructor_name: null,
            created_at: role.created_at,
          });
        }
        usersMap.get(role.user_id)!.roles.push(role.role as AppRole);
      }

      // Get instructor info for teacher roles
      const { data: instructors } = await supabase
        .from("instructors")
        .select("id, email, first_name, last_name");

      if (instructors) {
        for (const instructor of instructors) {
          // Find user by matching instructor email
          for (const [userId, user] of usersMap) {
            // We'll need to match via email later, for now just return what we have
            if (user.roles.includes("teacher")) {
              user.instructor_id = instructor.id;
              user.instructor_name = `${instructor.first_name} ${instructor.last_name}`;
              break;
            }
          }
        }
      }

      return Array.from(usersMap.values());
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
