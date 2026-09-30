/**
 * Payment session bookkeeping for the B+ booking flow (B+ Phase 2).
 *
 * Responsibilities:
 *  - persist one checkout session per payment attempt (audit + reuse),
 *  - record every provider webhook exactly once (`payment_events`),
 *  - apply a successful payment idempotently to the ticket and `payments`,
 *  - verify an online payment server-side before `confirm-booking` accepts it.
 *
 * The client value `payment_reference` is never trusted: only a session that the
 * provider (or a verified webhook) marked as paid, with a matching amount and
 * currency, can confirm a booking.
 */
import {
  paymentIntentId,
  retrieveCheckoutSession,
  sessionAmountMatches,
  sessionIsPaid,
  toMinorUnits,
  type CheckoutSession,
  type FetchLike,
} from "./paymentProvider.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export type PaymentSessionStatus = "created" | "processing" | "succeeded" | "failed" | "expired" | "refunded";

/** How long a paid-but-not-finalised reservation stays alive (minutes). */
export const PAID_HOLD_MINUTES = 30;

export interface PaymentSessionRow {
  id: string;
  ticket_id: string;
  provider: string;
  provider_session_id: string;
  provider_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: PaymentSessionStatus;
  checkout_url: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  payment_id: string | null;
}

const nowIso = (d: Date) => d.toISOString();

export function isLiveSession(row: Pick<PaymentSessionRow, "status" | "expires_at">, now = new Date()): boolean {
  if (!["created", "processing"].includes(row.status)) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > now.getTime();
}

export async function findLiveSession(sb: Client, ticketId: string, now = new Date()) {
  const { data } = await sb
    .from("payment_sessions")
    .select("*")
    .eq("ticket_id", ticketId)
    .in("status", ["created", "processing"])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data?.[0] ?? null) as PaymentSessionRow | null;
  return row && isLiveSession(row, now) ? row : null;
}

