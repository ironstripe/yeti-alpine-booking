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
      // Validate no past dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pastDates = state.selectedDates.filter(dateStr => {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        return date < today;
      });
      
      if (pastDates.length > 0) {
        throw new Error("Buchungen können nicht für vergangene Daten erstellt werden.");
      }

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

      // Fetch time-based rates (needed for both shared and participant-specific mode)
      const { data: ratesData } = await supabase
        .from("private_lesson_rates")
        .select("*")
        .order("start_time");
      
      const { data: highSeasonData } = await supabase
        .from("high_season_periods")
        .select("*");
      
      const rates: TimeSlotRate[] = ratesData || [];
      const highSeasonPeriods: HighSeasonPeriod[] = highSeasonData || [];
      
      // ============ PRIVATE LESSON PRICING ============
      if (state.productType === "private") {
        
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
        // First, try to get product from selected group course
        if (state.selectedGroupId) {
          const { data: selectedCourse } = await supabase
            .from("group_courses")
            .select("product_id, name, price_per_day")
            .eq("id", state.selectedGroupId)
            .single();
          
          if (selectedCourse?.product_id) {
            productId = selectedCourse.product_id;
            // Use group course's price_per_day or product price
            const linkedProduct = products?.find(p => p.id === selectedCourse.product_id);
            unitPrice = selectedCourse.price_per_day || Number(linkedProduct?.price) || 0;
          } else if (selectedCourse?.price_per_day) {
            // Course has price but no linked product - find a generic group product
            const groupProduct = products?.find(p => p.type === "group");
            if (groupProduct) {
              productId = groupProduct.id;
              unitPrice = selectedCourse.price_per_day;
            }
          }
        }
        
        // Fallback to generic group product if no course selected or no product linked
        if (!productId) {
          const groupProduct = products?.find(p => p.type === "group");
          if (groupProduct) {
            productId = groupProduct.id;
            unitPrice = Number(groupProduct.price);
          } else {
            throw new Error("Kein Gruppenkurs-Produkt konfiguriert");
          }
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
        discount_percent: number;
        discount_reason: string | null;
        instructor_id: string | null;
        participant_id: string | null;
        meeting_point: string | null;
        instructor_notes: string | null;
        internal_notes: string | null;
        status: string;
        instructor_confirmation: string | null;
        is_vegetarian: boolean;
        item_type: string;
        // Period booking fields
        period_group_id: string | null;
        is_period_override: boolean;
      }> = [];

      // ============ PARTICIPANT-SPECIFIC BOOKING MODE ============
      if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
        // Each participant has their own booking details
        for (const participant of state.selectedParticipants) {
          const pBooking = state.participantBookings[participant.id];
          if (!pBooking) continue;

          // Determine product and price for this participant
          let participantProductId = productId;
          let participantUnitPrice = unitPrice;

          if (pBooking.productType === "group" && pBooking.groupCourseId) {
            // Fetch group course product
            const { data: course } = await supabase
              .from("group_courses")
              .select("product_id, price_per_day")
              .eq("id", pBooking.groupCourseId)
              .single();

            if (course?.product_id) {
              participantProductId = course.product_id;
              participantUnitPrice = course.price_per_day || 0;
            }
          } else if (pBooking.productType === "private" && pBooking.startTime && pBooking.endTime) {
            // Calculate private lesson price for this participant
            const firstDate = pBooking.dates[0] ? new Date(pBooking.dates[0]) : new Date();
            const priceResult = calculatePrivateLessonPrice(
              firstDate,
              pBooking.startTime,
              pBooking.endTime,
              1, // Individual participant
              rates,
              highSeasonPeriods
            );
            participantUnitPrice = priceResult.totalPrice;
          }

          // Create items for each of this participant's dates
          for (const dateStr of pBooking.dates) {
            const hasLunchOnDay = pBooking.lunchDays.includes(dateStr);

            // Create course/lesson item
            ticketItems.push({
              ticket_id: ticket.id,
              product_id: participantProductId,
              date: dateStr,
              time_start: pBooking.startTime || "10:00",
              time_end: pBooking.endTime || "12:00",
              unit_price: participantUnitPrice,
              quantity: 1,
              discount_percent: state.discountPercent || 0,
              discount_reason: state.discountReason || null,
              instructor_id: state.instructorId,
              participant_id: participant.id.startsWith("guest-") ? null : participant.id,
              meeting_point: state.meetingPoint,
              instructor_notes: null,
              internal_notes: null,
              status: "booked",
              instructor_confirmation: state.instructorId ? "pending" : null,
              is_vegetarian: hasLunchOnDay ? pBooking.isVegetarian : false,
              item_type: pBooking.productType === "group" ? "group" : "private",
              // Participant-specific mode doesn't support period bookings currently
              period_group_id: null,
              is_period_override: false,
            });

            // Create lunch item if applicable
            if (hasLunchOnDay && lunchProduct) {
              ticketItems.push({
                ticket_id: ticket.id,
                product_id: lunchProduct.id,
                date: dateStr,
                time_start: "12:00",
                time_end: "14:00",
                unit_price: lunchPricePerDay,
                quantity: 1,
                discount_percent: 0,
                discount_reason: null,
                instructor_id: null,
                participant_id: participant.id.startsWith("guest-") ? null : participant.id,
                meeting_point: null,
                instructor_notes: null,
                internal_notes: null,
                status: "booked",
                instructor_confirmation: null,
                is_vegetarian: pBooking.isVegetarian,
                item_type: "lunch",
                period_group_id: null,
                is_period_override: false,
              });
            }
          }
        }
      } else {
        // ============ SHARED BOOKING MODE (Original Logic) ============
        
        // Check if this is a period booking (multi-day private lesson)
        const isPeriodBooking = state.productType === "private" && state.selectedDates.length > 1;
        let periodGroupId: string | null = null;

        // Parse base time slot
        const baseTimeStart = state.timeSlot?.split(" - ")[0] || "10:00";
        const baseTimeEnd = state.timeSlot?.split(" - ")[1] || "12:00";

        if (isPeriodBooking) {
          // Generate period group ID
          periodGroupId = crypto.randomUUID();
          
          // Sort dates to get range
          const sortedDates = [...state.selectedDates].sort();
          const periodStartDate = sortedDates[0];
          const periodEndDate = sortedDates[sortedDates.length - 1];
          
          // Create period metadata
          const { error: metadataError } = await supabase
            .from("ticket_item_period_metadata")
            .insert({
              period_group_id: periodGroupId,
              base_instructor_id: state.instructorId,
              base_time_start: baseTimeStart,
              base_time_end: baseTimeEnd,
              start_date: periodStartDate,
              end_date: periodEndDate,
            });
          
          if (metadataError) {
            console.error("Failed to create period metadata:", metadataError);
            throw metadataError;
          }
          
          console.log("📅 Created period booking metadata:", { periodGroupId, periodStartDate, periodEndDate });
        }
        
        for (const participant of state.selectedParticipants) {
          const participantLunchDays = state.lunchSelections[participant.id] || [];
          const isVegetarian = state.vegetarianSelections[participant.id] || false;
          
          for (const dateStr of state.selectedDates) {
            const hasLunchOnDay = participantLunchDays.includes(dateStr);
            
            // Check if there's a time selection from BookingTimeGrid for this date
            const timeSelection = state.timeSelections?.find(ts => ts.date === dateStr);
            
            // Get per-day overrides (supports multiple blocks per day)
            const dayInstructorOverride = state.dayInstructorOverrides?.[dateStr];
            const dayTimeBlocks = state.dayTimeOverrides?.[dateStr] || [];
            
            // Build blocks to process (use overrides if present, else base time as single block)
            const blocksToProcess = dayTimeBlocks.length > 0 
              ? dayTimeBlocks 
              : [{ id: "base", startTime: timeSelection?.startTime || baseTimeStart, endTime: timeSelection?.endTime || baseTimeEnd, instructorId: undefined }];
            
            // Process each time block for this day
            for (const block of blocksToProcess) {
              // Instructor priority: block-level > day-level > base
              const blockInstructorId = block.instructorId !== undefined 
                ? block.instructorId 
                : (dayInstructorOverride !== undefined ? dayInstructorOverride : state.instructorId);
              
              const blockTimeStart = block.startTime;
              const blockTimeEnd = block.endTime;
              
              // Check if this block differs from base (is an override)
              const hasInstructorOverride = blockInstructorId !== state.instructorId;
              const hasTimeOverride = blockTimeStart !== baseTimeStart || blockTimeEnd !== baseTimeEnd;
              const isOverrideBlock = hasInstructorOverride || hasTimeOverride || dayTimeBlocks.length > 1;
              
              // Calculate block-specific price if time differs
              let blockUnitPrice = unitPrice;
              if (state.productType === "private" && hasTimeOverride) {
                const blockDate = new Date(dateStr);
                const blockPriceResult = calculatePrivateLessonPrice(
                  blockDate,
                  blockTimeStart,
                  blockTimeEnd,
                  state.numberOfPersons || 1,
                  rates,
                  highSeasonPeriods
                );
                blockUnitPrice = blockPriceResult.totalPrice;
              }
              
              // Create course/lesson item for this block
              ticketItems.push({
                ticket_id: ticket.id,
                product_id: productId,
                date: dateStr,
                time_start: blockTimeStart,
                time_end: blockTimeEnd,
                unit_price: blockUnitPrice,
                quantity: 1,
                discount_percent: state.discountPercent || 0,
                discount_reason: state.discountReason || null,
                instructor_id: blockInstructorId,
                participant_id: participant.id.startsWith("guest-") ? null : participant.id,
                meeting_point: state.meetingPoint,
                instructor_notes: null,
                internal_notes: null,
                status: "booked",
                instructor_confirmation: blockInstructorId ? "pending" : null,
                is_vegetarian: hasLunchOnDay ? isVegetarian : false,
                item_type: state.productType === "group" ? "group" : "private",
                // Period booking fields
                period_group_id: isPeriodBooking ? periodGroupId : null,
                is_period_override: isOverrideBlock,
              });
            }
            
            // Create separate lunch item if participant has lunch on this day
            if (hasLunchOnDay && lunchProduct) {
              ticketItems.push({
                ticket_id: ticket.id,
                product_id: lunchProduct.id,
                date: dateStr,
                time_start: "12:00",
                time_end: "14:00",
                unit_price: lunchPricePerDay,
                quantity: 1,
                discount_percent: 0,
                discount_reason: null,
                instructor_id: null,
                participant_id: participant.id.startsWith("guest-") ? null : participant.id,
                meeting_point: null,
                instructor_notes: null,
                internal_notes: null,
                status: "booked",
                instructor_confirmation: null,
                is_vegetarian: isVegetarian,
                item_type: "lunch",
                period_group_id: null,
                is_period_override: false,
              });
            }
          }
        }
      }

      // Recalculate total from actual items (for participant-specific mode)
      const recalculatedTotal = ticketItems
        .filter((item) => item.item_type !== "lunch")
        .reduce((sum, item) => sum + (item.unit_price || 0), 0);
      const recalculatedLunch = ticketItems
        .filter((item) => item.item_type === "lunch")
        .reduce((sum, item) => sum + (item.unit_price || 0), 0);
      const finalTotal = recalculatedTotal + recalculatedLunch - (recalculatedTotal + recalculatedLunch) * (state.discountPercent / 100);

      // Update ticket with recalculated total if using participant-specific mode
      if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
        await supabase
          .from("tickets")
          .update({ total_amount: finalTotal })
          .eq("id", ticket.id);
      }

      const { data: insertedItems, error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems)
        .select("id, participant_id, date, item_type, product_id");

      if (itemsError) throw itemsError;

      // ============ INSERT TICKET_ITEM_OVERRIDES ============
      // For period bookings with per-day overrides, create override records
      if (state.productType === "private" && state.selectedDates.length > 1 && insertedItems) {
        const baseTimeStart = state.timeSlot?.split(" - ")[0] || "10:00";
        const baseTimeEnd = state.timeSlot?.split(" - ")[1] || "12:00";
        
        const overridesToInsert: Array<{
          ticket_item_id: string;
          override_date: string;
          instructor_id: string | null;
          start_time: string | null;
          end_time: string | null;
          price_adjustment: number | null;
        }> = [];
        
        // Group inserted items by date for override mapping
        for (const dateStr of state.selectedDates) {
          const dayInstructorOverride = state.dayInstructorOverrides?.[dateStr];
          const dayTimeBlocks = state.dayTimeOverrides?.[dateStr] || [];
          const firstTimeBlock = dayTimeBlocks[0];
          
          const hasInstructorOverride = dayInstructorOverride !== undefined && dayInstructorOverride !== state.instructorId;
          const hasTimeOverride = firstTimeBlock && (
            firstTimeBlock.startTime !== baseTimeStart ||
            firstTimeBlock.endTime !== baseTimeEnd
          );
          
          if (hasInstructorOverride || hasTimeOverride) {
            // Find all ticket_items for this date (one per participant)
            const itemsForDate = insertedItems.filter(
              ti => ti.date === dateStr && ti.item_type === "private"
            );
            
            for (const item of itemsForDate) {
              overridesToInsert.push({
                ticket_item_id: item.id,
                override_date: dateStr,
                instructor_id: hasInstructorOverride ? dayInstructorOverride : null,
                start_time: hasTimeOverride ? firstTimeBlock.startTime : null,
                end_time: hasTimeOverride ? firstTimeBlock.endTime : null,
                price_adjustment: null, // Could calculate price difference if needed
              });
            }
          }
        }
        
        if (overridesToInsert.length > 0) {
          const { error: overridesError } = await supabase
            .from("ticket_item_overrides")
            .insert(overridesToInsert);
          
          if (overridesError) {
            console.error("Failed to create ticket_item_overrides:", overridesError);
            // Non-fatal: continue even if override insertion fails
          } else {
            console.log("📅 Created", overridesToInsert.length, "ticket_item_overrides");
          }
        }
      }

      // ============ GROUP COURSE ENROLLMENT ============
      // Handle participant-specific group enrollments (different groups per participant)
      if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
        for (const participant of state.selectedParticipants) {
          const pBooking = state.participantBookings[participant.id];
          if (!pBooking || pBooking.productType !== "group" || !pBooking.groupCourseId) continue;

          for (const dateStr of pBooking.dates) {
            // Get or create instance for this participant's specific group course
            let { data: existingInstance } = await supabase
              .from("group_course_instances")
              .select("id, current_participants")
              .eq("course_id", pBooking.groupCourseId)
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
                .eq("id", pBooking.groupCourseId)
                .single();

              const dayOfWeek = new Date(dateStr).getDay();
              const schedule = course?.schedules?.find(s => s.day_of_week === dayOfWeek);

              // Create new instance
              const { data: newInstance, error: instanceError } = await supabase
                .from("group_course_instances")
                .insert({
                  course_id: pBooking.groupCourseId,
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

            // Find the matching "group" ticket_item for this participant/date (avoid linking lunch items)
            const ticketItem = insertedItems?.find(
              ti => ti.participant_id === participant.id && 
                   ti.date === dateStr && 
                   ti.item_type === "group"
            );

            await supabase
              .from("group_course_enrollments")
              .insert({
                instance_id: instanceId,
                participant_id: participant.id.startsWith("guest-") ? null : participant.id,
                ticket_item_id: ticketItem?.id || null,
                attendance_status: "registered",
              });

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
      } else if (state.productType === "group" && state.selectedGroupId) {
        // Shared group booking mode (all participants in same group)
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
              ti => ti.participant_id === participant.id && 
                   ti.date === dateStr &&
                   ti.item_type === "group"
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