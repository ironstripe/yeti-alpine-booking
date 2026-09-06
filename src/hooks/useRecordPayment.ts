import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logTicketEvent } from "@/lib/ticket-audit";

interface RecordPaymentParams {
  ticketId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: Date;
  notes?: string;
  /** Hotel that settled the charge, when the booking is hotel-billed */
  billingPartnerId?: string | null;
}

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RecordPaymentParams) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert payment record (source of truth for the settled amount)
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          ticket_id: params.ticketId,
          amount: params.amount,
          payment_method: params.paymentMethod,
          payment_date: params.paymentDate.toISOString().split("T")[0],
          status: "completed",
          notes: params.notes || null,
          created_by: user?.id || null,
        });

      if (paymentError) throw paymentError;

      // Get current ticket to update paid_amount
      const { data: ticket, error: fetchError } = await supabase
        .from("tickets")
        .select("paid_amount, total_amount, payment_method, billing_partner_id")
        .eq("id", params.ticketId)
        .single();

      if (fetchError) throw fetchError;

      const newPaidAmount = (ticket.paid_amount || 0) + params.amount;

      // Update ticket paid amount. Keep the billing responsibility (hotel) intact:
      // a hotel-billed ticket stays hotel-billed even when the hotel pays by bank transfer.
      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          paid_amount: newPaidAmount,
          ...(ticket.payment_method === "hotel"
            ? {}
            : { payment_method: params.paymentMethod }),
        })
        .eq("id", params.ticketId);

      if (updateError) throw updateError;

      await logTicketEvent(params.ticketId, "PAYMENT_RECORDED", {
        amount: params.amount,
        payment_method: params.paymentMethod,
        billing_partner_id: params.billingPartnerId ?? ticket.billing_partner_id ?? null,
        new_paid_amount: newPaidAmount,
      });

      return { newPaidAmount, totalAmount: ticket.total_amount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["pending-payments"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history"] });
      const isPaid = data.newPaidAmount >= (data.totalAmount || 0);
      toast.success(isPaid ? "Zahlung erfasst - Ticket vollständig bezahlt" : "Zahlung erfasst");
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast.error("Fehler beim Erfassen der Zahlung");
    },
  });
}
