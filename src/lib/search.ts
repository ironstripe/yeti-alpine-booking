import { supabase } from "@/integrations/supabase/client";

export interface CustomerSearchResult {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
}

export interface BookingSearchResult {
  id: string;
  ticket_number: string;
  start_date: string | null;
  customer_name: string;
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone")
    .or(
      `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`
    )
    .limit(5);

  if (error) throw error;
  return data || [];
}

export async function searchBookings(query: string): Promise<BookingSearchResult[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
      id,
      ticket_number,
      created_at,
      customers (first_name, last_name)
    `
    )
    .or(`ticket_number.ilike.%${query}%`)
    .limit(5);

  if (error) throw error;

  return (data || []).map((b) => ({
    id: b.id,
    ticket_number: b.ticket_number,
    start_date: b.created_at,
    customer_name: b.customers
      ? `${b.customers.first_name || ""} ${b.customers.last_name}`.trim()
      : "Unbekannt",
  }));
}

export async function searchInstructors(query: string) {
  const { data, error } = await supabase
    .from("instructors")
    .select("id, first_name, last_name, email, phone")
    .or(
      `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`
    )
    .limit(5);

  if (error) throw error;
  return data || [];
}

export interface ParticipantSearchResult {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  customer_id: string;
  customer_name: string;
}

export async function searchParticipants(query: string): Promise<ParticipantSearchResult[]> {
  const { data, error } = await supabase
    .from("customer_participants")
    .select(`
      id, 
      first_name, 
      last_name, 
      birth_date,
      customer_id,
      customers (first_name, last_name)
    `)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .limit(5);

  if (error) throw error;

  return (data || []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    birth_date: p.birth_date,
    customer_id: p.customer_id,
    customer_name: p.customers
      ? `${p.customers.first_name || ""} ${p.customers.last_name}`.trim()
      : "Unbekannt",
  }));
}
