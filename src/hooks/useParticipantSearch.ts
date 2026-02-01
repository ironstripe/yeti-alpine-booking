import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";

export interface SearchableParticipant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
}

export function useParticipantSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ["participant-search", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];

      const { data, error } = await supabase
        .from("customer_participants")
        .select(`
          id, 
          first_name, 
          last_name, 
          birth_date,
          customer:customers!customer_participants_customer_id_fkey (
            id, first_name, last_name, email, phone
          )
        `)
        .or(`first_name.ilike.%${debouncedQuery}%,last_name.ilike.%${debouncedQuery}%`)
        .limit(10);

      if (error) throw error;
      return (data || []) as SearchableParticipant[];
    },
    enabled: debouncedQuery.length >= 2,
  });
}

export function getBirthYearFromDate(birthDate: string): number {
  return new Date(birthDate).getFullYear();
}