export async function storeSession(
  sb: Client,
  input: {
    ticketId: string;
    session: CheckoutSession;
    amount: number;
    currency: string;
    expiresAt: Date;
    provider?: string;
  },
) {
  const { data, error } = await sb
    .from("payment_sessions")
    .upsert(
      {
        ticket_id: input.ticketId,
        provider: input.provider ?? "stripe",
        provider_session_id: input.session.id,
        provider_payment_intent_id: paymentIntentId(input.session),
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        status: "created",
        checkout_url: input.session.url ?? null,
        expires_at: nowIso(input.expiresAt),
        metadata: { source: "create-payment-session" },
      },
      { onConflict: "provider_session_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) return { ok: false as const, error_code: "session_store_failed", error: error.message };
  if (data) return { ok: true as const, session: data as PaymentSessionRow };
  // The upsert was a no-op (the session already existed) -> re-read it.
  const { data: existing } = await sb
    .from("payment_sessions")
    .select("*")
    .eq("provider_session_id", input.session.id)
    .maybeSingle();
  return { ok: true as const, session: (existing ?? null) as PaymentSessionRow | null };
}

export async function markSessionStatus(
  sb: Client,
  providerSessionId: string,
  status: PaymentSessionStatus,
  extra: Record<string, unknown> = {},
) {
  await sb
    .from("payment_sessions")
    .update({ status, updated_at: nowIso(new Date()), ...extra })
    .eq("provider_session_id", providerSessionId);
}

/**
 * Records a webhook event exactly once. Returns duplicate=true when the event
 * was already stored, so the caller can answer 200 without side effects.
 */
export async function recordPaymentEvent(
  sb: Client,
  input: {
    eventId: string;
    eventType: string;
    // deno-lint-ignore no-explicit-any
    payload: any;
    ticketId?: string | null;
    providerSessionId?: string | null;
  },
) {
  const { data: inserted, error } = await sb
    .from("payment_events")
    .insert({
      provider: "stripe",
      provider_event_id: input.eventId,
      event_type: input.eventType,
      ticket_id: input.ticketId ?? null,
      provider_session_id: input.providerSessionId ?? null,
      payload: input.payload ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation => the event was already processed.
    if (String(error.code) === "23505" || /duplicate key/i.test(error.message ?? "")) {
      return { duplicate: true as const, id: null, error: null };
    }
    return { duplicate: false as const, id: null, error: error.message as string };
  }
  return { duplicate: false as const, id: (inserted?.id ?? null) as string | null, error: null };
}

export async function finishPaymentEvent(
  sb: Client,
  eventId: string,
  outcome: string,
  error?: string | null,
  links: { ticketId?: string | null; sessionRowId?: string | null } = {},
) {
  await sb
    .from("payment_events")
    .update({
      outcome,
      processing_error: error ? error.slice(0, 500) : null,
      ...(links.ticketId ? { ticket_id: links.ticketId } : {}),
      ...(links.sessionRowId ? { payment_session_id: links.sessionRowId } : {}),
      processed_at: nowIso(new Date()),
    })
    .eq("provider_event_id", eventId);
}

export interface ApplyPaidResult {
  applied: boolean;
  alreadyApplied: boolean;
  paymentId?: string | null;
  ticketStatus?: string | null;
  error?: string;
}

/**
 * Applies a paid provider session: records exactly one payment row, sets the
 * ticket to paid and either confirms it (customer data present) or keeps it
 * bookable by extending the hold of a paid reservation.
 */
export async function applyPaidSession(
  sb: Client,
  input: { ticketId: string; session: CheckoutSession; providerSessionId: string; now?: Date },
): Promise<ApplyPaidResult> {
  const now = input.now ?? new Date();

  const { data: row } = await sb
    .from("payment_sessions")
    .select("*")
    .eq("provider_session_id", input.providerSessionId)
    .maybeSingle();
  const existing = (row ?? null) as PaymentSessionRow | null;
  if (existing?.status === "succeeded" && existing.payment_id) {
    return { applied: false, alreadyApplied: true, paymentId: existing.payment_id, ticketStatus: null };
  }

  const { data: ticket } = await sb
    .from("tickets")
    .select("id, status, total_amount, paid_amount, customer_id, reservation_expires_at")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) return { applied: false, alreadyApplied: false, error: "ticket_unknown" };

  const intentId = paymentIntentId(input.session) ?? existing?.provider_payment_intent_id ?? null;
  const reference = intentId ?? input.providerSessionId;
  const amount = Number(ticket.total_amount ?? 0);

  // Never book a payment whose provider-side amount differs from the ticket.
  if (input.session.amount_total != null && Number(input.session.amount_total) !== toMinorUnits(amount)) {
    return { applied: false, alreadyApplied: false, error: "payment_amount_mismatch" };
  }

  const { data: existingPayment } = await sb
    .from("payments")
    .select("id")
    .eq("ticket_id", ticket.id)
    .eq("reference", reference)
    .maybeSingle();
  let paymentId: string | null = existingPayment?.id ?? null;
  if (!paymentId) {
    const { data: insertedPayment } = await sb
      .from("payments")
      .insert({
        ticket_id: ticket.id,
        amount,
        payment_method: "online",
        payment_date: nowIso(now).slice(0, 10),
        reference,
        status: "completed",
        notes: `Zahlungsprovider Session ${input.providerSessionId}`,
      })
      .select("id")
      .maybeSingle();
    paymentId = (insertedPayment?.id ?? null) as string | null;
  }

  const patch: Record<string, unknown> = {
    paid_amount: amount,
    payment_method: "online",
    updated_at: nowIso(now),
  };
  if (["provisional", "payment_pending"].includes(ticket.status ?? "")) {
    if (ticket.customer_id) {
      patch.status = "confirmed";
    } else {
      // Paid but not yet finalised: keep the paid reservation bookable.
      patch.status = "payment_pending";
      const hold = new Date(now);
      hold.setMinutes(hold.getMinutes() + PAID_HOLD_MINUTES);
      const currentExpiry = ticket.reservation_expires_at ? new Date(ticket.reservation_expires_at) : null;
      if (!currentExpiry || currentExpiry.getTime() < hold.getTime()) {
        patch.reservation_expires_at = nowIso(hold);
      }
    }
  }
  await sb.from("tickets").update(patch).eq("id", ticket.id);

  if (existing) {
    await sb
      .from("payment_sessions")
      .update({
        status: "succeeded",
        provider_payment_intent_id: intentId,
        payment_id: paymentId,
        amount,
        updated_at: nowIso(now),
      })
      .eq("id", existing.id);
  } else {
    await sb.from("payment_sessions").insert({
      ticket_id: ticket.id,
      provider: "stripe",
      provider_session_id: input.providerSessionId,
      provider_payment_intent_id: intentId,
      amount,
      currency: (input.session.currency ?? "CHF").toUpperCase(),
      status: "succeeded",
      payment_id: paymentId,
      metadata: { source: "applyPaidSession" },
    });
  }

  await sb.from("ticket_history").insert({
    ticket_id: ticket.id,
    event_type: "payment_succeeded",
    details: {
      provider: "stripe",
      provider_session_id: input.providerSessionId,
      provider_payment_intent_id: intentId,
      amount,
      currency: (input.session.currency ?? "CHF").toUpperCase(),
      resulting_ticket_status: patch.status ?? ticket.status,
    },
  });

  return {
    applied: true,
    alreadyApplied: false,
    paymentId,
    ticketStatus: (patch.status as string) ?? ticket.status,
  };
}

export interface OnlineVerification {
  ok: boolean;
  code?: string;
  error?: string;
  sessionRow?: PaymentSessionRow | null;
  providerSession?: CheckoutSession | null;
}

/**
 * Server-side verification of an online payment before the booking is confirmed.
 * Prefers the stored (webhook-verified) state and falls back to an authoritative
 * provider lookup, so a delayed webhook never blocks a paying customer.
 */
export async function verifyOnlinePayment(
  sb: Client,
  input: { ticketId: string; sessionId: string; fetchImpl?: FetchLike; now?: Date },
): Promise<OnlineVerification> {
  const { data: rowData } = await sb
    .from("payment_sessions")
    .select("*")
    .eq("provider_session_id", input.sessionId)
    .maybeSingle();
  const row = (rowData ?? null) as PaymentSessionRow | null;
  if (!row) return { ok: false, code: "payment_session_unknown", error: "Zahlung ist nicht bekannt." };
  if (row.ticket_id !== input.ticketId) {
    return { ok: false, code: "payment_session_mismatch", error: "Zahlung gehört nicht zu dieser Buchung." };
  }

  const { data: ticket } = await sb
    .from("tickets")
    .select("id, total_amount, payment_method")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) return { ok: false, code: "ticket_unknown" };

  const verifyLocally = (): OnlineVerification => {
    if (toMinorUnits(Number(ticket.total_amount ?? 0)) !== toMinorUnits(Number(row.amount ?? 0))) {
      return { ok: false, code: "payment_amount_mismatch", error: "Zahlbetrag stimmt nicht mit der Buchung überein." };
    }
    return { ok: true, sessionRow: row };
  };

  if (row.status === "refunded") {
    return { ok: false, code: "payment_refunded", error: "Die Zahlung wurde zurückerstattet." };
  }
  if (row.status === "succeeded") return verifyLocally();

  const res = await retrieveCheckoutSession(input.sessionId, input.fetchImpl);
  if (!res.ok) {
    return { ok: false, code: res.error_code ?? "provider_error", error: res.error };
  }
  const session = res.data!;
  if (!sessionIsPaid(session)) {
    return { ok: false, code: "payment_not_completed", error: "Die Zahlung ist noch nicht abgeschlossen." };
  }
  if (!sessionAmountMatches(session, Number(ticket.total_amount ?? 0), row.currency)) {
    return { ok: false, code: "payment_amount_mismatch", error: "Zahlbetrag stimmt nicht mit der Buchung überein." };
  }

  await applyPaidSession(sb, { ticketId: input.ticketId, session, providerSessionId: input.sessionId, now: input.now });
  const { data: refreshed } = await sb
    .from("payment_sessions")
    .select("*")
    .eq("provider_session_id", input.sessionId)
    .maybeSingle();
  return { ok: true, sessionRow: (refreshed ?? row) as PaymentSessionRow, providerSession: session };
}
