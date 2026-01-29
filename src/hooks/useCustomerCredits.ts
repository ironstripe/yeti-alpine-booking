import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCustomerCredits(customerId: string) {
  return useQuery({
    queryKey: ["customer-credits", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });
}

export function useAvailableCredit(customerId: string) {
  const { data: credits } = useCustomerCredits(customerId);

  const total = credits
    ?.filter((c) => c.status === "active")
    .reduce((sum, c) => sum + Number(c.remaining_amount), 0) || 0;

  return total;
}

interface ApplyCreditInput {
  customerId: string;
  ticketId: string;
  amount: number;
}

export function useApplyCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, ticketId, amount }: ApplyCreditInput) => {
      // Get active credits ordered by oldest first (FIFO)
      const { data: credits, error: fetchError } = await supabase
        .from("customer_credits")
        .select("*")
        .eq("customer_id", customerId)
        .eq("status", "active")
        .gt("remaining_amount", 0)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;
      if (!credits?.length) throw new Error("Kein Guthaben verfügbar");

      let remainingToApply = amount;

      for (const credit of credits) {
        if (remainingToApply <= 0) break;

        const amountFromThisCredit = Math.min(
          Number(credit.remaining_amount),
          remainingToApply
        );

        // Insert usage record (trigger updates remaining_amount)
        const { error: usageError } = await supabase
          .from("customer_credit_usage")
          .insert({
            credit_id: credit.id,
            ticket_id: ticketId,
            amount_used: amountFromThisCredit,
          });

        if (usageError) throw usageError;

        remainingToApply -= amountFromThisCredit;
      }

      return { applied: amount - remainingToApply };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customer-credits", variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Guthaben angewendet");
    },
    onError: (error) => {
      console.error("Apply credit error:", error);
      toast.error("Fehler beim Anwenden des Guthabens");
    },
  });
}
