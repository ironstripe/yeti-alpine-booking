import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { searchCustomersRpc, MIN_SEARCH_LENGTH } from "@/hooks/useCustomerSearch";

export interface CustomerWithCount {
  id: string;
  customer_number: string | null;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  language: string | null;
  holiday_address: string;
  notes: string | null;
  kulanz_score: number | null;
  marketing_consent: boolean | null;
  preferred_channel: string | null;
  additional_phones: unknown[] | null;
  additional_emails: unknown[] | null;
  customer_type: string | null;
  organization_name: string | null;
  billing_email: string | null;
  created_at: string;
  participant_count: number;
  match_reason?: string;
}

const SELECT = `*, customer_participants(id, is_archived)`;

function mapCustomer(customer: any, matchReason?: string): CustomerWithCount {
  return {
    id: customer.id,
    customer_number: customer.customer_number ?? null,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    street: customer.street,
    zip: customer.zip,
    city: customer.city,
    country: customer.country,
    language: customer.language,
    holiday_address: customer.holiday_address,
    notes: customer.notes,
    kulanz_score: customer.kulanz_score,
    marketing_consent: customer.marketing_consent,
    preferred_channel: customer.preferred_channel,
    additional_phones: customer.additional_phones as unknown[] | null,
    additional_emails: customer.additional_emails as unknown[] | null,
    customer_type: customer.customer_type,
    organization_name: customer.organization_name,
    billing_email: customer.billing_email,
    created_at: customer.created_at,
    participant_count:
      (customer.customer_participants || []).filter((p: any) => !p.is_archived).length || 0,
    match_reason: matchReason,
  };
}

export function useCustomers(searchQuery: string) {
  return useQuery({
    queryKey: ["customers", searchQuery],
    queryFn: async (): Promise<CustomerWithCount[]> => {
      const trimmed = searchQuery.trim();

      // Suche läuft über den gemeinsamen serverseitigen Such-Vertrag
      if (trimmed.length >= MIN_SEARCH_LENGTH) {
        const hits = await searchCustomersRpc(trimmed, 100);
        if (hits.length === 0) return [];

        const { data, error } = await supabase
          .from("customers")
          .select(SELECT)
          .in("id", hits.map((h) => h.id));

        if (error) throw error;

        const byId = new Map((data || []).map((c: any) => [c.id, c]));
        return hits
          .map((hit) => {
            const row = byId.get(hit.id);
            return row ? mapCustomer(row, hit.match_reason) : null;
          })
          .filter(Boolean) as CustomerWithCount[];
      }

      const { data, error } = await supabase
        .from("customers")
        .select(SELECT)
        .eq("is_archived", false)
        .order("last_name", { ascending: true });

      if (error) throw error;
      return (data || []).map((c) => mapCustomer(c));
    },
  });
}
