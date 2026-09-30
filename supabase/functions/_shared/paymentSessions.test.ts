// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/paymentSessions.test.ts
// Provider HTTP and the database are faked: no real payment, no real data.
import {
  applyPaidSession,
  findLiveSession,
  isLiveSession,
  recordPaymentEvent,
  verifyOnlinePayment,
  type PaymentSessionRow,
} from "./paymentSessions.ts";
import type { CheckoutSession } from "./paymentProvider.ts";

// The provider lookup path needs a configured secret; the HTTP calls are faked.
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy");

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Minimal in-memory table store that supports the chains used by the module. */
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    let limit = Infinity;
    const matches = () => tables[name].filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (op === "insert") return inserted;
      const rows = matches().slice(0, limit);
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      return rows;
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      not: () => b,
      order: () => b,
      limit: (n: number) => ((limit = n), b),
      update: (p: Row) => ((op = "update"), (patch = p), b),
      insert: (p: Row) => {
        if (name === "payment_events") {
          if (tables[name].some((r) => r.provider_event_id === p.provider_event_id)) {
            return {
              select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate key value" } }) }),
              then: (res: (v: unknown) => unknown) => res({ data: null, error: { code: "23505", message: "duplicate" } }),
            } as any;
          }
        }
        op = "insert";
        inserted = [{ id: `${name}-${++seq}`, ...p }];
        tables[name].push(...inserted);
        return b;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
    };
    return b;
  };
  return { from };
}

const paidSession = (overrides: Partial<CheckoutSession> = {}): CheckoutSession => ({
  id: "cs_1",
  url: "https://checkout.test/cs_1",
  status: "complete",
  payment_status: "paid",
  amount_total: 20000,
  currency: "chf",
  payment_intent: "pi_1",
  client_reference_id: "t1",
  expires_at: null,
  metadata: { ticket_id: "t1" },
  ...overrides,
});

function setup(ticketExtra: Row = {}, sessionExtra: Row = {}) {
  const tables: Record<string, Row[]> = {
    tickets: [
      { id: "t1", status: "provisional", total_amount: 200, paid_amount: 0, customer_id: null, reservation_expires_at: null, ...ticketExtra },
    ],
    payment_sessions: [
      {
        id: "ps1",
        ticket_id: "t1",
        provider: "stripe",
        provider_session_id: "cs_1",
        provider_payment_intent_id: "pi_1",
        amount: 200,
        currency: "CHF",
        status: "created",
        checkout_url: "https://checkout.test/cs_1",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        payment_id: null,
        ...sessionExtra,
      },
    ],
    payments: [],
    ticket_history: [],
    payment_events: [],
  };
  return { tables, sb: fakeDb(tables) };
}

Deno.test("only unexpired open sessions count as live", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const row = (status: string, expires: string | null): Pick<PaymentSessionRow, "status" | "expires_at"> =>
    ({ status: status as PaymentSessionRow["status"], expires_at: expires });
  eq(isLiveSession(row("created", "2026-10-01T12:30:00Z"), now), true);
  eq(isLiveSession(row("created", "2026-10-01T11:30:00Z"), now), false);
  eq(isLiveSession(row("succeeded", null), now), false);
});

Deno.test("live session lookup ignores finished and stale rows", async () => {
  const { sb } = setup();
  const live = await findLiveSession(sb, "t1");
  eq(live?.provider_session_id, "cs_1");

  const stale = setup({}, { expires_at: new Date(Date.now() - 60_000).toISOString() });
  eq(await findLiveSession(stale.sb, "t1"), null);
});

Deno.test("a paid session books exactly one payment and keeps the hold", async () => {
  const { sb, tables } = setup();
  const first = await applyPaidSession(sb, { ticketId: "t1", session: paidSession(), providerSessionId: "cs_1" });
  eq(first.applied, true);
  eq(first.ticketStatus, "payment_pending");
  eq(tables.payments.length, 1);
  eq(tables.payments[0].reference, "pi_1");
  eq(tables.payments[0].amount, 200);
  eq(tables.tickets[0].paid_amount, 200);
  eq(tables.tickets[0].payment_method, "online");
  eq(tables.tickets[0].status, "payment_pending");
  eq(tables.payment_sessions[0].status, "succeeded");
  eq(tables.payment_sessions[0].payment_id, "payments-1");
  if (!tables.tickets[0].reservation_expires_at) throw new Error("hold was not extended");
  eq(tables.ticket_history[0].event_type, "payment_succeeded");

  // Replaying the same session (webhook + confirm) must not book twice.
  const second = await applyPaidSession(sb, { ticketId: "t1", session: paidSession(), providerSessionId: "cs_1" });
  eq(second.alreadyApplied, true);
  eq(tables.payments.length, 1);
});

