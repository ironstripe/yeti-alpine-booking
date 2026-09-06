import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * Einheitlicher Such-Vertrag für Kunden (serverseitig, RPC `search_customers`).
 * Findet über Vor-/Nachname in beliebiger Reihenfolge, akzentunabhängig,
 * Kundennummer, E-Mail, Telefon (inkl. Zusatznummern), Organisation
 * und über die Namen der zugeordneten Teilnehmer.
 */
export interface CustomerSearchHit {
  id: string;
  customer_number: string | null;
  first_name: string | null;
  last_name: string;
  organization_name: string | null;
  customer_type: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  participant_names: string[];
  match_reason: string;
  match_rank: number;
}

export const MIN_SEARCH_LENGTH = 2;

export function customerDisplayName(
  hit: Pick<CustomerSearchHit, "first_name" | "last_name" | "organization_name" | "customer_type">
): string {
  if (hit.customer_type === "school" && hit.organization_name) return hit.organization_name;
  return [hit.first_name, hit.last_name].filter(Boolean).join(" ") || hit.last_name;
}

export async function searchCustomersRpc(query: string, limit = 20): Promise<CustomerSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const { data, error } = await supabase.rpc("search_customers", {
    p_query: trimmed,
    p_limit: limit,
  });

  if (error) throw error;
  return ((data || []) as CustomerSearchHit[]).map((row) => ({
    ...row,
    participant_names: row.participant_names || [],
  }));
}

export function useCustomerSearch(query: string, limit = 20, debounceMs = 300) {
  const debounced = useDebounce(query, debounceMs);

  return useQuery({
    queryKey: ["customer-search", debounced, limit],
    queryFn: () => searchCustomersRpc(debounced, limit),
    enabled: debounced.trim().length >= MIN_SEARCH_LENGTH,
    staleTime: 15_000,
  });
}
