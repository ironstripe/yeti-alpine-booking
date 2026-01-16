import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isBookingEditable } from "@/lib/booking-utils";

export interface TicketItemUpdate {
  id: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  instructorId?: string | null;
  meetingPoint?: string | null;
  internalNotes?: string | null;
  instructorNotes?: string | null;
}

export interface NewParticipantItem {
  participantId: string;
  participantFirstName: string;
  dates: string[];
  productId: string;
  timeStart: string;
  timeEnd: string;
  instructorId: string | null;
  meetingPoint: string | null;
  unitPrice: number;
}

export interface UpdateBookingParams {
  ticketId: string;
  
  // Updates for existing ticket_items
  itemUpdates: TicketItemUpdate[];
  
  // New participants to add (creates new ticket_items for each date)
  addedParticipants: NewParticipantItem[];
  
  // Participant IDs to remove (deletes their ticket_items)
  removedParticipantIds: string[];
  
  // Ticket-level updates
  ticketNotes?: string;
  internalNotes?: string;
}

async function recalculateBookingTotal(ticketId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from("ticket_items")
    .select("unit_price, quantity")
    .eq("ticket_id", ticketId);

  if (error) throw error;

  const total = (items || []).reduce((sum, item) => {
    return sum + (item.unit_price || 0) * (item.quantity || 1);
  }, 0);

  return total;
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateBookingParams) => {
      const { ticketId, itemUpdates, addedParticipants, removedParticipantIds, ticketNotes, internalNotes } = params;

      // 1. Validate: all items being updated must be editable (future dates)
      for (const update of itemUpdates) {
        if (update.date && !isBookingEditable(update.date)) {
          throw new Error("Buchungen in der Vergangenheit können nicht geändert werden");
        }
      }

      // 2. Update existing ticket_items
      for (const update of itemUpdates) {
        const updateData: Record<string, any> = {};
        
        if (update.date !== undefined) updateData.date = update.date;
        if (update.timeStart !== undefined) updateData.time_start = update.timeStart;
        if (update.timeEnd !== undefined) updateData.time_end = update.timeEnd;
        if (update.instructorId !== undefined) updateData.instructor_id = update.instructorId;
        if (update.meetingPoint !== undefined) updateData.meeting_point = update.meetingPoint;
        if (update.internalNotes !== undefined) updateData.internal_notes = update.internalNotes;
        if (update.instructorNotes !== undefined) updateData.instructor_notes = update.instructorNotes;

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from("ticket_items")
            .update(updateData)
            .eq("id", update.id);

          if (error) throw error;
        }
      }

      // 3. Remove participants (delete their ticket_items)
      if (removedParticipantIds.length > 0) {
        // First check that all items for these participants are in the future
        const { data: itemsToRemove, error: checkError } = await supabase
          .from("ticket_items")
          .select("id, date, participant_id")
          .eq("ticket_id", ticketId)
          .in("participant_id", removedParticipantIds);

        if (checkError) throw checkError;

        // Validate all are editable
        const pastItems = (itemsToRemove || []).filter(item => !isBookingEditable(item.date));
        if (pastItems.length > 0) {
          throw new Error("Teilnehmer mit vergangenen Lektionen können nicht entfernt werden");
        }

        // Delete group course enrollments first (if any)
        const itemIds = (itemsToRemove || []).map(i => i.id);
        if (itemIds.length > 0) {
          await supabase
            .from("group_course_enrollments")
            .delete()
            .in("ticket_item_id", itemIds);
        }

        // Delete the ticket_items
        const { error: deleteError } = await supabase
          .from("ticket_items")
          .delete()
          .eq("ticket_id", ticketId)
          .in("participant_id", removedParticipantIds);

        if (deleteError) throw deleteError;
      }

      // 4. Add new participants (create ticket_items for each date)
      for (const newParticipant of addedParticipants) {
        for (const date of newParticipant.dates) {
          const { error: insertError } = await supabase
            .from("ticket_items")
            .insert({
              ticket_id: ticketId,
              participant_id: newParticipant.participantId,
              product_id: newParticipant.productId,
              date: date,
              time_start: newParticipant.timeStart,
              time_end: newParticipant.timeEnd,
              instructor_id: newParticipant.instructorId,
              meeting_point: newParticipant.meetingPoint,
              unit_price: newParticipant.unitPrice,
              quantity: 1,
              status: "confirmed",
            });

          if (insertError) throw insertError;
        }
      }

      // 5. Update ticket-level notes if provided
      if (ticketNotes !== undefined || internalNotes !== undefined) {
        const ticketUpdate: Record<string, any> = {};
        if (ticketNotes !== undefined) ticketUpdate.notes = ticketNotes;
        if (internalNotes !== undefined) ticketUpdate.internal_notes = internalNotes;

        const { error: ticketError } = await supabase
          .from("tickets")
          .update(ticketUpdate)
          .eq("id", ticketId);

        if (ticketError) throw ticketError;
      }

      // 6. Recalculate and update total
      const newTotal = await recalculateBookingTotal(ticketId);
      const { error: totalError } = await supabase
        .from("tickets")
        .update({ total_amount: newTotal })
        .eq("id", ticketId);

      if (totalError) throw totalError;

      return { ticketId, newTotal };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", data.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings"] });
      toast.success("Buchung wurde aktualisiert");
    },
    onError: (error: Error) => {
      console.error("Error updating booking:", error);
      toast.error(error.message || "Fehler beim Aktualisieren der Buchung");
    },
  });
}
