import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateLevelParams {
  participantId: string;
  discipline: "ski" | "snowboard";
  levelId: string;
}

export function useUpdateParticipantLevel(instanceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ participantId, discipline, levelId }: UpdateLevelParams) => {
      const updateField =
        discipline === "ski"
          ? { current_ski_level_id: levelId }
          : { current_snowboard_level_id: levelId };

      const { error } = await supabase
        .from("customer_participants")
        .update(updateField)
        .eq("id", participantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-leader-data", instanceId] });
      toast.success("Level aktualisiert", {
        description: "Das Skill-Level wurde erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern", {
        description: "Das Skill-Level konnte nicht aktualisiert werden.",
      });
      console.error("Update level error:", error);
    },
  });
}