Deno.test("a finalised booking is confirmed by the paid session", async () => {
  const { sb, tables } = setup({ customer_id: "c1", status: "provisional" });
  const result = await applyPaidSession(sb, { ticketId: "t1", session: paidSession(), providerSessionId: "cs_1" });
  eq(result.ticketStatus, "confirmed");
  eq(tables.tickets[0].status, "confirmed");
  eq(tables.tickets[0].reservation_expires_at, null);
});

Deno.test("a session with a different amount is never booked", async () => {
  const { sb, tables } = setup();
  const result = await applyPaidSession(sb, {
    ticketId: "t1",
    session: paidSession({ amount_total: 10000 }),
    providerSessionId: "cs_1",
  });
  eq(result.applied, false);
  eq(result.error, "payment_amount_mismatch");
  eq(tables.payments.length, 0);
  eq(tables.tickets[0].paid_amount, 0);
});

Deno.test("an unknown ticket is reported, not silently ignored", async () => {
  const { sb } = setup();
  const result = await applyPaidSession(sb, { ticketId: "nope", session: paidSession(), providerSessionId: "cs_1" });
  eq(result.applied, false);
  eq(result.error, "ticket_unknown");
});

Deno.test("webhook events are stored once", async () => {
  const { sb, tables } = setup();
  const first = await recordPaymentEvent(sb, { eventId: "evt_1", eventType: "checkout.session.completed", payload: { a: 1 } });
  eq(first.duplicate, false);
  const second = await recordPaymentEvent(sb, { eventId: "evt_1", eventType: "checkout.session.completed", payload: { a: 1 } });
  eq(second.duplicate, true);
  eq(tables.payment_events.length, 1);
});

Deno.test("verification accepts a locally verified session with matching amount", async () => {
  const { sb } = setup({}, { status: "succeeded", payment_id: "payments-1" });
  let providerCalls = 0;
  const fakeFetch = (async () => {
    providerCalls++;
    return new Response(JSON.stringify(paidSession()), { status: 200 });
  }) as typeof fetch;
  const result = await verifyOnlinePayment(sb, { ticketId: "t1", sessionId: "cs_1", fetchImpl: fakeFetch });
  eq(result.ok, true);
  eq(providerCalls, 0);
});

Deno.test("verification refuses an unknown, foreign or unpaid session", async () => {
  const unknown = await verifyOnlinePayment(setup().sb, { ticketId: "t1", sessionId: "cs_missing" });
  eq(unknown.code, "payment_session_unknown");

  const foreign = await verifyOnlinePayment(setup().sb, { ticketId: "t2", sessionId: "cs_1" });
  eq(foreign.code, "payment_session_mismatch");

  const unpaid = setup();
  const fakeFetch = (async () =>
    new Response(JSON.stringify(paidSession({ status: "open", payment_status: "unpaid" })), { status: 200 })) as typeof fetch;
  const result = await verifyOnlinePayment(unpaid.sb, { ticketId: "t1", sessionId: "cs_1", fetchImpl: fakeFetch });
  eq(result.ok, false);
  eq(result.code, "payment_not_completed");
  eq(unpaid.tables.payments.length, 0);
});

Deno.test("verification falls back to the provider when the webhook is late", async () => {
  const { sb, tables } = setup();
  const fakeFetch = (async (url: string) => {
    if (!String(url).includes("/checkout/sessions/cs_1")) throw new Error("unexpected url " + url);
    return new Response(JSON.stringify(paidSession()), { status: 200 });
  }) as typeof fetch;

  const result = await verifyOnlinePayment(sb, { ticketId: "t1", sessionId: "cs_1", fetchImpl: fakeFetch });
  eq(result.ok, true);
  eq(tables.payment_sessions[0].status, "succeeded");
  eq(tables.payments.length, 1);
});

Deno.test("verification refuses a provider amount that does not match the ticket", async () => {
  const { sb, tables } = setup();
  const fakeFetch = (async () =>
    new Response(JSON.stringify(paidSession({ amount_total: 1 })), { status: 200 })) as typeof fetch;
  const result = await verifyOnlinePayment(sb, { ticketId: "t1", sessionId: "cs_1", fetchImpl: fakeFetch });
  eq(result.ok, false);
  eq(result.code, "payment_amount_mismatch");
  eq(tables.payments.length, 0);
  eq(tables.tickets[0].paid_amount, 0);
});

Deno.test("a refunded payment can never confirm a booking", async () => {
  const { sb } = setup({}, { status: "refunded" });
  const result = await verifyOnlinePayment(sb, { ticketId: "t1", sessionId: "cs_1" });
  eq(result.ok, false);
  eq(result.code, "payment_refunded");
});
