import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CancellationInput {
  ticketId: string;
  customerId: string;
  cancellationType: "full" | "partial";
  cancelledItemIds: string[] | null;
  cancellationReason: string;
  originalBookingAmount: number;
  cancelledAmount: number;
  amountAlreadyPaid: number;
  feeAccordingToAgb: number;
  feeCharged: number;
  waiverReason: string | null;
  hoursBeforeStart: number | null;
  creditAction: "customer_credit" | "refund_iban" | "refund_terminal" | "none";
  iban: string | null;
  accountHolder: string | null;
}

export function useCancellation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CancellationInput) => {
      const creditAmount = Math.max(0, input.amountAlreadyPaid - input.feeCharged);
      let customerCreditId: string | null = null;

      // 1. Create customer credit if there's money to refund
      if (creditAmount > 0 && input.creditAction !== "none") {
        const { data: credit, error: creditError } = await supabase
          .from("customer_credits")
          .insert({
            customer_id: input.customerId,
            original_amount: creditAmount,
            remaining_amount: creditAmount,
            source_type: "cancellation",
            source_reference_id: input.ticketId,
            description: `Stornierung Buchung - ${input.cancellationReason.slice(0, 50)}`,
            status: "active",
          })
          .select("id")
          .single();

        if (creditError) throw creditError;
        customerCreditId = credit.id;

        // 2. Create refund request if IBAN or terminal
        if (input.creditAction === "refund_iban" || input.creditAction === "refund_terminal") {
          const { error: refundError } = await supabase
            .from("refund_requests")
            .insert({
              customer_id: input.customerId,
              credit_id: customerCreditId,
              amount: creditAmount,
              refund_method: input.creditAction === "refund_iban" ? "iban" : "terminal",
              iban: input.iban,
              account_holder: input.accountHolder,
              status: "pending",
            });

          if (refundError) throw refundError;
        }
      }

      // 3. Create cancellation record
      const { error: cancellationError } = await supabase
        .from("booking_cancellations")
        .insert({
          ticket_id: input.ticketId,
          cancellation_type: input.cancellationType,
          cancelled_item_ids: input.cancelledItemIds,
          cancellation_reason: input.cancellationReason,
          original_booking_amount: input.originalBookingAmount,
          cancelled_amount: input.cancelledAmount,
          amount_already_paid: input.amountAlreadyPaid,
          fee_according_to_agb: input.feeAccordingToAgb,
          fee_charged: input.feeCharged,
          waiver_reason: input.waiverReason,
          hours_before_start: input.hoursBeforeStart,
          credit_action: input.creditAction,
          customer_credit_id: customerCreditId,
        });

      if (cancellationError) throw cancellationError;

      // 4. Update ticket status
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ status: input.cancellationType === "full" ? "storno" : "partial_cancelled" })
        .eq("id", input.ticketId);

      if (ticketError) throw ticketError;

      // 5. For partial cancellations, update specific ticket items
      if (input.cancellationType === "partial" && input.cancelledItemIds?.length) {
        const { error: itemsError } = await supabase
          .from("ticket_items")
          .update({ status: "cancelled" })
          .in("id", input.cancelledItemIds);

        if (itemsError) throw itemsError;
      }

      return { success: true, creditId: customerCreditId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      toast.success("Buchung erfolgreich storniert");
    },
    onError: (error) => {
      console.error("Cancellation error:", error);
      toast.error("Fehler bei der Stornierung");
    },
  });
}
