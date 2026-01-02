import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";

export interface SchedulerCustomer {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
}

export function useSchedulerCustomerSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ["scheduler-customers", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];

      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .or(
          `first_name.ilike.%${debouncedQuery}%,last_name.ilike.%${debouncedQuery}%,email.ilike.%${debouncedQuery}%`
        )
        .limit(10);

      if (error) throw error;
      return (data || []) as SchedulerCustomer[];
    },
    enabled: debouncedQuery.length >= 2,
  });
}
