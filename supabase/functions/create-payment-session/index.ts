// Public endpoint (x-api-key protected): opens a hosted checkout for a held
// reservation in the B+ website flow.
//
// Rules enforced server-side:
//  - the reservation token must match and the hold must still be valid,
//  - the amount is always the stored ticket total (never a caller value),
//  - the return URLs must belong to an allow-listed website origin,
//  - the reservation hold is extended so a paying guest never loses the slot,
//  - one live session per ticket is reused instead of creating duplicates.
//
// Requires STRIPE_SECRET_KEY and YETI_ALLOWED_REDIRECT_ORIGINS; without them the
// endpoint fails closed instead of creating an unverifiable payment.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";
import { createCheckoutSession, providerConfigured } from "../_shared/paymentProvider.ts";
import { findLiveSession, storeSession } from "../_shared/paymentSessions.ts";

/** Checkout window: Stripe allows 30 minutes to 24 hours. */
const MIN_WINDOW_MINUTES = 30;
const MAX_WINDOW_MINUTES = 24 * 60;

const Payload = z.object({
  ticket_id: z.string().uuid(),
  reservation_token: z.string().min(8).max(128),
  success_url: z.string().url().max(2000),
  cancel_url: z.string().url().max(2000),
  description: z.string().trim().max(120).optional(),
});

function allowedOrigins(): string[] {
  return (Deno.env.get("YETI_ALLOWED_REDIRECT_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = Payload.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const data = parsed.data;

  if (!providerConfigured()) {
    console.error("create-payment-session: STRIPE_SECRET_KEY is not configured");
    return json({ success: false, code: "payment_provider_not_configured", error: "Zahlungsprovider ist nicht konfiguriert." }, 503);
  }

  const origins = allowedOrigins();
  if (origins.length === 0) {
    console.error("create-payment-session: YETI_ALLOWED_REDIRECT_ORIGINS is not configured");
    return json({ success: false, code: "payment_redirect_not_configured", error: "Rückleitungs-Adressen sind nicht konfiguriert." }, 503);
  }
  for (const url of [data.success_url, data.cancel_url]) {
    const origin = originOf(url);
    if (!origin || !origins.includes(origin)) {
      return json({ success: false, code: "redirect_not_allowed", error: "Rückleitungs-Adresse ist nicht erlaubt." }, 400);
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, ticket_number, status, total_amount, currency, reservation_token, reservation_expires_at")
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (!ticket || ticket.reservation_token !== data.reservation_token) {
      return json({ success: false, error: "Reservation not found" }, 404);
    }
    if (!["provisional", "payment_pending"].includes(ticket.status ?? "")) {
      return json({ success: false, code: "invalid_status", error: `Buchung kann im Status "${ticket.status}" nicht bezahlt werden.` }, 409);
    }

    const now = new Date();
    const expires = ticket.reservation_expires_at ? new Date(ticket.reservation_expires_at) : null;
    if (expires && expires.getTime() <= now.getTime()) {
      return json({ success: false, code: "expired", error: "Die Reservierung ist abgelaufen. Bitte buchen Sie erneut." }, 410);
    }

    const amount = Number(ticket.total_amount ?? 0);
    if (!(amount > 0)) {
      return json({ success: false, code: "amount_invalid", error: "Für diese Buchung ist kein Betrag hinterlegt." }, 409);
    }
    const currency = (ticket.currency ?? "CHF").toUpperCase();

    // The hold must cover the whole checkout window.
    const windowEnd = new Date(now.getTime() + MIN_WINDOW_MINUTES * 60 * 1000);
    const holdUntil = expires && expires.getTime() > windowEnd.getTime() ? expires : windowEnd;
    const limitedUntil = new Date(Math.min(holdUntil.getTime(), now.getTime() + MAX_WINDOW_MINUTES * 60 * 1000));

    // Reuse a live session instead of opening a second one for the same booking.
    const live = await findLiveSession(supabase, ticket.id, now);
    if (live?.checkout_url && live.expires_at && new Date(live.expires_at).getTime() > now.getTime()) {
      return json({
        success: true,
        reused: true,
        session_id: live.provider_session_id,
        checkout_url: live.checkout_url,
        amount: Number(live.amount),
        currency: live.currency,
        expires_at: live.expires_at,
      });
    }

    // Stale sessions must be closed first: at most one open session per booking
    // is allowed (partial unique index), and the audit trail keeps them.
    await supabase
      .from("payment_sessions")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("ticket_id", ticket.id)
      .in("status", ["created", "processing"])
      .lt("expires_at", now.toISOString());

    const created = await createCheckoutSession({
      ticketId: ticket.id,
      amount,
      currency,
      productName: data.description?.trim() || `Buchung ${ticket.ticket_number}`,
      successUrl: data.success_url,
      cancelUrl: data.cancel_url,
      expiresAt: limitedUntil,
      metadata: { ticket_number: ticket.ticket_number ?? "" },
    });
    if (!created.ok || !created.data) {
      return json({ success: false, code: created.error_code ?? "provider_error", error: created.error }, 502);
    }
    if (!created.data.url) {
      return json({ success: false, code: "provider_error", error: "Der Zahlungsdienst hat keine Zahlungsseite geliefert." }, 502);
    }

    const stored = await storeSession(supabase, {
      ticketId: ticket.id,
      session: created.data,
      amount,
      currency,
      expiresAt: limitedUntil,
    });
    if (!stored.ok) console.error("create-payment-session store failed:", stored.error);

    // Keep the paid reservation bookable even if the guest needs longer.
    if (limitedUntil.getTime() > (expires?.getTime() ?? 0)) {
      await supabase
        .from("tickets")
        .update({ reservation_expires_at: limitedUntil.toISOString(), updated_at: now.toISOString() })
        .eq("id", ticket.id);
    }

    return json({
      success: true,
      reused: false,
      session_id: created.data.id,
      checkout_url: created.data.url,
      amount,
      currency,
      expires_at: limitedUntil.toISOString(),
      reservation_expires_at: limitedUntil.toISOString(),
    });
  } catch (e) {
    console.error("create-payment-session error:", (e as Error).message);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
