// Public endpoint: confirm a provisional reservation after payment choice.
// - payment_method "online": requires payment_reference (set by the payment provider
//   after successful charge). Marks booking confirmed + paid.
// - payment_method "invoice": marks booking invoice_pending, creates an invoice with
//   number + due date (14 days). Booking is NOT marked as paid.
// The reservation must not be expired; availability is implicitly still held because
// provisional bookings already block the slot.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const Payload = z.object({
  ticket_id: z.string().uuid(),
  reservation_token: z.string().min(8).max(128),
  payment_method: z.enum(["online", "invoice"]),
  payment_reference: z.string().max(200).optional(),
  payment_failed: z.boolean().optional(), // website reports a failed charge -> keep reservation alive
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const data = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, ticket_number, status, total_amount, paid_amount, reservation_expires_at, reservation_token, customer_id")
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (!ticket || ticket.reservation_token !== data.reservation_token) {
      return json({ error: "Reservation not found" }, 404);
    }

    const now = new Date();
    const expired = ticket.reservation_expires_at && new Date(ticket.reservation_expires_at) < now;

    if (ticket.status === "expired" || expired) {
      if (!expired) {
        await supabase.from("tickets").update({ status: "expired", updated_at: now.toISOString() }).eq("id", ticket.id);
      }
      return json({ success: false, code: "expired", error: "Die Reservierung ist abgelaufen. Bitte buchen Sie erneut." }, 410);
    }

    if (!["provisional", "payment_pending"].includes(ticket.status)) {
      // Idempotent: already confirmed
      if (["confirmed", "invoice_pending"].includes(ticket.status)) {
        return json({ success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number, status: ticket.status, already_confirmed: true });
      }
      return json({ success: false, error: `Buchung kann im Status "${ticket.status}" nicht bestätigt werden.` }, 409);
    }

    // Failed online payment: switch to payment_pending so the customer can retry within the reservation window
    if (data.payment_method === "online" && data.payment_failed) {
      await supabase.from("tickets").update({ status: "payment_pending", updated_at: now.toISOString() }).eq("id", ticket.id);
      return json({
        success: false,
        code: "payment_failed",
        error: "Zahlung fehlgeschlagen. Sie können es innerhalb der Restzeit erneut versuchen.",
        reservation_expires_at: ticket.reservation_expires_at,
      }, 402);
    }

    if (data.payment_method === "online") {
      if (!data.payment_reference) {
        return json({ success: false, error: "payment_reference ist für Onlinezahlungen erforderlich." }, 400);
      }
      const { error } = await supabase.from("tickets").update({
        status: "confirmed",
        payment_method: "online",
        paid_amount: ticket.total_amount,
        updated_at: now.toISOString(),
      }).eq("id", ticket.id);
      if (error) throw new Error(error.message);

      await supabase.from("payments").insert({
        ticket_id: ticket.id,
        amount: ticket.total_amount,
        method: "online",
        reference: data.payment_reference,
        status: "completed",
      }).then(({ error: pErr }) => { if (pErr) console.error("payment insert failed:", pErr.message); });

      return json({
        success: true,
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: "confirmed",
        payment_status: "paid",
        total_amount: ticket.total_amount,
      });
    }

    // invoice
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 14);

    const { error: tErr } = await supabase.from("tickets").update({
      status: "invoice_pending",
      payment_method: "invoice",
      payment_due_date: dueDate.toISOString().slice(0, 10),
      updated_at: now.toISOString(),
    }).eq("id", ticket.id);
    if (tErr) throw new Error(tErr.message);

    const { data: invoice, error: iErr } = await supabase.from("invoices").insert({
      ticket_id: ticket.id,
      customer_id: ticket.customer_id,
      subtotal: ticket.total_amount,
      discount: 0,
      total: ticket.total_amount,
      currency: "CHF",
      status: "open",
      due_date: dueDate.toISOString().slice(0, 10),
    }).select("id, invoice_number, due_date").single();
    if (iErr) throw new Error(`invoice: ${iErr.message}`);

    return json({
      success: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: "invoice_pending",
      payment_status: "invoice_open",
      invoice_number: invoice.invoice_number,
      due_date: invoice.due_date,
      total_amount: ticket.total_amount,
    });
  } catch (e) {
    console.error("confirm-booking error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
