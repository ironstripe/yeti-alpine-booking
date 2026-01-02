import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingAbsence {
  id: string;
  instructorId: string;
  instructorName: string;
  instructorEmail: string;
  startDate: string;
  endDate: string;
  type: string;
  reason: string | null;
  status: string;
  requestedBy: string | null;
  createdAt: string;
}

export function usePendingAbsences() {
  return useQuery({
    queryKey: ["pending-absences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .select(`
          id,
          instructor_id,
          start_date,
          end_date,
          type,
          reason,
          status,
          requested_by,
          created_at,
          instructors!inner (
            first_name,
            last_name,
            email
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((row): PendingAbsence => ({
        id: row.id,
        instructorId: row.instructor_id,
        instructorName: `${row.instructors.first_name} ${row.instructors.last_name}`,
        instructorEmail: row.instructors.email,
        startDate: row.start_date,
        endDate: row.end_date,
        type: row.type,
        reason: row.reason,
        status: row.status,
        requestedBy: row.requested_by,
        createdAt: row.created_at,
      }));
    },
  });
}

export function useApproveAbsence() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (absenceId: string) => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .update({
          status: "confirmed",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", absenceId)
        .select(`
          id,
          instructor_id,
          start_date,
          end_date,
          type,
          instructors!inner (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .single();

      if (error) throw error;

      // Trigger notification
      await triggerNotification({
        instructorId: data.instructor_id,
        instructorEmail: data.instructors.email,
        instructorPhone: data.instructors.phone,
        absenceType: data.type,
        startDate: data.start_date,
        endDate: data.end_date,
        action: "approved",
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-absences"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      toast.success("Abwesenheit genehmigt");
    },
    onError: (error) => {
      console.error("Failed to approve absence:", error);
      toast.error("Fehler beim Genehmigen");
    },
  });
}

export function useRejectAbsence() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ absenceId, reason }: { absenceId: string; reason: string }) => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .update({
          status: "rejected",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", absenceId)
        .select(`
          id,
          instructor_id,
          start_date,
          end_date,
          type,
          instructors!inner (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .single();

      if (error) throw error;

      // Trigger notification
      await triggerNotification({
        instructorId: data.instructor_id,
        instructorEmail: data.instructors.email,
        instructorPhone: data.instructors.phone,
        absenceType: data.type,
        startDate: data.start_date,
        endDate: data.end_date,
        action: "rejected",
        rejectionReason: reason,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-absences"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences"] });
      toast.success("Abwesenheit abgelehnt");
    },
    onError: (error) => {
      console.error("Failed to reject absence:", error);
      toast.error("Fehler beim Ablehnen");
    },
  });
}

interface NotificationParams {
  instructorId: string;
  instructorEmail: string;
  instructorPhone: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  action: "created" | "approved" | "rejected";
  triggeredBy?: "admin" | "teacher";
  rejectionReason?: string;
}

async function triggerNotification(params: NotificationParams) {
  try {
    const { error } = await supabase.functions.invoke("notify-absence", {
      body: params,
    });

    if (error) {
      console.error("Notification trigger failed:", error);
    }
  } catch (error) {
    console.error("Failed to trigger notification:", error);
  }
}
