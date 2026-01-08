import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketFilters {
  search: string;
  dateFrom?: Date;
  dateTo?: Date;
  status: string[];
  productType: string[];
  instructorIds: string[];
  paymentStatus: string[];
  paymentMethod: string[];
}

export interface TicketItem {
  id: string;
  date: string;
  time_start: string | null;
  time_end: string | null;
  instructor_confirmation: string | null;
  product: {
    id: string;
    name: string;
    type: string;
    duration_minutes: number | null;
  } | null;
  instructor: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  participant: {
    id: string;
    first_name: string;
    last_name: string | null;
  } | null;
}

export interface TicketWithDetails {
  id: string;
  ticket_number: string;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string;
    phone: string | null;
    email: string;
  };
  items: TicketItem[];
  // Computed fields
  dateRange: { start: string; end: string } | null;
  timeRange: string | null;
  participantCount: number;
  hasUnconfirmedInstructor: boolean;
  computedPaymentStatus: "paid" | "open" | "overdue" | "partial";
  primaryProduct: { name: string; type: string } | null;
  primaryInstructor: { id: string; firstName: string; lastName: string } | null;
}

export const defaultFilters: TicketFilters = {
  search: "",
  status: [],
  productType: [],
  instructorIds: [],
  paymentStatus: [],
  paymentMethod: [],
};

function computeTicketDetails(ticket: any): TicketWithDetails {
  const items = ticket.ticket_items || [];
  
  // Compute date range
  const dates = items.map((i: any) => i.date).filter(Boolean).sort();
  const dateRange = dates.length > 0 
    ? { start: dates[0], end: dates[dates.length - 1] }
    : null;

  // Compute time range from first item with times
  const itemWithTime = items.find((i: any) => i.time_start && i.time_end);
  const timeRange = itemWithTime 
    ? `${itemWithTime.time_start?.slice(0, 5)} - ${itemWithTime.time_end?.slice(0, 5)}`
    : null;

  // Count unique participants
  const participantIds = new Set(items.map((i: any) => i.participant_id).filter(Boolean));
  const participantCount = participantIds.size || 1;

  // Check for unconfirmed instructors
  const hasUnconfirmedInstructor = items.some(
    (i: any) => i.instructor_id && i.instructor_confirmation !== "confirmed"
  );

  // Compute payment status
  const totalAmount = ticket.total_amount || 0;
  const paidAmount = ticket.paid_amount || 0;
  let computedPaymentStatus: "paid" | "open" | "overdue" | "partial" = "open";
  if (paidAmount >= totalAmount && totalAmount > 0) {
    computedPaymentStatus = "paid";
  } else if (paidAmount > 0 && paidAmount < totalAmount) {
    computedPaymentStatus = "partial";
  }

  // Get primary product (first item's product)
  const firstItem = items[0];
  const primaryProduct = firstItem?.product 
    ? { name: firstItem.product.name, type: firstItem.product.type }
    : null;

  // Get primary instructor (first assigned instructor)
  const itemWithInstructor = items.find((i: any) => i.instructor);
  const primaryInstructor = itemWithInstructor?.instructor
    ? {
        id: itemWithInstructor.instructor.id,
        firstName: itemWithInstructor.instructor.first_name,
        lastName: itemWithInstructor.instructor.last_name,
      }
    : null;

  return {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    status: ticket.status,
    total_amount: ticket.total_amount,
    paid_amount: ticket.paid_amount,
    payment_method: ticket.payment_method,
    notes: ticket.notes,
    internal_notes: ticket.internal_notes,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    customer: {
      id: ticket.customer.id,
      first_name: ticket.customer.first_name,
      last_name: ticket.customer.last_name,
      phone: ticket.customer.phone,
      email: ticket.customer.email,
    },
    items: items.map((item: any) => ({
      id: item.id,
      date: item.date,
      time_start: item.time_start,
      time_end: item.time_end,
      instructor_confirmation: item.instructor_confirmation,
      product: item.product,
      instructor: item.instructor,
      participant: item.participant,
    })),
    dateRange,
    timeRange,
    participantCount,
    hasUnconfirmedInstructor,
    computedPaymentStatus,
    primaryProduct,
    primaryInstructor,
  };
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          *,
          customer:customers!tickets_customer_id_fkey (
            id,
            first_name,
            last_name,
            phone,
            email
          ),
          ticket_items (
            id,
            date,
            time_start,
            time_end,
            instructor_confirmation,
            participant_id,
            instructor_id,
            product:products!ticket_items_product_id_fkey (
              id,
              name,
              type,
              duration_minutes
            ),
            instructor:instructors!ticket_items_instructor_id_fkey (
              id,
              first_name,
              last_name
            ),
            participant:customer_participants!ticket_items_participant_id_fkey (
              id,
              first_name,
              last_name
            )
          )
        `)
        .order("created_at", { ascending: false });

      // Apply status filter
      if (filters.status.length > 0) {
        query = query.in("status", filters.status);
      }

      // Apply payment method filter
      if (filters.paymentMethod.length > 0) {
        query = query.in("payment_method", filters.paymentMethod);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform and compute derived fields
      let tickets = (data || []).map(computeTicketDetails);

      // Client-side filtering for search
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        tickets = tickets.filter((ticket) => {
          // Search ticket number
          if (ticket.ticket_number.toLowerCase().includes(searchLower)) return true;
          
          // Search customer name
          const customerName = `${ticket.customer.first_name || ""} ${ticket.customer.last_name}`.toLowerCase();
          if (customerName.includes(searchLower)) return true;
          
          // Search customer email
          if (ticket.customer.email.toLowerCase().includes(searchLower)) return true;
          
          // Search customer phone
          if (ticket.customer.phone?.includes(filters.search)) return true;
          
          // Search participant names
          const participantMatch = ticket.items.some((item) => {
            if (!item.participant) return false;
            const name = `${item.participant.first_name} ${item.participant.last_name || ""}`.toLowerCase();
            return name.includes(searchLower);
          });
          if (participantMatch) return true;
          
          return false;
        });
      }

      // Client-side filtering for date range
      if (filters.dateFrom || filters.dateTo) {
        tickets = tickets.filter((ticket) => {
          if (!ticket.dateRange) return false;
          const startDate = new Date(ticket.dateRange.start);
          if (filters.dateFrom && startDate < filters.dateFrom) return false;
          if (filters.dateTo && startDate > filters.dateTo) return false;
          return true;
        });
      }

      // Client-side filtering for product type
      if (filters.productType.length > 0) {
        tickets = tickets.filter((ticket) => {
          return ticket.items.some((item) => 
            item.product && filters.productType.includes(item.product.type)
          );
        });
      }

      // Client-side filtering for instructor
      if (filters.instructorIds.length > 0) {
        tickets = tickets.filter((ticket) => {
          return ticket.items.some((item) => 
            item.instructor && filters.instructorIds.includes(item.instructor.id)
          );
        });
      }

      // Client-side filtering for payment status
      if (filters.paymentStatus.length > 0) {
        tickets = tickets.filter((ticket) => 
          filters.paymentStatus.includes(ticket.computedPaymentStatus)
        );
      }

      return tickets;
    },
  });
}
