import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConflictingBooking {
  id: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  customerName: string;
  productType: string;
  productName: string;
}

export interface AbsenceConflict {
  absenceId: string;
  conflicts: ConflictingBooking[];
}

export function useAbsenceConflicts(absences: { id: string; instructorId: string; startDate: string; endDate: string }[]) {
  return useQuery({
    queryKey: ["absence-conflicts", absences.map(a => a.id).join(",")],
    queryFn: async () => {
      if (absences.length === 0) return {};

      const conflictMap: Record<string, ConflictingBooking[]> = {};

      // Fetch conflicts for each absence
      for (const absence of absences) {
        const { data, error } = await supabase
          .from("ticket_items")
          .select(`
            id,
            date,
            time_start,
            time_end,
            tickets!inner (
              customers!inner (
                first_name,
                last_name
              )
            ),
            products!inner (
              name,
              type
            )
          `)
          .eq("instructor_id", absence.instructorId)
          .gte("date", absence.startDate)
          .lte("date", absence.endDate)
          .neq("status", "cancelled");

        if (error) {
          console.error("Error fetching conflicts:", error);
          conflictMap[absence.id] = [];
          continue;
        }

        conflictMap[absence.id] = (data || []).map((item: any) => ({
          id: item.id,
          date: item.date,
          timeStart: item.time_start,
          timeEnd: item.time_end,
          customerName: item.tickets?.customers
            ? `${item.tickets.customers.first_name || ""} ${item.tickets.customers.last_name}`.trim()
            : "Unbekannt",
          productType: item.products?.type || "private",
          productName: item.products?.name || "",
        }));
      }

      return conflictMap;
    },
    enabled: absences.length > 0,
  });
}
