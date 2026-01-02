import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export type AbsenceType = "vacation" | "sick" | "organization" | "office_duty" | "other";
export type AbsenceStatus = "pending" | "confirmed" | "rejected";

interface CreateAbsenceParams {
  instructorId: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  reason?: string;
  status?: AbsenceStatus;
}

export function useCreateAbsence() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      instructorId, 
      startDate, 
      endDate, 
      type, 
      reason,
      status = "confirmed" 
    }: CreateAbsenceParams) => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .insert({
          instructor_id: instructorId,
          start_date: startDate,
          end_date: endDate,
          type,
          reason,
          status,
          created_by: user?.id,
          requested_by: status === "pending" ? user?.id : null,
        })
        .select(`
          id,
          instructor_id,
          start_date,
          end_date,
          type,
          status,
          instructors!inner (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .single();

      if (error) throw error;

      // If admin created a confirmed absence, trigger notification to teacher
      if (status === "confirmed") {
        try {
          await supabase.functions.invoke("notify-absence", {
            body: {
              instructorId: data.instructor_id,
              instructorEmail: data.instructors.email,
              instructorPhone: data.instructors.phone,
              absenceType: data.type,
              startDate: data.start_date,
              endDate: data.end_date,
              action: "created",
              triggeredBy: "admin",
            },
          });
        } catch (notifyError) {
          console.error("Failed to send notification:", notifyError);
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      queryClient.invalidateQueries({ queryKey: ["pending-absences"] });
      
      if (variables.status === "pending") {
        toast.success("Abwesenheitsantrag gesendet");
      } else {
        toast.success("Abwesenheit eingetragen");
      }
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
      queryClient.invalidateQueries({ queryKey: ["pending-absences"] });
      toast.success("Abwesenheit gelöscht");
    },
    onError: (error) => {
      console.error("Failed to delete absence:", error);
      toast.error("Fehler beim Löschen der Abwesenheit");
    },
  });
}
