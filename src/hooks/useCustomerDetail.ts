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
  customer_number: string | null;
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
        participants: ((data.customer_participants || []) as any[]).filter(
          (p) => !p.is_archived
        ) as Participant[],

        customer_type: data.customer_type || 'private',
        organization_name: data.organization_name || null,
        billing_email: data.billing_email || null,
        contacts: (data.customer_contacts || []) as CustomerContact[],
      };
    },
    enabled: !!customerId,
  });
}

export interface TicketItemSummary {
  id: string;
  date: string;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  status: string | null;
  meeting_point: string | null;
  productName: string;
  productType: string | null;
  participantName: string | null;
  instructorName: string | null;
  lineTotal: number;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  payment_due_date: string | null;
  created_at: string;
  items: TicketItemSummary[];
  courseDateFrom: string | null;
  courseDateTo: string | null;
  isUpcoming: boolean;
}

export function useCustomerTickets(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-tickets", customerId],
    queryFn: async (): Promise<Ticket[]> => {
      if (!customerId) return [];

      const { data, error } = await supabase
        .from("tickets")
        .select(
          `id, ticket_number, status, total_amount, paid_amount, payment_method, payment_due_date, created_at,
           ticket_items (
             id, date, end_date, time_start, time_end, status, meeting_point, line_total,
             products ( name, type ),
             customer_participants ( first_name, last_name ),
             instructors ( first_name, last_name )
           )`
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);

      return (data || []).map((t: any) => {
        const items: TicketItemSummary[] = (t.ticket_items || [])
          .map((i: any) => ({
            id: i.id,
            date: i.date,
            end_date: i.end_date,
            time_start: i.time_start,
            time_end: i.time_end,
            status: i.status,
            meeting_point: i.meeting_point,
            productName: i.products?.name || "Unbekanntes Produkt",
            productType: i.products?.type || null,
            participantName: i.customer_participants
              ? `${i.customer_participants.first_name} ${i.customer_participants.last_name || ""}`.trim()
              : null,
            instructorName: i.instructors
              ? `${i.instructors.first_name} ${i.instructors.last_name}`.trim()
              : null,
            lineTotal: Number(i.line_total || 0),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const dates = items.map((i) => i.end_date || i.date).filter(Boolean);
        const starts = items.map((i) => i.date).filter(Boolean);
        const courseDateFrom = starts.length ? starts.slice().sort()[0] : null;
        const courseDateTo = dates.length ? dates.slice().sort().reverse()[0] : null;

        return {
          id: t.id,
          ticket_number: t.ticket_number,
          status: t.status,
          total_amount: t.total_amount,
          paid_amount: t.paid_amount,
          payment_method: t.payment_method,
          payment_due_date: t.payment_due_date,
          created_at: t.created_at,
          items,
          courseDateFrom,
          courseDateTo,
          isUpcoming: !!courseDateTo && courseDateTo >= today,
        };
      });
    },
    enabled: !!customerId,
  });
}

