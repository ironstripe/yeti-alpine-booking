import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookingWizardState } from "@/contexts/BookingWizardContext";

interface CreateBookingResult {
  ticketId: string;
  ticketNumber: string;
}

async function generateTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get the highest ticket number for this year
  const { data, error } = await supabase
    .from("tickets")
    .select("ticket_number")
    .like("ticket_number", `YETY-${year}-%`)
    .order("ticket_number", { ascending: false })
    .limit(1);

  if (error) throw error;

  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].ticket_number;
    const match = lastNumber.match(/YETY-\d{4}-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  return `YETY-${year}-${nextNumber.toString().padStart(5, "0")}`;
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (state: BookingWizardState): Promise<CreateBookingResult> => {
      // Generate ticket number
      const ticketNumber = await generateTicketNumber();

      // Calculate total (mock calculation - in production use products table)
      const daysCount = state.selectedDates.length;
      const duration = state.duration || 2;
      let unitPrice = 180; // Default 2h private
      if (state.productType === "private") {
        unitPrice = duration === 1 ? 95 : duration === 4 ? 340 : 180;
      } else {
        const groupPrices: Record<number, number> = { 1: 85, 2: 160, 3: 225, 4: 280, 5: 325 };
        unitPrice = groupPrices[daysCount] || 85;
      }
      const totalAmount = state.productType === "private" ? unitPrice * daysCount : unitPrice;

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          customer_id: state.customerId!,
          status: "confirmed",
          total_amount: totalAmount,
          paid_amount: state.isPaid ? totalAmount : 0,
          payment_method: state.paymentMethod,
          payment_due_date: state.paymentDueDate,
          notes: state.customerNotes || null,
          internal_notes: state.internalNotes || null,
        })
        .select("id")
        .single();

      if (ticketError) throw ticketError;

      // Create ticket items for each selected date
      const ticketItems = state.selectedDates.map((dateStr) => ({
        ticket_id: ticket.id,
        product_id: state.productId || "00000000-0000-0000-0000-000000000000", // Placeholder
        date: dateStr,
        time_start: state.timeSlot?.split(" - ")[0] || "10:00",
        time_end: state.timeSlot?.split(" - ")[1] || "12:00",
        unit_price: unitPrice,
        quantity: 1,
        line_total: unitPrice,
        instructor_id: state.instructorId,
        participant_id: state.selectedParticipants[0]?.id.startsWith("guest-") 
          ? null 
          : state.selectedParticipants[0]?.id || null,
        meeting_point: state.meetingPoint,
        instructor_notes: state.instructorNotes || null,
        internal_notes: state.internalNotes || null,
        status: "booked",
        instructor_confirmation: state.instructorId ? "pending" : null,
      }));

      const { error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems);

      if (itemsError) throw itemsError;

      // Link conversation if exists
      if (state.conversationId) {
        await supabase
          .from("conversations")
          .update({ 
            related_ticket_id: ticket.id,
            status: "processed" 
          })
          .eq("id", state.conversationId);
      }

      // Log notifications (placeholder for actual sending)
      console.log("📧 Would send confirmation email to:", state.customer?.email);
      if (state.sendCustomerWhatsApp) {
        console.log("📱 Would send WhatsApp to customer:", state.customer?.phone);
      }
      if (state.notifyInstructor && state.instructor) {
        console.log("📱 Would notify instructor:", state.instructor.first_name, state.instructor.last_name);
      }

      return {
        ticketId: ticket.id,
        ticketNumber,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}