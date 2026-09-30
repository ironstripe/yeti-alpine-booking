// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/paymentProvider.test.ts
// Provider adapter: pure helpers, signature verification and a stubbed HTTP API.
import {
  createCheckoutSession,
  fromMinorUnits,
  parseStripeEvent,
  providerConfigured,
  retrieveCheckoutSession,
  sessionAmountMatches,
  sessionIsPaid,
  toMinorUnits,
  verifyStripeSignature,
  type CheckoutSession,
} from "./paymentProvider.ts";

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

const SECRET = "whsec_test_secret";
const KEY = "sk_test_dummy";
const encoder = new TextEncoder();

async function sign(payload: string, timestamp: number, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function session(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    id: "cs_test_1",
    url: "https://checkout.stripe.test/cs_test_1",
    status: "complete",
    payment_status: "paid",
    amount_total: 125050,
    currency: "chf",
    payment_intent: "pi_test_1",
    client_reference_id: "t1",
    expires_at: 1800000000,
    metadata: { ticket_id: "t1" },
    ...overrides,
  };
}

Deno.test("minor units convert without rounding drift", () => {
  eq(toMinorUnits(1250.5), 125050);
  eq(toMinorUnits(0.01), 1);
  eq(toMinorUnits(19.999), 2000);
  eq(fromMinorUnits(125050), 1250.5);
});

Deno.test("a session only counts as paid when the provider says so", () => {
  eq(sessionIsPaid(session()), true);
  eq(sessionIsPaid(session({ payment_status: "no_payment_required" })), true);
  eq(sessionIsPaid(session({ payment_status: "unpaid" })), false);
  eq(sessionIsPaid(session({ status: "open", payment_status: "unpaid" })), false);
  eq(sessionIsPaid(null), false);
});

Deno.test("amount and currency must match the ticket exactly", () => {
  eq(sessionAmountMatches(session(), 1250.5, "CHF"), true);
  eq(sessionAmountMatches(session(), 1250.5, "EUR"), false);
  eq(sessionAmountMatches(session(), 1250.4, "CHF"), false);
  eq(sessionAmountMatches(session({ amount_total: null }), 1250.5, "CHF"), false);
  eq(sessionAmountMatches(null, 1250.5, "CHF"), false);
});

Deno.test("valid signature is accepted, unknown secret is not", async () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}';
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await sign(body, timestamp)}`;
  eq((await verifyStripeSignature(body, header, SECRET)).ok, true);

  const wrong = `t=${timestamp},v1=${await sign(body, timestamp, "whsec_other")}`;
  eq((await verifyStripeSignature(body, wrong, SECRET)).ok, false);
});

Deno.test("tampered payload, missing header and old timestamps are rejected", async () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}';
  const timestamp = Math.floor(Date.now() / 1000);
  const valid = await sign(body, timestamp);

  eq((await verifyStripeSignature(`${body} `, `t=${timestamp},v1=${valid}`, SECRET)).ok, false);
  eq((await verifyStripeSignature(body, null, SECRET)).ok, false);
  eq((await verifyStripeSignature(body, "garbage", SECRET)).ok, false);
  eq((await verifyStripeSignature(body, `t=abc,v1=${valid}`, SECRET)).ok, false);
  eq((await verifyStripeSignature(body, `t=${timestamp}`, SECRET)).ok, false);
  eq((await verifyStripeSignature(body, `t=${timestamp},v1=${valid}`, null)).ok, false);

  const old = timestamp - 900;
  const stale = await sign(body, old);
  eq((await verifyStripeSignature(body, `t=${old},v1=${stale}`, SECRET)).ok, false);
});

Deno.test("one valid signature among several is enough (key rotation)", async () => {
  const body = '{"id":"evt_2","type":"checkout.session.completed","data":{"object":{}}}';
  const timestamp = Math.floor(Date.now() / 1000);
  const good = await sign(body, timestamp);
  const header = `t=${timestamp},v1=deadbeef,v1=${good}`;
  eq((await verifyStripeSignature(body, header, SECRET)).ok, true);
});

Deno.test("event payload parsing rejects incomplete payloads", () => {
  const ok = parseStripeEvent('{"id":"evt_3","type":"payment_intent.succeeded","data":{"object":{"id":"pi_1"}}}');
  eq(ok?.type, "payment_intent.succeeded");
  eq(parseStripeEvent("not json"), null);
  eq(parseStripeEvent('{"id":"evt_3"}'), null);
  eq(parseStripeEvent('{"id":"evt_3","type":"x"}'), null);
});

Deno.test("checkout creation sends server-side amount and ticket metadata", async () => {
  Deno.env.set("STRIPE_SECRET_KEY", KEY);
  const calls: { url: string; body: string; headers: Headers }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: String(init.body), headers: new Headers(init.headers) });
    return new Response(JSON.stringify(session({ status: "open", payment_status: "unpaid" })), { status: 200 });
  }) as typeof fetch;

  const result = await createCheckoutSession(
    {
      ticketId: "t1",
      amount: 1250.5,
      currency: "CHF",
      productName: "Buchung T-100",
      successUrl: "https://yeti.example.test/ok",
      cancelUrl: "https://yeti.example.test/cancel",
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: { ticket_number: "T-100" },
    },
    fakeFetch,
  );

  eq(result.ok, true);
  eq(calls.length, 1);
  eq(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  const params = new URLSearchParams(calls[0].body);
  eq(params.get("mode"), "payment");
  eq(params.get("line_items[0][price_data][unit_amount]"), "125050");
  eq(params.get("line_items[0][price_data][currency]"), "chf");
  eq(params.get("client_reference_id"), "t1");
  eq(params.get("metadata[ticket_id]"), "t1");
  eq(params.get("metadata[ticket_number]"), "T-100");
  eq(params.get("success_url"), "https://yeti.example.test/ok");
  if (!calls[0].headers.get("Authorization")?.startsWith("Bearer ")) throw new Error("missing bearer key");
});

Deno.test("provider failures are surfaced, not swallowed", async () => {
  Deno.env.set("STRIPE_SECRET_KEY", KEY);
  const failing = (async () =>
    new Response(JSON.stringify({ error: { message: "card declined at provider" } }), { status: 402 })) as typeof fetch;
  const result = await retrieveCheckoutSession("cs_test_1", failing);
  eq(result.ok, false);
  eq(result.error_code, "provider_error");
  eq(result.error, "card declined at provider");
});

Deno.test("without a secret key every provider call fails closed", async () => {
  Deno.env.delete("STRIPE_SECRET_KEY");
  eq(providerConfigured(), false);
  const result = await createCheckoutSession({
    ticketId: "t1",
    amount: 10,
    currency: "CHF",
    productName: "x",
    successUrl: "https://yeti.example.test/ok",
    cancelUrl: "https://yeti.example.test/cancel",
    expiresAt: new Date(Date.now() + 3600_000),
  });
  eq(result.ok, false);
  eq(result.error_code, "payment_provider_not_configured");
  Deno.env.set("STRIPE_SECRET_KEY", KEY);
});