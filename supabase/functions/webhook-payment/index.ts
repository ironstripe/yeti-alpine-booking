// Provider webhook for online payments (B+ Phase 2).
//
// Authentication is the provider signature: the endpoint runs with
// verify_jwt = false because Stripe cannot send a Supabase JWT, and it fails
// closed (503) when STRIPE_WEBHOOK_SECRET is not configured. Forged, replayed
// or stale signatures are rejected with 400 and never touch the database.
//
// Every event is stored exactly once in `payment_events`; duplicates answer 200
// without side effects. A payment that the provider reports as paid is applied
// idempotently (one payment row, ticket marked paid) and, when the booking is
// already finalised, the booking confirmation e-mail is sent.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseStripeEvent,
  paymentIntentId,
  sessionIsPaid,
  verifyStripeSignature,
  webhookSecret,
  type CheckoutSession,
} from "../_shared/paymentProvider.ts";
import {
  applyPaidSession,
  finishPaymentEvent,
  markSessionStatus,
  recordPaymentEvent,
} from "../_shared/paymentSessions.ts";
import { sendConfirmationIfPossible } from "../_shared/bookingDelivery.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type EventObject = any;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = webhookSecret();
  if (!secret) {
    console.error("webhook-payment: STRIPE_WEBHOOK_SECRET is not configured");
    return json({ error: "webhook_not_configured" }, 503);
  }

  const raw = await req.text();
  const signatureCheck = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!signatureCheck.ok) {
    console.error("webhook-payment: signature rejected:", signatureCheck.error);
    return json({ error: signatureCheck.error }, 400);
  }

  const event = parseStripeEvent(raw);
  if (!event) return json({ error: "invalid_payload" }, 400);

  const object = event.data.object as EventObject;
  const providerSessionId: string | null =
    typeof object?.object === "string" && object.object.startsWith("checkout.session")
      ? object.id ?? null
      : null;
  const ticketIdFromMetadata: string | null = object?.metadata?.ticket_id ?? null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency first: an event is only ever applied once.
  const recorded = await recordPaymentEvent(supabase, {
    eventId: event.id,
    eventType: event.type,
    payload: { id: event.id, type: event.type, object },
    ticketId: ticketIdFromMetadata,
    providerSessionId,
  });
  if (recorded.error) {
    console.error("webhook-payment: event store failed:", recorded.error);
    return json({ error: "event_store_failed" }, 500);
  }
  if (recorded.duplicate) return json({ received: true, duplicate: true });

  try {
    const outcome = await handleEvent(supabase, event.type, object);
    await finishPaymentEvent(supabase, event.id, outcome.outcome, outcome.error ?? null, {
      ticketId: outcome.ticketId ?? null,
      sessionRowId: outcome.sessionRowId ?? null,
    });
    return json({ received: true, outcome: outcome.outcome });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("webhook-payment: processing failed:", message);
    await finishPaymentEvent(supabase, event.id, "error", message);
    // 500 lets the provider retry; the event row stays for diagnosis.
    return json({ error: "processing_failed" }, 500);
  }
});

/**
 * Turns one provider event into a domain outcome. Returns a short outcome code
 * that is stored on the event row for auditing.
 */
async function handleEvent(
  // deno-lint-ignore no-explicit-any
  sb: any,
  type: string,
  object: EventObject,
): Promise<{ outcome: string; ticketId?: string | null; sessionRowId?: string | null; error?: string }> {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = object as CheckoutSession;
      const ticketId = session.metadata?.ticket_id ?? session.client_reference_id ?? null;
      if (!ticketId) return { outcome: "skipped_no_ticket" };
      if (!sessionIsPaid(session)) return { outcome: "pending_payment", ticketId };
      const applied = await applyPaidSession(sb, {
        ticketId,
        session,
        providerSessionId: session.id,
      });
      if (applied.error) return { outcome: "error", ticketId, error: applied.error };
      const sent = await sendConfirmationAfterPayment(sb, ticketId, applied.ticketStatus ?? null);
      return {
        outcome: applied.alreadyApplied ? "already_applied" : `paid:${sent}`,
        ticketId,
      };
    }

    case "payment_intent.succeeded": {
      // Fallback for providers/accounts where the session event is delayed.
      const intentId = object?.id ?? null;
      const ticketId = object?.metadata?.ticket_id ?? null;
      if (!intentId) return { outcome: "skipped_no_intent" };
      const { data: row } = await sb
        .from("payment_sessions")
        .select("id, ticket_id, provider_session_id")
        .eq("provider_payment_intent_id", intentId)
        .maybeSingle();
      if (!row) return { outcome: "skipped_unknown_intent", ticketId };
      const applied = await applyPaidSession(sb, {
        ticketId: row.ticket_id,
        session: {
          id: row.provider_session_id,
          url: null,
          status: "complete",
          payment_status: "paid",
          amount_total: Number(object?.amount ?? 0),
          currency: String(object?.currency ?? "").toUpperCase(),
          payment_intent: intentId,
          client_reference_id: row.ticket_id,
          expires_at: null,
        },
        providerSessionId: row.provider_session_id,
      });
      const sent = await sendConfirmationAfterPayment(sb, row.ticket_id, applied.ticketStatus ?? null);
      return {
        outcome: applied.alreadyApplied ? "already_applied" : `paid:${sent}`,
        ticketId: row.ticket_id,
        sessionRowId: row.id,
      };
    }

    case "checkout.session.expired": {
      const session = object as CheckoutSession;
      const ticketId = session.metadata?.ticket_id ?? session.client_reference_id ?? null;
      await markSessionStatus(sb, session.id, "expired");
      return { outcome: "session_expired", ticketId };
    }

    case "payment_intent.payment_failed": {
      const intentId = object?.id ?? null;
      const ticketId = object?.metadata?.ticket_id ?? null;
      if (intentId) {
        await sb
          .from("payment_sessions")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
            metadata: { last_error: String(object?.last_payment_error?.message ?? "payment_failed") },
          })
          .eq("provider_payment_intent_id", intentId);
      }
      return { outcome: "payment_failed", ticketId };
    }

    case "charge.refunded": {
      const intentId = paymentIntentId({ payment_intent: object?.payment_intent ?? null } as CheckoutSession);
      if (!intentId) return { outcome: "skipped_no_intent" };
      const { data: row } = await sb
        .from("payment_sessions")
        .select("id, ticket_id, payment_id")
        .eq("provider_payment_intent_id", intentId)
        .maybeSingle();
      if (!row) return { outcome: "skipped_unknown_intent" };
      await markSessionStatus(sb, row.provider_session_id, "refunded");
      if (row.payment_id) {
        await sb.from("payments").update({ status: "refunded" }).eq("id", row.payment_id);
      }
      await sb.from("ticket_history").insert({
        ticket_id: row.ticket_id,
        event_type: "payment_refunded",
        details: { provider: "stripe", provider_payment_intent_id: intentId },
      });
      return { outcome: "refunded", ticketId: row.ticket_id, sessionRowId: row.id };
    }

    default:
      return { outcome: "ignored" };
  }
}

/** Booking confirmation after a verified payment, only for finalised bookings. */
async function sendConfirmationAfterPayment(
  // deno-lint-ignore no-explicit-any
  sb: any,
  ticketId: string,
  ticketStatus: string | null,
): Promise<string> {
  if (ticketStatus !== "confirmed") return "awaiting_finalisation";
  try {
    return await sendConfirmationIfPossible(sb, ticketId);
  } catch (e) {
    console.error("webhook-payment: confirmation e-mail failed:", (e as Error).message);
    return "email_failed";
  }
}