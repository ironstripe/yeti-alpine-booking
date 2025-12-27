import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerWithCount {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  participant_count: number;
}

export function useCustomers(searchQuery: string) {
  return useQuery({
    queryKey: ["customers", searchQuery],
    queryFn: async (): Promise<CustomerWithCount[]> => {
      // First get customers
      let query = supabase
        .from("customers")
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          created_at,
          customer_participants(id)
        `)
        .order("last_name", { ascending: true });

      // Apply search filter if provided
      if (searchQuery.trim()) {
        const search = `%${searchQuery.trim()}%`;
        query = query.or(
          `first_name.ilike.${search},last_name.ilike.${search},email.ilike.${search},phone.ilike.${search}`
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to include participant count
      return (data || []).map((customer) => ({
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        created_at: customer.created_at,
        participant_count: customer.customer_participants?.length || 0,
      }));
    },
  });
}
