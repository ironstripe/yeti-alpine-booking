import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useIsSuperAdmin() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_admin" as never, { _user_id: user!.id } as never);
      if (error) return false;
      return data === true;
    },
  });
  return data === true;
}
