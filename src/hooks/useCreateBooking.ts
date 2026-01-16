import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import { createInitialComments } from "./useTicketComments";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  calculatePrivateLessonPrice, 
  type TimeSlotRate, 
  type HighSeasonPeriod 
} from "@/lib/pricing/private-lesson-pricing";

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
      
      let unitPrice = 0;
      let productId = state.productId;
      
      // ============ PRIVATE LESSON PRICING ============
      if (state.productType === "private") {
        // Fetch time-based rates
        const { data: ratesData } = await supabase
          .from("private_lesson_rates")
          .select("*")
          .order("start_time");
        
        const { data: highSeasonData } = await supabase
          .from("high_season_periods")
          .select("*");
        
        const rates: TimeSlotRate[] = ratesData || [];
        const highSeasonPeriods: HighSeasonPeriod[] = highSeasonData || [];
        
        // Get any private product as reference for ticket_items
        if (!productId) {
          const privateProduct = products?.find(p => p.type === "private");
          if (!privateProduct) {
            throw new Error("Kein Privatstunden-Produkt konfiguriert");
          }
          productId = privateProduct.id;
        }
        
        // Parse time slot
        const startTime = state.timeSlot?.split(" - ")[0] || "10:00";
        const endTime = state.timeSlot?.split(" - ")[1] || "12:00";
        const firstDate = state.selectedDates[0] ? new Date(state.selectedDates[0]) : new Date();
        
        // Calculate price using time-based pricing
        const priceResult = calculatePrivateLessonPrice(
          firstDate,
          startTime,
          endTime,
          state.numberOfPersons || 1,
          rates,
          highSeasonPeriods
        );
        
        // Price per day
        unitPrice = priceResult.totalPrice;
        
      // ============ GROUP COURSE PRICING ============
      } else if (state.productType === "group") {
        // Find a group product
        const groupProduct = products?.find(p => p.type === "group");
        if (groupProduct) {
          productId = groupProduct.id;
          
          // TODO: Implement tiered pricing based on days count
          // For now, use the base price multiplied by days
          unitPrice = Number(groupProduct.price);
        } else {
          throw new Error("Kein Gruppenkurs-Produkt konfiguriert");
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
      const baseTotal = state.productType === "private" ? unitPrice * daysCount : unitPrice * daysCount;
      
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
        throw new Error("Kein Produkt ausgewählt");
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

      const { data: insertedItems, error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems)
        .select("id, participant_id, date");

      if (itemsError) throw itemsError;

      // ============ GROUP COURSE ENROLLMENT ============
      if (state.productType === "group" && state.selectedGroupId) {
        // Get or create instances for the selected dates
        for (const dateStr of state.selectedDates) {
          // Check if instance exists
          let { data: existingInstance } = await supabase
            .from("group_course_instances")
            .select("id, current_participants")
            .eq("course_id", state.selectedGroupId)
            .eq("date", dateStr)
            .maybeSingle();

          let instanceId: string;

          if (!existingInstance) {
            // Get course schedule for time info
            const { data: course } = await supabase
              .from("group_courses")
              .select(`
                id,
                schedules:group_course_schedules(start_time, end_time, day_of_week)
              `)
              .eq("id", state.selectedGroupId)
              .single();

            const dayOfWeek = new Date(dateStr).getDay();
            const schedule = course?.schedules?.find(s => s.day_of_week === dayOfWeek);

            // Create new instance
            const { data: newInstance, error: instanceError } = await supabase
              .from("group_course_instances")
              .insert({
                course_id: state.selectedGroupId,
                date: dateStr,
                start_time: schedule?.start_time || "10:00",
                end_time: schedule?.end_time || "12:00",
                current_participants: 0,
                status: "scheduled",
              })
              .select("id")
              .single();

            if (instanceError) throw instanceError;
            instanceId = newInstance.id;
          } else {
            instanceId = existingInstance.id;
          }

          // Create enrollments for each participant
          for (const participant of state.selectedParticipants) {
            const ticketItem = insertedItems?.find(
              ti => ti.participant_id === participant.id && ti.date === dateStr
            );

            await supabase
              .from("group_course_enrollments")
              .insert({
                instance_id: instanceId,
                participant_id: participant.id.startsWith("guest-") ? null : participant.id,
                ticket_item_id: ticketItem?.id || null,
                attendance_status: "registered",
              });
          }

          // Update participant count
          const { count } = await supabase
            .from("group_course_enrollments")
            .select("*", { count: "exact", head: true })
            .eq("instance_id", instanceId);

          await supabase
            .from("group_course_instances")
            .update({ current_participants: count || 0 })
            .eq("id", instanceId);
        }
      }

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
      queryClient.invalidateQueries({ queryKey: ["group-course-instances"] });
      queryClient.invalidateQueries({ queryKey: ["group-courses-for-booking"] });
    },
  });
}