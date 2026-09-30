/**
 * Payment provider adapter (B+ Phase 2).
 *
 * Deliberately dependency-free and fetch-based so it runs unchanged in Edge
 * Functions and in unit tests. Everything here is either a pure function or a
 * thin HTTP call; database state is handled in `paymentSessions.ts`.
 *
 * Fail closed: without STRIPE_SECRET_KEY no checkout can be created and without
 * STRIPE_WEBHOOK_SECRET no webhook is ever trusted.
 */

export const STRIPE_API = "https://api.stripe.com/v1";
/** Reject events whose signed timestamp is older than this (replay protection). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function providerSecret(): string | null {
  return Deno.env.get("STRIPE_SECRET_KEY") ?? null;
}

export function webhookSecret(): string | null {
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null;
}

export function providerConfigured(): boolean {
  return !!providerSecret();
}

/** Stripe expects the smallest currency unit (Rappen/Cents). */
export function toMinorUnits(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function fromMinorUnits(minor: number): number {
  return Number(minor) / 100;
}

export interface CheckoutSessionInput {
  ticketId: string;
  amount: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  /** Reservation holds must survive the payment attempt. */
  expiresAt: Date;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  status: string | null;
  payment_status: string | null;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | { id?: string } | null;
  client_reference_id: string | null;
  expires_at: number | null;
  metadata?: Record<string, string> | null;
}

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error_code?: string;
  error?: string;
}

function toForm(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.append(key, String(value));
  }
  return search.toString();
}

async function stripeRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: string },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderResult<T>> {
  const secret = providerSecret();
  if (!secret) {
    return {
      ok: false,
      error_code: "payment_provider_not_configured",
      error: "Zahlungsprovider ist nicht konfiguriert (STRIPE_SECRET_KEY fehlt).",
    };
  }
  try {
    const res = await fetchImpl(`${STRIPE_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: init.body,
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return {
        ok: false,
        error_code: "provider_error",
        error: String(parsed?.error?.message ?? res.status),
      };
    }
    return { ok: true, data: parsed as T };
  } catch (e) {
    return { ok: false, error_code: "provider_unreachable", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Creates a hosted checkout session. The amount is always server-derived. */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderResult<CheckoutSession>> {
  const body = toForm({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": toMinorUnits(input.amount),
    "line_items[0][price_data][product_data][name]": input.productName,
    client_reference_id: input.ticketId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    "metadata[ticket_id]": input.ticketId,
    "payment_intent_data[metadata][ticket_id]": input.ticketId,
    ...Object.fromEntries(Object.entries(input.metadata ?? {}).map(([k, v]) => [`metadata[${k}]`, v])),
  });
  return await stripeRequest<CheckoutSession>("/checkout/sessions", { method: "POST", body }, fetchImpl);
}

/** Authoritative server-side re-read of a session (webhook fallback/verification). */
export async function retrieveCheckoutSession(
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderResult<CheckoutSession>> {
  return await stripeRequest<CheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
    fetchImpl,
  );
}

export interface StripeEvent {
  id: string;
  type: string;
  // deno-lint-ignore no-explicit-any
  data: { object: any };
}

export function parseStripeEvent(rawBody: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed?.id || !parsed?.type || !parsed?.data?.object) return null;
    return parsed as StripeEvent;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies the `Stripe-Signature` header (scheme `t=<ts>,v1=<hmac>`).
 * Returns ok=false for a missing header, a bad MAC or a timestamp outside the
 * tolerance window, so a replayed or forged event can never be processed.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string | null,
  nowMs: number = Date.now(),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): Promise<{ ok: boolean; error?: string }> {
  if (!secret) return { ok: false, error: "webhook_secret_missing" };
  if (!header) return { ok: false, error: "signature_missing" };

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || Number.isNaN(timestamp)) return { ok: false, error: "signature_malformed" };
  if (signatures.length === 0) return { ok: false, error: "signature_malformed" };

  const ageSeconds = Math.abs(nowMs / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) return { ok: false, error: "signature_timestamp_out_of_tolerance" };

  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  const match = signatures.some((candidate) => timingSafeEqual(candidate, expected));
  return match ? { ok: true } : { ok: false, error: "signature_mismatch" };
}

export function paymentIntentId(session: CheckoutSession | null | undefined): string | null {
  if (!session?.payment_intent) return null;
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id ?? null;
}

/** A session counts as paid only when the provider says the money arrived. */
export function sessionIsPaid(session: CheckoutSession | null | undefined): boolean {
  if (!session) return false;
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") return true;
  return session.status === "complete" && session.payment_status === "paid";
}

/** Amount and currency of the session must equal the ticket values exactly. */
export function sessionAmountMatches(
  session: CheckoutSession | null | undefined,
  expectedTotal: number,
  expectedCurrency: string,
): boolean {
  if (!session) return false;
  if ((session.currency ?? "").toUpperCase() !== expectedCurrency.toUpperCase()) return false;
  if (session.amount_total === null || session.amount_total === undefined) return false;
  return Number(session.amount_total) === toMinorUnits(expectedTotal);
}