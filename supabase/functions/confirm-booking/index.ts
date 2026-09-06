// Public endpoint: finalize a provisional reservation with the real customer and
// participant data, then apply the payment semantics.
// - payment_method "online": requires a real payment_reference from the payment
//   provider. Marks the booking confirmed + paid and records exactly one payment.
// - payment_method "invoice": marks the booking invoice_pending and creates exactly
//   one open invoice. The booking is NOT marked as paid.
// Prices, paid amounts, source and payment status supplied by the caller are ignored.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";
import { issueInvoice } from "../_shared/invoice-service.ts";




const Customer = z.object({
  salutation: z.string().trim().max(20).optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(50),
  street: z.string().trim().min(1).max(200),
  zip: z.string().trim().min(2).max(20),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().min(2).max(3).default("CH"),
});

const Participant = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discipline: z.enum(["ski", "snowboard"]),
  skill_level: z.string().trim().max(50).optional(),
});

const Payload = z.object({
  ticket_id: z.string().uuid(),
  reservation_token: z.string().min(8).max(128),
  payment_method: z.enum(["online", "invoice"]),
  payment_reference: z.string().trim().min(1).max(200).optional(),
  payment_failed: z.boolean().optional(),
  customer: Customer.optional(),
  participants: z.array(Participant).min(1).max(20).optional(),
  notes: z.string().max(2000).optional(),
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
      .select("id, ticket_number, status, total_amount, paid_amount, reservation_expires_at, reservation_token, customer_id, participant_count")
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (!ticket || ticket.reservation_token !== data.reservation_token) {
      return json({ error: "Reservation not found" }, 404);
    }

    const now = new Date();
    const expired = !!ticket.reservation_expires_at && new Date(ticket.reservation_expires_at) < now;

    if (ticket.status === "expired" || expired) {
      if (!expired) {
        await supabase.from("tickets").update({ status: "expired", updated_at: now.toISOString() }).eq("id", ticket.id);
      }
      return json({ success: false, code: "expired", error: "Die Reservierung ist abgelaufen. Bitte buchen Sie erneut." }, 410);
    }

    if (!["provisional", "payment_pending"].includes(ticket.status ?? "")) {
      if (["confirmed", "invoice_pending"].includes(ticket.status ?? "")) {
        return json({ success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number, status: ticket.status, already_confirmed: true });
      }
      return json({ success: false, error: `Buchung kann im Status "${ticket.status}" nicht bestätigt werden.` }, 409);
    }

    // Failed online payment: keep the hold alive so the customer can retry.
    if (data.payment_method === "online" && data.payment_failed) {
      await supabase.from("tickets").update({ status: "payment_pending", updated_at: now.toISOString() }).eq("id", ticket.id);
      return json({
        success: false,
        code: "payment_failed",
        error: "Zahlung fehlgeschlagen. Sie können es innerhalb der Restzeit erneut versuchen.",
        reservation_expires_at: ticket.reservation_expires_at,
      }, 402);
    }

    // Online payments require a real provider reference before anything is finalized.
    if (data.payment_method === "online" && !data.payment_reference) {
      return json({
        success: false,
        code: "payment_reference_required",
        error: "payment_reference ist für Onlinezahlungen erforderlich.",
        reservation_expires_at: ticket.reservation_expires_at,
      }, 400);
    }

    if (!data.customer || !data.participants) {
      return json({ success: false, code: "customer_required", error: "customer und participants sind erforderlich." }, 400);
    }

    // Atomic finalization: real customer + participants attached to the held slots.
    const { data: fin, error: finErr } = await supabase.rpc("finalize_provisional_reservation", {
      p_ticket_id: ticket.id,
      p_token: data.reservation_token,
      p_customer: data.customer,
      p_participants: data.participants,
      p_notes: data.notes ?? null,
    });
    if (finErr) throw new Error(finErr.message);

    if (fin?.status !== "success") {
      const codeMap: Record<string, number> = {
        not_found: 404,
        expired: 410,
        invalid_status: 409,
        participant_count_mismatch: 422,
      };
      return json({ success: false, ...fin }, codeMap[fin?.code as string] ?? 400);
    }

    const customerId = fin.customer_id as string;

    if (data.payment_method === "online") {
      const { error } = await supabase.from("tickets").update({
        status: "confirmed",
        payment_method: "online",
        paid_amount: ticket.total_amount,
        updated_at: now.toISOString(),
      }).eq("id", ticket.id);
      if (error) throw new Error(error.message);

      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("reference", data.payment_reference!)
        .maybeSingle();

      if (!existingPayment) {
        const { error: pErr } = await supabase.from("payments").insert({
          ticket_id: ticket.id,
          amount: ticket.total_amount,
          payment_method: "online",
          payment_date: now.toISOString().slice(0, 10),
          reference: data.payment_reference,
          status: "completed",
        });
        if (pErr) console.error("payment insert failed:", pErr.message);
      }


      return json({
        success: true,
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        customer_id: customerId,
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

    let { data: invoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, due_date")
      .eq("ticket_id", ticket.id)
      .eq("status", "open")
      .maybeSingle();

    if (!invoice) {
      // Same server-side issuance path as the office UI: routing, reference and
      // immutable payment snapshot all come from the shared invoice service.
      const issued = await issueInvoice(supabase, {
        ticketId: ticket.id,
        customerId,
        subtotal: ticket.total_amount,
        total: ticket.total_amount,
        currency: "CHF",
        dueDays: 14,
      });
      if (!issued.ok) throw new Error(`invoice: ${issued.error}`);
      invoice = issued.invoice as { id: string; invoice_number: string; due_date: string };
    }



    return json({
      success: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      customer_id: customerId,
      status: "invoice_pending",
      payment_status: "invoice_open",
      invoice_number: invoice!.invoice_number,
      due_date: invoice!.due_date,
      total_amount: ticket.total_amount,
    });
  } catch (e) {
    console.error("confirm-booking error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
