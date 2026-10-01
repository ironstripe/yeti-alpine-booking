import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveInstructor } from "@/lib/instructorsApi";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";

type InstructorUpdate = TablesUpdate<"instructors">;

export function useUpdateInstructor(instructorId: string) {
  const queryClient = useQueryClient();
  const withPay = useIsSuperAdmin();

  return useMutation({
    mutationFn: async (updates: InstructorUpdate) => {
      try {
        await saveInstructor({ ...updates, id: instructorId }, { withPay });
      } catch (e) {
        const error = e as { code?: string; message: string };
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

      return { id: instructorId };
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
