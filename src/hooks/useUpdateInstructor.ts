import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";

type InstructorUpdate = TablesUpdate<"instructors">;

export function useUpdateInstructor(instructorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: InstructorUpdate) => {
      const { data, error } = await supabase
        .from("instructors")
        .update(updates)
        .eq("id", instructorId)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          if (error.message.includes("email")) {
            throw new Error("Diese E-Mail-Adresse wird bereits verwendet.");
          }
          if (error.message.includes("phone")) {
            throw new Error("Diese Telefonnummer wird bereits verwendet.");
          }
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructor", instructorId] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
      toast.success("Skilehrer aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern", {
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    },
  });
}
