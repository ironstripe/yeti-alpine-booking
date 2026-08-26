// Public endpoint: booking status lookup for the website confirmation page.
// GET or POST with { ticket_id, reservation_token }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let ticketId: string | null = null;
  let token: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    ticketId = url.searchParams.get("ticket_id");
    token = url.searchParams.get("token");
  } else {
    try {
      const body = await req.json();
      ticketId = body.ticket_id ?? null;
      token = body.reservation_token ?? body.token ?? null;
    } catch { return json({ error: "Invalid JSON" }, 400); }
  }

  if (!ticketId || !token) return json({ error: "ticket_id and reservation_token are required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, ticket_number, status, total_amount, paid_amount, payment_method, payment_due_date, reservation_expires_at, reservation_token, customers(customer_number, first_name, last_name, email)")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket || ticket.reservation_token !== token) {
      return json({ error: "Booking not found" }, 404);
    }

    const { data: items } = await supabase
      .from("ticket_items")
      .select("date, time_start, time_end, products(name), instructors(first_name, last_name)")
      .eq("ticket_id", ticket.id)
      .order("date", { ascending: true });

    return json({
      success: true,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      payment_status: ticket.paid_amount >= ticket.total_amount && ticket.total_amount > 0 ? "paid" : ticket.payment_method === "invoice" ? "invoice_open" : "open",
      total_amount: ticket.total_amount,
      paid_amount: ticket.paid_amount,
      payment_due_date: ticket.payment_due_date,
      reservation_expires_at: ticket.reservation_expires_at,
      customer: ticket.customers,
      items: items ?? [],
    });
  } catch (e) {
    console.error("get-booking-status error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
