import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ChangeType } from "@/components/bookings/BookingChangeConfirmDialog";

interface BookingChangeNotificationParams {
  ticketItemId: string;
  changeType: ChangeType;
  oldValues: {
    date?: string;
    time?: string;
    instructorId?: string | null;
    instructorName?: string;
  };
  newValues: {
    date?: string;
    time?: string;
    instructorId?: string | null;
    instructorName?: string;
  };
  productName?: string;
  meetingPoint?: string;
}

/**
 * Hook to send customer notifications when a private booking is changed.
 * Fetches customer data and invokes the send-notification edge function.
 */
export function useSendBookingChangeNotification() {
  return useMutation({
    mutationFn: async ({
      ticketItemId,
      changeType,
      oldValues,
      newValues,
      productName,
      meetingPoint,
    }: BookingChangeNotificationParams) => {
      // Skip if no significant change
      if (changeType === 'none') {
        return { skipped: true };
      }

      // Fetch ticket item with related ticket and customer
      const { data: ticketItem, error: itemError } = await supabase
        .from("ticket_items")
        .select(`
          id,
          product:products(name),
          meeting_point,
          ticket:tickets(
            id,
            customer:customers(
              id,
              first_name,
              last_name,
              email
            )
          )
        `)
        .eq("id", ticketItemId)
        .single();

      if (itemError || !ticketItem) {
        console.error("Failed to fetch ticket item:", itemError);
        throw new Error("Buchung nicht gefunden");
      }

      const customer = ticketItem.ticket?.customer;
      if (!customer?.email) {
        console.warn("No customer email found, skipping notification");
        return { skipped: true, reason: "no_email" };
      }

      // Determine which template to use
      const templateTrigger = changeType === 'instructor' 
        ? "customer.instructor.changed" 
        : "customer.booking.changed";

      const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      const resolvedProductName = productName || ticketItem.product?.name || "Privatstunde";
      const resolvedMeetingPoint = meetingPoint || ticketItem.meeting_point || "Talstation";

      // Build template data based on change type
      const templateData: Record<string, string> = {
        customer_name: customerName,
        product_name: resolvedProductName,
        meeting_point: resolvedMeetingPoint,
      };

      if (changeType === 'date' || changeType === 'both') {
        templateData.old_date = oldValues.date || "";
        templateData.old_time = oldValues.time || "";
        templateData.new_date = newValues.date || "";
        templateData.new_time = newValues.time || "";
        templateData.instructor_name = newValues.instructorName || "Noch nicht zugewiesen";
      }

      if (changeType === 'instructor') {
        templateData.booking_date = newValues.date || oldValues.date || "";
        templateData.booking_time = newValues.time || oldValues.time || "";
        templateData.old_instructor_name = oldValues.instructorName || "Nicht zugewiesen";
        templateData.new_instructor_name = newValues.instructorName || "Nicht zugewiesen";
      }

      // Send customer notification
      const response = await supabase.functions.invoke("send-notification", {
        body: {
          type: templateTrigger,
          recipientEmail: customer.email,
          recipientName: customerName,
          data: templateData,
        },
      });

      if (response.error) {
        console.error("Failed to send notification:", response.error);
        throw new Error("E-Mail konnte nicht gesendet werden");
      }

      return { success: true, messageId: response.data?.messageId };
    },
    onSuccess: (data) => {
      if (data.skipped) {
        if (data.reason === "no_email") {
          toast.info("Keine Kunden-E-Mail vorhanden");
        }
        return;
      }
      toast.success("Kunde wurde per E-Mail informiert");
    },
    onError: (error) => {
      console.error("Notification error:", error);
      toast.error("Fehler beim Senden der Benachrichtigung");
    },
  });
}
