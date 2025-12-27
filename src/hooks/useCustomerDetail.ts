import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Participant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  level: string | null;
  sport: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerDetail {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  preferred_channel: string | null;
  language: string | null;
  marketing_consent: boolean | null;
  kulanz_score: number | null;
  notes: string | null;
  created_at: string;
  participants: Participant[];
}

export function useCustomerDetail(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer", customerId],
    queryFn: async (): Promise<CustomerDetail | null> => {
      if (!customerId) return null;

      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          customer_participants(*)
        `)
        .eq("id", customerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        participants: data.customer_participants || [],
      };
    },
    enabled: !!customerId,
  });
}

export interface Ticket {
  id: string;
  ticket_number: string;
  status: string | null;
  total_amount: number | null;
  created_at: string;
}

export function useCustomerTickets(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-tickets", customerId],
    queryFn: async (): Promise<Ticket[]> => {
      if (!customerId) return [];

      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_number, status, total_amount, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
  });
}
