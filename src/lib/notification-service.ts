import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "booking.request.received"
  | "booking.confirmed"
  | "booking.modified"
  | "booking.cancelled"
  | "booking.reminder.1day"
  | "payment.received"
  | "payment.reminder"
  | "instructor.lesson.assigned"
  | "instructor.absence.approved"
  | "instructor.absence.rejected"
  | "system.voucher.expiring";

interface SendNotificationParams {
  type: NotificationType;
  recipientEmail: string;
  recipientName?: string;
  data: Record<string, unknown>;
  userId?: string;
}

export async function sendNotification(params: SendNotificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: params,
    });

    if (error) {
      console.error("Notification error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send notification:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Convenience functions for common notifications
export const NotificationService = {
  async bookingRequestReceived(
    customerEmail: string,
    customerName: string,
    requestNumber: string,
    requestedDate: string,
    productName: string
  ) {
    return sendNotification({
      type: "booking.request.received",
      recipientEmail: customerEmail,
      recipientName: customerName,
      data: {
        customer_name: customerName,
        request_number: requestNumber,
        requested_date: requestedDate,
        product_name: productName,
      },
    });
  },

  async bookingConfirmed(
    customerEmail: string,
    customerSalutation: string,
    customerLastName: string,
    ticketNumber: string,
    bookingDate: string,
    bookingTime: string,
    productName: string,
    meetingPoint: string,
    userId?: string
  ) {
    return sendNotification({
      type: "booking.confirmed",
      recipientEmail: customerEmail,
      recipientName: `${customerSalutation} ${customerLastName}`,
      data: {
        customer_salutation: customerSalutation,
        customer_last_name: customerLastName,
        ticket_number: ticketNumber,
        booking_date: bookingDate,
        booking_time: bookingTime,
        product_name: productName,
        meeting_point: meetingPoint,
      },
      userId,
    });
  },

  async paymentReceived(
    customerEmail: string,
    customerName: string,
    ticketNumber: string,
    amount: number,
    paymentMethod: string,
    userId?: string
  ) {
    return sendNotification({
      type: "payment.received",
      recipientEmail: customerEmail,
      recipientName: customerName,
      data: {
        customer_name: customerName,
        ticket_number: ticketNumber,
        amount: amount.toFixed(2),
        payment_method: paymentMethod,
      },
      userId,
    });
  },

  async absenceApproved(
    instructorEmail: string,
    instructorName: string,
    startDate: string,
    endDate: string,
    absenceType: string,
    userId?: string
  ) {
    return sendNotification({
      type: "instructor.absence.approved",
      recipientEmail: instructorEmail,
      recipientName: instructorName,
      data: {
        instructor_name: instructorName,
        start_date: startDate,
        end_date: endDate,
        absence_type: absenceType,
      },
      userId,
    });
  },

  async bookingReminder(
    customerEmail: string,
    customerName: string,
    bookingDate: string,
    bookingTime: string,
    meetingPoint: string
  ) {
    return sendNotification({
      type: "booking.reminder.1day",
      recipientEmail: customerEmail,
      recipientName: customerName,
      data: {
        customer_name: customerName,
        booking_date: bookingDate,
        booking_time: bookingTime,
        meeting_point: meetingPoint,
      },
    });
  },
};
