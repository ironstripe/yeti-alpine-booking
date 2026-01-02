import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "office" | "teacher";

interface UserRoleState {
  roles: AppRole[];
  isAdmin: boolean;
  isOffice: boolean;
  isTeacher: boolean;
  isAdminOrOffice: boolean;
  instructorId: string | null;
  loading: boolean;
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();

  // Fetch user roles
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["user-roles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching user roles:", error);
        return [];
      }

      return data.map((r) => r.role as AppRole);
    },
    enabled: !!user?.id,
  });

  // Fetch instructor ID if user is linked to an instructor
  const { data: instructorId, isLoading: instructorLoading } = useQuery({
    queryKey: ["user-instructor", user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      
      const { data, error } = await supabase
        .from("instructors")
        .select("id")
        .ilike("email", user.email)
        .maybeSingle();

      if (error) {
        console.error("Error fetching instructor for user:", error);
        return null;
      }

      return data?.id || null;
    },
    enabled: !!user?.email,
  });

  const roles = rolesData || [];
  const isAdmin = roles.includes("admin");
  const isOffice = roles.includes("office");
  const isTeacher = roles.includes("teacher");
  const isAdminOrOffice = isAdmin || isOffice;

  return {
    roles,
    isAdmin,
    isOffice,
    isTeacher,
    isAdminOrOffice,
    instructorId: instructorId || null,
    loading: rolesLoading || instructorLoading,
  };
}
