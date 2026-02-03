import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OfficeHourBlock {
  id: string;
  instructor_id: string;
  date: string;
  time_start: string;
  time_end: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

interface CreateOfficeHourBlockData {
  instructorId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  note?: string;
}

interface UpdateOfficeHourBlockData {
  id: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  note?: string | null;
}

export function useOfficeHourBlocks(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["office-hour-blocks", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_hour_blocks")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;
      return data as OfficeHourBlock[];
    },
  });
}

export function useCreateOfficeHourBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateOfficeHourBlockData) => {
      const { data: result, error } = await supabase
        .from("office_hour_blocks")
        .insert({
          instructor_id: data.instructorId,
          date: data.date,
          time_start: data.timeStart,
          time_end: data.timeEnd,
          note: data.note || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-hour-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks"] });
      toast.success("Bürodienst erfolgreich eingetragen");
    },
    onError: (error) => {
      console.error("Error creating office hour block:", error);
      toast.error("Fehler beim Erstellen des Bürodienstes");
    },
  });
}

export function useUpdateOfficeHourBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateOfficeHourBlockData) => {
      const { id, ...updates } = data;
      const updateData: Record<string, unknown> = {};
      if (updates.date !== undefined) updateData.date = updates.date;
      if (updates.timeStart !== undefined) updateData.time_start = updates.timeStart;
      if (updates.timeEnd !== undefined) updateData.time_end = updates.timeEnd;
      if (updates.note !== undefined) updateData.note = updates.note;

      const { data: result, error } = await supabase
        .from("office_hour_blocks")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-hour-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks"] });
      toast.success("Bürodienst aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating office hour block:", error);
      toast.error("Fehler beim Aktualisieren des Bürodienstes");
    },
  });
}

export function useDeleteOfficeHourBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("office_hour_blocks")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-hour-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks"] });
      toast.success("Bürodienst gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting office hour block:", error);
      toast.error("Fehler beim Löschen des Bürodienstes");
    },
  });
}
