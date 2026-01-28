import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateAttendanceParams {
  enrollmentId: string;
  status: "present" | "absent" | "registered";
}

export function useUpdateAttendance(instanceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId, status }: UpdateAttendanceParams) => {
      const { error } = await supabase
        .from("group_course_enrollments")
        .update({ attendance_status: status })
        .eq("id", enrollmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-leader-data", instanceId] });
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern", {
        description: "Anwesenheit konnte nicht aktualisiert werden.",
      });
      console.error("Update attendance error:", error);
    },
  });
}
