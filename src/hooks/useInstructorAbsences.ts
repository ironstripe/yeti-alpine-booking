import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export type AbsenceType = "vacation" | "sick" | "organization" | "office_duty" | "other";

interface CreateAbsenceParams {
  instructorId: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  reason?: string;
}

export function useCreateAbsence() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ instructorId, startDate, endDate, type, reason }: CreateAbsenceParams) => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .insert({
          instructor_id: instructorId,
          start_date: startDate,
          end_date: endDate,
          type,
          reason,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      toast.success("Abwesenheit eingetragen");
    },
    onError: (error) => {
      console.error("Failed to create absence:", error);
      toast.error("Fehler beim Eintragen der Abwesenheit");
    },
  });
}

export function useDeleteAbsence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (absenceId: string) => {
      const { error } = await supabase
        .from("instructor_absences")
        .delete()
        .eq("id", absenceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      toast.success("Abwesenheit gelöscht");
    },
    onError: (error) => {
      console.error("Failed to delete absence:", error);
      toast.error("Fehler beim Löschen der Abwesenheit");
    },
  });
}
