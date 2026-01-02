import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateTicketItemParams {
  ticketItemId: string;
  instructorId?: string | null;
  timeStart?: string;
  timeEnd?: string;
  date?: string;
  meetingPoint?: string | null;
  internalNotes?: string | null;
  instructorNotes?: string | null;
  participantId?: string | null;
}

export function useUpdateTicketItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      ticketItemId, 
      instructorId, 
      timeStart, 
      timeEnd, 
      date,
      meetingPoint,
      internalNotes,
      instructorNotes,
      participantId,
    }: UpdateTicketItemParams) => {
      const updates: Record<string, unknown> = {};
      
      if (instructorId !== undefined) updates.instructor_id = instructorId;
      if (timeStart !== undefined) updates.time_start = timeStart;
      if (timeEnd !== undefined) updates.time_end = timeEnd;
      if (date !== undefined) updates.date = date;
      if (meetingPoint !== undefined) updates.meeting_point = meetingPoint;
      if (internalNotes !== undefined) updates.internal_notes = internalNotes;
      if (instructorNotes !== undefined) updates.instructor_notes = instructorNotes;
      if (participantId !== undefined) updates.participant_id = participantId;

      const { data, error } = await supabase
        .from("ticket_items")
        .update(updates)
        .eq("id", ticketItemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Buchung aktualisiert");
    },
    onError: (error) => {
      console.error("Failed to update ticket item:", error);
      toast.error("Fehler beim Aktualisieren der Buchung");
    },
  });
}
