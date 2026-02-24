import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateSharedLessonParams {
  // Original ticket info
  originalTicketId: string;
  instructorId: string;
  date: string;
  startTime: string;
  endTime: string;
  // New party info
  newCustomerId: string;
  newParticipantIds: string[];
  // Product info (copied from original)
  productId: string | null;
  meetingPoint: string | null;
  // Price splits
  initiatorNewAmount: number;
  newPartyAmount: number;
  totalParticipants: number;
  initiatorParticipantCount: number;
  newPartyParticipantCount: number;
}

/**
 * Fetch shared lesson data for a ticket (other parties sharing the same master_booking)
 */
export function useSharedLessonData(ticketId: string | null) {
  return useQuery({
    queryKey: ["shared-lesson", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;

      // Get the ticket's master_booking_id
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .select("master_booking_id, is_initiator, share_participant_count")
        .eq("id", ticketId)
        .single();

      if (ticketError || !ticket?.master_booking_id) return null;

      // Get the master booking
      const { data: masterBooking, error: mbError } = await supabase
        .from("master_bookings")
        .select("*")
        .eq("id", ticket.master_booking_id)
        .single();

      if (mbError) return null;

      // Get all tickets linked to this master booking
      const { data: linkedTickets, error: ltError } = await supabase
        .from("tickets")
        .select(`
          id,
          ticket_number,
          customer_id,
          total_amount,
          is_initiator,
          share_participant_count,
          status,
          customer:customers(first_name, last_name, email)
        `)
        .eq("master_booking_id", ticket.master_booking_id);

      if (ltError) return null;

      return {
        masterBooking,
        linkedTickets: linkedTickets || [],
        currentTicket: ticket,
        isShared: (linkedTickets?.length || 0) > 1,
      };
    },
    enabled: !!ticketId,
  });
}

/**
 * Get total participants across all parties for a master booking
 */
export function useSharedLessonCapacity(masterBookingId: string | null) {
  return useQuery({
    queryKey: ["shared-lesson-capacity", masterBookingId],
    queryFn: async () => {
      if (!masterBookingId) return { totalParticipants: 0, maxCapacity: 5 };

      const { data, error } = await supabase
        .from("master_bookings")
        .select("total_participants")
        .eq("id", masterBookingId)
        .single();

      if (error) return { totalParticipants: 0, maxCapacity: 5 };
      return { totalParticipants: data.total_participants || 0, maxCapacity: 5 };
    },
    enabled: !!masterBookingId,
  });
}

/**
 * Create a shared lesson: creates master_booking if needed, links tickets, splits prices
 */
export function useCreateSharedLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateSharedLessonParams) => {
      const {
        originalTicketId, instructorId, date, startTime, endTime,
        newCustomerId, newParticipantIds, productId, meetingPoint,
        initiatorNewAmount, newPartyAmount, totalParticipants,
        initiatorParticipantCount, newPartyParticipantCount,
      } = params;

      // 1. Check if master_booking already exists for this ticket
      const { data: origTicket } = await supabase
        .from("tickets")
        .select("master_booking_id, ticket_number")
        .eq("id", originalTicketId)
        .single();

      let masterBookingId = origTicket?.master_booking_id;

      // 2. Create master_booking if it doesn't exist
      if (!masterBookingId) {
        const { data: newMb, error: mbError } = await supabase
          .from("master_bookings")
          .insert({
            instructor_id: instructorId,
            date,
            start_time: startTime,
            end_time: endTime,
            total_participants: totalParticipants,
          })
          .select("id")
          .single();

        if (mbError) throw mbError;
        masterBookingId = newMb.id;

        // Link original ticket to master booking
        const { error: linkError } = await supabase
          .from("tickets")
          .update({
            master_booking_id: masterBookingId,
            is_initiator: true,
            share_participant_count: initiatorParticipantCount,
          })
          .eq("id", originalTicketId);

        if (linkError) throw linkError;
      } else {
        // Update master booking total participants
        const { error: updateMbError } = await supabase
          .from("master_bookings")
          .update({ total_participants: totalParticipants })
          .eq("id", masterBookingId);

        if (updateMbError) throw updateMbError;
      }

      // 3. Generate ticket number for new ticket
      const ticketNumber = `T-${Date.now().toString(36).toUpperCase()}`;

      // 4. Create new ticket for the new party
      const { data: newTicket, error: newTicketError } = await supabase
        .from("tickets")
        .insert({
          customer_id: newCustomerId,
          ticket_number: ticketNumber,
          status: "confirmed",
          total_amount: newPartyAmount,
          master_booking_id: masterBookingId,
          is_initiator: false,
          share_participant_count: newPartyParticipantCount,
        })
        .select("id")
        .single();

      if (newTicketError) throw newTicketError;

      // 5. Create ticket_items for each participant in new party
      const ticketItems = newParticipantIds.map(participantId => ({
        ticket_id: newTicket.id,
        participant_id: participantId,
        instructor_id: instructorId,
        date,
        time_start: startTime,
        time_end: endTime,
        product_id: productId,
        meeting_point: meetingPoint,
        status: "confirmed",
        unit_price: newPartyAmount / newParticipantIds.length,
        line_total: newPartyAmount / newParticipantIds.length,
      }));

      const { error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems);

      if (itemsError) throw itemsError;

      // 6. Update initiator's total_amount with new split
      const { error: updateInitiatorError } = await supabase
        .from("tickets")
        .update({ total_amount: initiatorNewAmount })
        .eq("id", originalTicketId);

      if (updateInitiatorError) throw updateInitiatorError;

      // 7. Update all other linked tickets' amounts (if there are >2 parties)
      // This is handled by the caller passing the correct amounts

      return { newTicketId: newTicket.id, masterBookingId };
    },
    onSuccess: () => {
      toast.success("Geteilte Privatstunde erstellt");
      queryClient.invalidateQueries({ queryKey: ["shared-lesson"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-detail"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings"] });
    },
    onError: (error) => {
      console.error("Failed to create shared lesson:", error);
      toast.error("Fehler beim Erstellen der geteilten Privatstunde");
    },
  });
}
