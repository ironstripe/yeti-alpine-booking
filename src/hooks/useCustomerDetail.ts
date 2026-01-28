import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdultSelfAssessment } from "@/types/skill-levels";

export interface Participant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  level_last_season: string | null;
  level_current_season: string | null;
  sport: string | null;
  notes: string | null;
  created_at: string;
  // New skill level system columns
  current_ski_level_id: string | null;
  current_snowboard_level_id: string | null;
  self_assessed_ski_level: AdultSelfAssessment | null;
  self_assessed_snowboard_level: AdultSelfAssessment | null;
}

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  phone: string;
  email: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
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
  holiday_address: string;
  additional_phones: { label: string; number: string }[] | null;
  additional_emails: { label: string; email: string }[] | null;
  participants: Participant[];
  // School/Organization fields
  customer_type: string | null;
  organization_name: string | null;
  billing_email: string | null;
  contacts: CustomerContact[];
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
          customer_participants(*),
          customer_contacts(*)
        `)
        .eq("id", customerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        additional_phones: data.additional_phones as { label: string; number: string }[] | null,
        additional_emails: data.additional_emails as { label: string; email: string }[] | null,
        participants: (data.customer_participants || []) as Participant[],
        customer_type: data.customer_type || 'private',
        organization_name: data.organization_name || null,
        billing_email: data.billing_email || null,
        contacts: (data.customer_contacts || []) as CustomerContact[],
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
