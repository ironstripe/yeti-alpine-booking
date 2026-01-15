import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PendingConfirmation {
  ticket_id: string;
  ticket_number: string;
  status: string;
  created_at: string;
  total_amount: number | null;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  conversation_id: string | null;
  source_channel: string | null;
  item_count: number;
}

export function usePendingConfirmations() {
  return useQuery({
    queryKey: ["pending-confirmations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_booking_confirmations")
        .select("*");

      if (error) throw error;
      return data as PendingConfirmation[];
    },
    refetchInterval: 30000,
  });
}

export function usePendingConfirmationsCount() {
  const { data } = usePendingConfirmations();
  return data?.length ?? 0;
}
