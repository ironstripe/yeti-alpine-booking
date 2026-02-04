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
    const templateType = params.scope === "single_day" 
      ? "private_lesson.single_day_changed" 
      : "private_lesson.period_changed";

    await supabase.functions.invoke("send-notification", {
      body: {
        type: templateType,
        ticketItemId: params.ticketItemId,
        data: {
          scope: params.scope,
          occurrence_date: params.occurrenceDate,
          period_start_date: params.periodStartDate,
          period_end_date: params.periodEndDate,
          new_time_start: params.newTimeStart,
          new_time_end: params.newTimeEnd,
          new_instructor_id: params.newInstructorId,
        },
      },
    });
  } catch (error) {
    console.error("Failed to send customer notification:", error);
    // Don't throw - notification failure shouldn't block the main operation
    toast.warning("Änderung gespeichert, aber Benachrichtigung fehlgeschlagen");
  }
}
