import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useInstructorCapabilities(instructorId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["instructor-capabilities", instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("instructor_capabilities")
        .select("capability_id")
        .eq("instructor_id", instructorId);

      if (error) {
        console.error("Error fetching instructor capabilities:", error);
        throw error;
      }

      return data.map((r) => r.capability_id);
    },
    enabled: !!instructorId,
  });

  const setCapabilitiesMutation = useMutation({
    mutationFn: async (capabilityIds: string[]) => {
      if (!instructorId) throw new Error("No instructor ID provided");

      const { error } = await supabase.rpc("set_instructor_capabilities", {
        p_instructor_id: instructorId,
        p_capability_ids: capabilityIds,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructor-capabilities", instructorId] });
      queryClient.invalidateQueries({ queryKey: ["instructor", instructorId] });
      toast.success("Qualifikationen gespeichert");
    },
    onError: (error) => {
      console.error("Error setting instructor capabilities:", error);
      toast.error("Fehler beim Speichern der Qualifikationen", {
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    },
  });

  return {
    capabilityIds: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    setCapabilities: setCapabilitiesMutation.mutate,
    isSaving: setCapabilitiesMutation.isPending,
  };
}
