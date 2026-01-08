import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import { createInitialComments } from "./useTicketComments";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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
      // Get current user for comment attribution
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate ticket number
      const ticketNumber = await generateTicketNumber();

      // Fetch products from database
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      
      if (productsError) throw productsError;

      // Calculate total from real products
      const daysCount = state.selectedDates.length;
      const duration = state.duration || 2;
      
      let unitPrice = 180; // Fallback
      let productId = state.productId;
      
      if (state.productType === "private" && state.sport) {
        const durationMinutes = duration * 60;
        const sportName = state.sport === "ski" ? "Ski" : "Snowboard";
        const product = products?.find(
          (p) =>
            p.type === "private" &&
            p.duration_minutes === durationMinutes &&
            p.name.includes(sportName)
        );
        if (product) {
          unitPrice = Number(product.price);
          productId = product.id;
        }
      } else if (state.productType === "group") {
        const product = products?.find(
          (p) => p.type === "group" && p.name.includes(`${daysCount} Tag`)
        );
        if (product) {
          unitPrice = Number(product.price);
          productId = product.id;
        }
      }

      // Calculate lunch cost from lunchSelections (for groups) or includeLunch (for private)
      let lunchTotal = 0;
      const lunchProduct = products?.find((p) => p.type === "lunch");
      const lunchPricePerDay = lunchProduct ? Number(lunchProduct.price) : 25;
      
      if (state.productType === "group" && Object.keys(state.lunchSelections).length > 0) {
        const totalLunchDays = Object.values(state.lunchSelections)
          .reduce((sum, days) => sum + days.length, 0);
        lunchTotal = totalLunchDays * lunchPricePerDay;
      } else if (state.includeLunch && lunchProduct) {
        lunchTotal = Number(lunchProduct.price) * daysCount;
      }
      
      // Calculate base total
      const baseTotal = state.productType === "private" ? unitPrice * daysCount : unitPrice;
      
      // Apply discount
      const discountAmount = (baseTotal + lunchTotal) * (state.discountPercent / 100);
      const totalAmount = baseTotal + lunchTotal - discountAmount;

      // Create ticket (without notes - they go to ticket_comments now)
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
          internal_notes: null, // Moved to ticket_comments
        })
        .select("id")
        .single();

      if (ticketError) throw ticketError;

      // Create ticket items for each participant + date combination
      if (!productId) {
        throw new Error("No product selected");
      }

      const ticketItems: Array<{
        ticket_id: string;
        product_id: string;
        date: string;
        time_start: string;
        time_end: string;
        unit_price: number;
        quantity: number;
        line_total: number;
        instructor_id: string | null;
        participant_id: string | null;
        meeting_point: string | null;
        instructor_notes: string | null;
        internal_notes: string | null;
        status: string;
        instructor_confirmation: string | null;
      }> = [];

      // For each participant, create entries for each date
      for (const participant of state.selectedParticipants) {
        for (const dateStr of state.selectedDates) {
          ticketItems.push({
            ticket_id: ticket.id,
            product_id: productId,
            date: dateStr,
            time_start: state.timeSlot?.split(" - ")[0] || "10:00",
            time_end: state.timeSlot?.split(" - ")[1] || "12:00",
            unit_price: unitPrice,
            quantity: 1,
            line_total: unitPrice,
            instructor_id: state.instructorId,
            participant_id: participant.id.startsWith("guest-") ? null : participant.id,
            meeting_point: state.meetingPoint,
            instructor_notes: null,
            internal_notes: null,
            status: "booked",
            instructor_confirmation: state.instructorId ? "pending" : null,
          });
        }
      }

      const { error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems);

      if (itemsError) throw itemsError;

      // Create initial comments from wizard notes
      const userName = user.email?.split("@")[0] || "System";
      await createInitialComments(
        ticket.id,
        state.internalNotes,
        state.instructorNotes,
        user.id,
        userName
      );

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

      // Create "Assign Instructor" task if booking was created with "später zuweisen"
      if (state.assignLater || !state.instructorId) {
        const customerName = state.customer
          ? `${state.customer.first_name || ""} ${state.customer.last_name}`.trim()
          : "Kunde";
        
        const dateRange = state.selectedDates.length === 1
          ? format(new Date(state.selectedDates[0]), "dd.MM.yyyy", { locale: de })
          : `${format(new Date(state.selectedDates[0]), "dd.MM.", { locale: de })} - ${format(new Date(state.selectedDates[state.selectedDates.length - 1]), "dd.MM.yyyy", { locale: de })}`;
        
        const description = `${customerName} – ${dateRange} – ${state.duration || 2}h ${state.sport === "ski" ? "Ski" : "Snowboard"}`;

        await supabase
          .from("action_tasks")
          .insert({
            task_type: "assign_instructor",
            title: "Skilehrer zuweisen",
            description,
            related_ticket_id: ticket.id,
            due_date: state.selectedDates[0], // First lesson date
            priority: "high",
            status: "pending",
            created_by: user.id,
          });
        
        console.log("📋 Created 'Assign Instructor' task for ticket:", ticketNumber);
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
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      queryClient.invalidateQueries({ queryKey: ["action-tasks"] });
    },
  });
}