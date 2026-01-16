import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerWithCount {
  id: string;
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
}

export function useCustomers(searchQuery: string) {
  return useQuery({
    queryKey: ["customers", searchQuery],
    queryFn: async (): Promise<CustomerWithCount[]> => {
      // First get customers
      let query = supabase
        .from("customers")
        .select(`
          *,
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
        participant_count: customer.customer_participants?.length || 0,
      }));
    },
  });
}
