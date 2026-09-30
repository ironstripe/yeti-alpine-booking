// Public endpoint: finalize a provisional reservation with the real customer and
// participant data, then apply the payment semantics.
//
// - payment_method "online": the payment must be verified server-side. The caller
//   passes the provider session id (`payment_session_id`) that
//   create-payment-session returned; the amount and currency are checked against
//   the stored ticket and the provider state. A raw client-supplied
//   `payment_reference` is never trusted (B+ Phase 2) — such a call is rejected
//   with 402 instead of marking the booking paid.
// - payment_method "invoice": binding immediately (status confirmed), exactly one
//   open invoice, booking confirmation and invoice e-mail (with the Swiss QR
//   payment part) sent server-side. NOT marked as paid.
// Prices, paid amounts, source and payment status supplied by the caller are ignored.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";
import { issueInvoiceThenConfirm } from "./invoiceStep.ts";
import {
  attemptConfirmation,
  ensureConfirmationDelivery,
  sendConfirmationIfPossible,
} from "../_shared/bookingDelivery.ts";
import { attemptInvoiceDelivery, ensureInvoiceDelivery } from "../_shared/invoiceDelivery.ts";
import { verifyOnlinePayment } from "../_shared/paymentSessions.ts";

const GUEST_MESSAGE =
  "Ihre Buchung ist verbindlich bestätigt. Die Rechnung mit QR-Zahlungsteil haben wir Ihnen per E-Mail zugestellt.";

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
  /** Provider session id from create-payment-session (required for "online"). */
  payment_session_id: z.string().trim().min(6).max(200).optional(),
  /** Legacy field; treated as a session id and verified, never trusted blindly. */
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

    // A paid reservation stays valid until its extended hold ends; the provider
    // state is the authority for whether the payment arrived.
    if (ticket.status === "expired" || expired) {
      if (!expired) {
        await supabase.from("tickets").update({ status: "expired", updated_at: now.toISOString() }).eq("id", ticket.id);
      }
      return json({ success: false, code: "expired", error: "Die Reservierung ist abgelaufen. Bitte buchen Sie erneut." }, 410);
    }

    if (!["provisional", "payment_pending"].includes(ticket.status ?? "")) {
      if (["confirmed", "invoice_pending"].includes(ticket.status ?? "")) {
        const { data: openInv } = await supabase
          .from("invoices").select("id").eq("ticket_id", ticket.id).eq("status", "open").maybeSingle();
        return json({
          success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number, status: ticket.status,
          already_confirmed: true,
          ...(openInv ? { guest_message: GUEST_MESSAGE } : {}),
        });
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

    // Online payments are only accepted with a server-verified provider session.
    let verifiedSessionId: string | null = null;
    let verifiedPaymentReference: string | null = null;
    if (data.payment_method === "online") {
      const sessionId = data.payment_session_id ?? data.payment_reference ?? null;
      if (!sessionId) {
        return json({
          success: false,
          code: "payment_session_required",
          error: "payment_session_id ist für Onlinezahlungen erforderlich.",
          reservation_expires_at: ticket.reservation_expires_at,
        }, 400);
      }
      const verification = await verifyOnlinePayment(supabase, { ticketId: ticket.id, sessionId, now });
      if (!verification.ok) {
        return json({
          success: false,
          code: verification.code ?? "payment_not_verified",
          error: verification.error ?? "Die Zahlung konnte nicht bestätigt werden.",
          reservation_expires_at: ticket.reservation_expires_at,
        }, 402);
      }
      verifiedSessionId = sessionId;
      verifiedPaymentReference = verification.sessionRow?.provider_payment_intent_id ?? sessionId;
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

      // The payment row is written by the verified session; never by the caller.
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("reference", verifiedPaymentReference!)
        .maybeSingle();

      if (!existingPayment) {
        const { error: pErr } = await supabase.from("payments").insert({
          ticket_id: ticket.id,
          amount: ticket.total_amount,
          payment_method: "online",
          payment_date: now.toISOString().slice(0, 10),
          reference: verifiedPaymentReference,
          status: "completed",
          notes: `Zahlungsprovider Session ${verifiedSessionId}`,
        });
        if (pErr) console.error("payment insert failed:", pErr.message);
      }

      // Confirmation e-mail is part of the B+ flow for paid bookings as well.
      let confirmationStatus = "failed";
      try {
        confirmationStatus = await sendConfirmationIfPossible(supabase, ticket.id, {
          salutation: data.customer.salutation ?? "",
        });
      } catch (e) {
        console.error("confirmation delivery error:", (e as Error).message);
      }

      return json({
        success: true,
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        customer_id: customerId,
        status: "confirmed",
        payment_status: "paid",
        total_amount: ticket.total_amount,
        payment_reference: verifiedPaymentReference,
        delivery: { booking_confirmation: confirmationStatus },
      });
    }

    // invoice: binding immediately (B+ Phase 1). Not paid; exactly one open invoice.
    // Invoice first, then confirm; on failure the ticket stays retryable.
    const step = await issueInvoiceThenConfirm(supabase, {
      ticketId: ticket.id,
      customerId,
      total: ticket.total_amount,
      now,
    });
    if (!step.ok) {
      console.error("confirm-booking invoice step failed:", step.code, step.error);
      return json({
        success: false,
        code: step.code,
        error: "Die Buchung konnte gerade nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
        reservation_expires_at: ticket.reservation_expires_at,
      }, 503);
    }
    const invoice = step.invoice;

    // Booking confirmation for every invoice booking.
    let confirmationStatus = "failed";
    try {
      const d = await ensureConfirmationDelivery(supabase, ticket.id, data.customer.email);
      if (d) {
        confirmationStatus = d.status === "pending"
          ? await attemptConfirmation(supabase, d.id, { salutation: data.customer.salutation ?? "" })
          : d.status;
        if (confirmationStatus === "not_claimed") confirmationStatus = "sending";
      }
    } catch (e) {
      console.error("confirmation delivery error:", (e as Error).message);
    }

    // Invoice e-mail with the Swiss QR payment part (B+ Phase 2). A failure never
    // invalidates the binding booking; the office sees and can retry it.
    let invoiceStatus = "failed";
    try {
      const d = await ensureInvoiceDelivery(supabase, {
        invoiceId: invoice!.id,
        ticketId: ticket.id,
        email: data.customer.email,
      });
      if (d) {
        invoiceStatus = d.status === "pending" ? await attemptInvoiceDelivery(supabase, d.id) : d.status;
        if (invoiceStatus === "not_claimed") invoiceStatus = "sending";
      }
    } catch (e) {
      console.error("invoice delivery error:", (e as Error).message);
    }

    return json({
      success: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      customer_id: customerId,
      status: "confirmed",
      payment_status: "invoice_open",
      invoice_number: invoice!.invoice_number,
      due_date: invoice!.due_date,
      total_amount: ticket.total_amount,
      guest_message: GUEST_MESSAGE,
      delivery: { booking_confirmation: confirmationStatus, invoice: invoiceStatus },
    });
  } catch (e) {
    console.error("confirm-booking error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
