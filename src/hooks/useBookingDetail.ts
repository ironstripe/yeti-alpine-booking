import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookingDetail {
  id: string;
  ticketId: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  status: string | null;
  meetingPoint: string | null;
  internalNotes: string | null;
  instructorNotes: string | null;
  instructorId: string | null;
  participantId: string | null;
  product: {
    id: string;
    name: string;
    type: string;
    durationMinutes: number | null;
  } | null;
  participant: {
    id: string;
    firstName: string;
    lastName: string | null;
  } | null;
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string;
    email: string;
    phone: string | null;
    holidayAddress: string;
  } | null;
  ticket: {
    id: string;
    ticketNumber: string;
    status: string | null;
    paidAmount: number | null;
    totalAmount: number | null;
  } | null;
}

export function useBookingDetail(ticketItemId: string | null) {
  return useQuery({
    queryKey: ["booking-detail", ticketItemId],
    queryFn: async (): Promise<BookingDetail | null> => {
      if (!ticketItemId) return null;

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          ticket_id,
          date,
          time_start,
          time_end,
          status,
          meeting_point,
          internal_notes,
          instructor_notes,
          instructor_id,
          participant_id,
          products (
            id,
            name,
            type,
            duration_minutes
          ),
          customer_participants (
            id,
            first_name,
            last_name
          ),
          instructors (
            id,
            first_name,
            last_name
          ),
          tickets!inner (
            id,
            ticket_number,
            status,
            paid_amount,
            total_amount,
            customers (
              id,
              first_name,
              last_name,
              email,
              phone,
              holiday_address
            )
          )
        `)
        .eq("id", ticketItemId)
        .single();

      if (error) throw error;
      if (!data) return null;

      const ticket = data.tickets as {
        id: string;
        ticket_number: string;
        status: string | null;
        paid_amount: number | null;
        total_amount: number | null;
        customers: {
          id: string;
          first_name: string | null;
          last_name: string;
          email: string;
          phone: string | null;
          holiday_address: string;
        } | null;
      };

      return {
        id: data.id,
        ticketId: data.ticket_id,
        date: data.date,
        timeStart: data.time_start,
        timeEnd: data.time_end,
        status: data.status,
        meetingPoint: data.meeting_point,
        internalNotes: data.internal_notes,
        instructorNotes: data.instructor_notes,
        instructorId: data.instructor_id,
        participantId: data.participant_id,
        product: data.products ? {
          id: data.products.id,
          name: data.products.name,
          type: data.products.type,
          durationMinutes: data.products.duration_minutes,
        } : null,
        participant: data.customer_participants ? {
          id: data.customer_participants.id,
          firstName: data.customer_participants.first_name,
          lastName: data.customer_participants.last_name,
        } : null,
        instructor: data.instructors ? {
          id: data.instructors.id,
          firstName: data.instructors.first_name,
          lastName: data.instructors.last_name,
        } : null,
        customer: ticket.customers ? {
          id: ticket.customers.id,
          firstName: ticket.customers.first_name,
          lastName: ticket.customers.last_name,
          email: ticket.customers.email,
          phone: ticket.customers.phone,
          holidayAddress: ticket.customers.holiday_address,
        } : null,
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          status: ticket.status,
          paidAmount: ticket.paid_amount,
          totalAmount: ticket.total_amount,
        },
      };
    },
    enabled: !!ticketItemId,
  });
}
