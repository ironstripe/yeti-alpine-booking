import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RecordPaymentParams {
  ticketId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: Date;
  notes?: string;
}

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RecordPaymentParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          ticket_id: params.ticketId,
          amount: params.amount,
          payment_method: params.paymentMethod,
          payment_date: params.paymentDate.toISOString().split("T")[0],
          notes: params.notes || null,
          created_by: user?.id || null,
        });

      if (paymentError) throw paymentError;

      // Get current ticket to update paid_amount
      const { data: ticket, error: fetchError } = await supabase
        .from("tickets")
        .select("paid_amount, total_amount")
        .eq("id", params.ticketId)
        .single();

      if (fetchError) throw fetchError;

      const newPaidAmount = (ticket.paid_amount || 0) + params.amount;

      // Update ticket paid amount
      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          paid_amount: newPaidAmount,
          payment_method: params.paymentMethod,
        })
        .eq("id", params.ticketId);

      if (updateError) throw updateError;

      return { newPaidAmount, totalAmount: ticket.total_amount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      const isPaid = data.newPaidAmount >= (data.totalAmount || 0);
      toast.success(isPaid ? "Zahlung erfasst - Ticket vollständig bezahlt" : "Zahlung erfasst");
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast.error("Fehler beim Erfassen der Zahlung");
    },
  });
}
