import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateNotesParams {
  participantId: string;
  notes: string;
}

export function useUpdateParticipantNotes(instanceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ participantId, notes }: UpdateNotesParams) => {
      const { error } = await supabase
        .from("customer_participants")
        .update({ notes })
        .eq("id", participantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-leader-data", instanceId] });
      toast.success("Notizen gespeichert");
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern", {
        description: "Notizen konnten nicht gespeichert werden.",
      });
      console.error("Update notes error:", error);
    },
  });
}
