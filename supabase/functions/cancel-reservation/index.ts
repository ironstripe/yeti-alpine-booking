// Public endpoint: immediately release a provisional reservation.
// Input: { ticket_id?, reservation_token?, reason? } — at least one identifier required.
// Effect: ticket status -> "cancelled", items -> "cancelled", instructor/slot released instantly.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const Payload = z.object({
  ticket_id: z.string().uuid().optional(),
  reservation_token: z.string().min(10).max(200).optional(),
  reason: z.string().max(500).optional(),
}).refine((d) => d.ticket_id || d.reservation_token, {
  message: "ticket_id or reservation_token is required",
});

// Only these states may be released through the public endpoint
const RELEASABLE = new Set(["provisional", "payment_pending"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: unknown = {};
  try { body = await req.json(); } catch { /* allow query-param style DELETE */ }
  if (!body || typeof body !== "object" || Object.keys(body as object).length === 0) {
    const url = new URL(req.url);
    body = {
      ticket_id: url.searchParams.get("ticket_id") ?? undefined,
      reservation_token: url.searchParams.get("reservation_token") ?? undefined,
    };
  }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const { ticket_id, reservation_token, reason } = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let query = supabase
      .from("tickets")
      .select("id, ticket_number, status, reservation_token, reservation_expires_at");
    query = ticket_id ? query.eq("id", ticket_id) : query.eq("reservation_token", reservation_token!);
    const { data: ticket, error: findErr } = await query.maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!ticket) return json({ success: false, code: "not_found", error: "Reservation not found" }, 404);

    // If both identifiers are supplied they must match
    if (ticket_id && reservation_token && ticket.reservation_token !== reservation_token) {
      return json({ success: false, code: "invalid_token", error: "Token does not match ticket" }, 403);
    }

    if (["cancelled", "expired"].includes(ticket.status)) {
      return json({
        success: true,
        already_released: true,
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
      });
    }

    if (!RELEASABLE.has(ticket.status)) {
      return json({
        success: false,
        code: "not_releasable",
        error: `Booking with status "${ticket.status}" cannot be released via this endpoint`,
        status: ticket.status,
      }, 409);
    }

    const { error: itemsErr } = await supabase
      .from("ticket_items")
      .update({ status: "cancelled" })
      .eq("ticket_id", ticket.id);
    if (itemsErr) throw new Error(`ticket_items: ${itemsErr.message}`);

    const { error: tErr } = await supabase
      .from("tickets")
      .update({
        status: "cancelled",
        reservation_expires_at: null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? "Reservierung von der Website storniert",
      })
      .eq("id", ticket.id);
    if (tErr) throw new Error(`tickets: ${tErr.message}`);

    return json({
      success: true,
      released: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: "cancelled",
    });
  } catch (e) {
    console.error("cancel-reservation error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
