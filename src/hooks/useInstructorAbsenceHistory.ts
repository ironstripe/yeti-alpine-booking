import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AbsenceHistoryItem {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  reason: string | null;
  status: string;
  createdAt: string;
  rejectionReason: string | null;
  isFullDay: boolean;
  timeStart: string | null;
  timeEnd: string | null;
}

export function useInstructorAbsenceHistory(instructorId: string | undefined) {
  return useQuery({
    queryKey: ["instructor-absence-history", instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("instructor_absences")
        .select("*")
        .eq("instructor_id", instructorId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((row): AbsenceHistoryItem => ({
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
        type: row.type,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
        rejectionReason: row.rejection_reason,
        isFullDay: row.is_full_day ?? true,
        timeStart: row.time_start,
        timeEnd: row.time_end,
      }));
    },
    enabled: !!instructorId,
  });
}
