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

      // Try to get current user's email (for display purposes)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // For each user, try to find their email from instructors or current user
      for (const [userId, user] of usersMap) {
        // If this is the current user, we know their email
        if (currentUser && currentUser.id === userId) {
          user.email = currentUser.email || "";
          
          // Check if this user is linked to an instructor
          const instructorInfo = instructorByEmail.get(user.email.toLowerCase());
          if (instructorInfo) {
            user.instructor_id = instructorInfo.id;
            user.instructor_name = instructorInfo.name;
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
