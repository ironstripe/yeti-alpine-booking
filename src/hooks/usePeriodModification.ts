import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PeriodModificationScope = "single_day" | "entire_period";

export interface PeriodModificationParams {
  bookingId: string;
  periodGroupId: string;
  scope: PeriodModificationScope;
  newDate?: string;
  newTimeStart?: string;
  newTimeEnd?: string;
  newInstructorId?: string;
  notifyCustomer: boolean;
  // Context for notifications
  ticketItemId: string;
  oldInstructorId?: string;
  occurrenceDate: string;
  periodStartDate?: string;
  periodEndDate?: string;
}

export function usePeriodModification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PeriodModificationParams) => {
      const {
        bookingId,
        periodGroupId,
        scope,
        newDate,
        newTimeStart,
        newTimeEnd,
        newInstructorId,
        notifyCustomer,
        oldInstructorId,
        occurrenceDate,
      } = params;

      if (scope === "single_day") {
        // Update only this specific ticket_item
        // Mark it as an override if instructor/time changed from base
        const updatePayload: Record<string, unknown> = {};
        
        if (newDate) updatePayload.date = newDate;
        if (newTimeStart) updatePayload.time_start = newTimeStart;
        if (newTimeEnd) updatePayload.time_end = newTimeEnd;
        if (newInstructorId) updatePayload.instructor_id = newInstructorId;
        
        // Mark as override and reset confirmation
        updatePayload.is_period_override = true;
        updatePayload.instructor_confirmed_at = null;
        updatePayload.confirmation_reset_at = new Date().toISOString();
        updatePayload.confirmation_reset_reason = "single_day_change";

        const { error } = await supabase
          .from("ticket_items")
          .update(updatePayload)
          .eq("id", bookingId);

        if (error) throw error;

        // Queue instructor notifications if instructor changed
        if (newInstructorId && oldInstructorId && newInstructorId !== oldInstructorId) {
          await queueInstructorNotifications(
            bookingId,
            oldInstructorId,
            newInstructorId,
            "reassigned"
          );
        }

      } else {
        // Update ALL ticket_items in the period
        const updatePayload: Record<string, unknown> = {};
        
        // For entire period, we only update time and instructor (not date)
        if (newTimeStart) updatePayload.time_start = newTimeStart;
        if (newTimeEnd) updatePayload.time_end = newTimeEnd;
        if (newInstructorId) updatePayload.instructor_id = newInstructorId;
        
        // Reset confirmation for all items in the period
        updatePayload.instructor_confirmed_at = null;
        updatePayload.confirmation_reset_at = new Date().toISOString();
        updatePayload.confirmation_reset_reason = "period_change";
        // Clear override flag since base is now changed
        updatePayload.is_period_override = false;

        const { error } = await supabase
          .from("ticket_items")
          .update(updatePayload)
          .eq("period_group_id", periodGroupId);

        if (error) throw error;

        // Update period metadata base configuration
        if (newInstructorId || newTimeStart || newTimeEnd) {
          const metadataUpdate: Record<string, unknown> = {};
          if (newInstructorId) metadataUpdate.base_instructor_id = newInstructorId;
          if (newTimeStart) metadataUpdate.base_time_start = newTimeStart;
          if (newTimeEnd) metadataUpdate.base_time_end = newTimeEnd;

          await supabase
            .from("ticket_item_period_metadata")
            .update(metadataUpdate)
            .eq("period_group_id", periodGroupId);
        }

        // Queue instructor notifications if instructor changed
        if (newInstructorId && oldInstructorId && newInstructorId !== oldInstructorId) {
          await queueInstructorNotifications(
            bookingId,
            oldInstructorId,
            newInstructorId,
            "period_reassigned"
          );
        }
      }

      // Send customer notification if requested
      if (notifyCustomer) {
        await sendCustomerNotification(params);
      }

      return { success: true };
    },
    onSuccess: (_, params) => {
      // Invalidate scheduler queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["period-metadata"] });
      
      const scopeText = params.scope === "single_day" ? "Tag" : "Periode";
      toast.success(`${scopeText} erfolgreich aktualisiert`);
    },
    onError: (error: Error) => {
      console.error("Period modification error:", error);
      toast.error(`Fehler beim Aktualisieren: ${error.message}`);
    },
  });
}

// Helper to queue instructor notifications via the existing notification queue
async function queueInstructorNotifications(
  ticketItemId: string,
  oldInstructorId: string,
  newInstructorId: string,
  _eventType: string
) {
  try {
    // Queue removal notification for old instructor
    await supabase.from("instructor_notification_queue").insert({
      instructor_id: oldInstructorId,
      ticket_item_id: ticketItemId,
      notification_type: "cancelled",
      status: "pending",
    });

    // Queue assignment notification for new instructor
    await supabase.from("instructor_notification_queue").insert({
      instructor_id: newInstructorId,
      ticket_item_id: ticketItemId,
      notification_type: "assigned",
      status: "pending",
    });
  } catch (error) {
    console.error("Failed to queue instructor notifications:", error);
    // Don't throw - notification failure shouldn't block the main operation
  }
}

// Helper to send customer notification
async function sendCustomerNotification(params: PeriodModificationParams) {
  try {
    // 1. Fetch ticket item with related customer and instructor data
    const { data: ticketItem, error } = await supabase
      .from("ticket_items")
      .select(`
        id,
        date,
        time_start,
        time_end,
        instructor_id,
        ticket_id,
        tickets!inner (
          id,
          customer_id,
          customers!inner (
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq("id", params.ticketItemId)
      .single();

    if (error) {
      console.error("Failed to fetch ticket item for notification:", error);
      return;
    }

    const customer = (ticketItem?.tickets as any)?.customers;
    if (!customer?.email) {
      console.warn("No customer email found for notification");
      return;
    }

    const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Kunde';

    // 2. Get instructor name (new instructor if changed, otherwise current)
    let instructorName = "Nicht zugewiesen";
    const instructorIdToFetch = params.newInstructorId || ticketItem?.instructor_id;
    
    if (instructorIdToFetch) {
      const { data: instructor } = await supabase
        .from("instructors")
        .select("first_name, last_name")
        .eq("id", instructorIdToFetch)
        .single();
      
      if (instructor) {
        instructorName = `${instructor.first_name} ${instructor.last_name}`;
      }
    }

    // 3. Format dates for German locale
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return "";
      return new Date(dateStr).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    };

    const formatTime = (time?: string) => time?.slice(0, 5) || "";

    // 4. Determine template trigger
    const templateTrigger = params.scope === "single_day"
      ? "private_lesson.single_day_changed"
      : "private_lesson.period_changed";

    // 5. Build template data
    const templateData = {
      customer_name: customerName,
      occurrence_date: formatDate(params.occurrenceDate),
      period_start_date: formatDate(params.periodStartDate),
      period_end_date: formatDate(params.periodEndDate),
      new_time_start: formatTime(params.newTimeStart || ticketItem?.time_start),
      new_time_end: formatTime(params.newTimeEnd || ticketItem?.time_end),
      instructor_name: instructorName,
    };

    // 6. Invoke edge function with correct parameters
    await supabase.functions.invoke("send-notification", {
      body: {
        type: templateTrigger,
        recipientEmail: customer.email,
        recipientName: customerName,
        data: templateData,
      },
    });

    console.log("Customer notification sent successfully");
  } catch (error) {
    console.error("Failed to send customer notification:", error);
    // Don't throw - notification failure shouldn't block the main operation
    toast.warning("Änderung gespeichert, aber Benachrichtigung fehlgeschlagen");
  }
}
