// Mocked transport only — no real email. In-memory fake of the few tables used.
import { assertEquals } from "jsr:@std/assert@1";
import { completeBooking } from "./flow.ts";
import { attemptInvoiceDelivery } from "../_shared/invoiceDelivery.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
function fakeDb(opts: { confirmOk?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    tickets: [{ id: "t1", ticket_number: "T-1", total_amount: 540, customer_id: null }],
    invoices: [], booking_email_deliveries: [],
  };
  let seq = 0;
  // deno-lint-ignore no-explicit-any
  const q = (name: string): any => {
    const f: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => tables[name].filter((r) => f.every((p) => p(r)));
    const api = {
      select: () => api,
      eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), api),
      in: (k: string, v: unknown[]) => (f.push((r) => v.includes(r[k])), api),
      update: (p: Row) => (patch = p, api),
      upsert: (row: Row) => {
        if (!tables[name].some((r) => r.idempotency_key === row.idempotency_key)) tables[name].push({ id: `d${++seq}`, status: "pending", attempts: 0, ...row });
        return Promise.resolve({});
      },
      maybeSingle: () => { const r = rows(); if (patch) r.forEach((x) => Object.assign(x, patch)); return Promise.resolve({ data: r[0] ?? null }); },
      then: (res: (v: unknown) => void) => { const r = rows(); if (patch) r.forEach((x) => Object.assign(x, patch)); res({ data: r }); },
    };
    return api;
  };
  const calls: string[] = [];
  return {
    tables, calls,
    from: q,
    rpc: (fn: string) => {
      calls.push(fn);
      if (fn === "bc_2627_finalize") { tables.tickets[0].customer_id = "c1"; return Promise.resolve({ data: { status: "success" } }); }
      if (fn === "bc_2627_confirm") {
        const done = calls.filter((c) => c === fn).length > 1;
        return Promise.resolve({ data: opts.confirmOk === false ? { status: "error", code: "x" } : { status: "success", already_confirmed: done } });
      }
      return Promise.resolve({ data: null });
    },
  };
}
const input = { ticket_id: "t1", reservation_token: "tok12345", customer: { email: "a@example.invalid" }, participants: [] };
// deno-lint-ignore no-explicit-any
const issue = (db: any) => async () => {
  const inv = { id: "i1", invoice_number: "R-1", due_date: "2027-01-01", total: 540, status: "open", ticket_id: "t1" };
  db.tables.invoices.push(inv);
  return { ok: true, invoice: inv };
};

Deno.test("invoice booking: one invoice, immediate invoice email, retries do not duplicate", async () => {
  const db = fakeDb();
  const sent: string[] = [];
  const transport = async (m: { idempotencyKey: string }) => (sent.push(m.idempotencyKey), { ok: true as const, id: "m1" });
  // deno-lint-ignore no-explicit-any
  const r1 = await completeBooking(db, input as any, { issue: issue(db) as any, transport });
  assertEquals(r1.status, 200); assertEquals(r1.body.delivery, { invoice: "sent" });
  // deno-lint-ignore no-explicit-any
  const r2 = await completeBooking(db, input as any, { issue: issue(db) as any, transport });
  assertEquals(r2.status, 200);
  assertEquals(db.tables.invoices.length, 1);
  assertEquals(sent, ["ticket:t1:invoice"]);
});

Deno.test("invoice delivery failure is recoverable by manual retry without duplicate row", async () => {
  const db = fakeDb();
  let fail = true;
  const transport = async () => fail ? { ok: false as const, error: "down" } : { ok: true as const, id: "m2" };
  // deno-lint-ignore no-explicit-any
  const r = await completeBooking(db, input as any, { issue: issue(db) as any, transport });
  assertEquals(r.body.delivery, { invoice: "failed" });
  fail = false;
  const d = db.tables.booking_email_deliveries[0];
  const again = await attemptInvoiceDelivery(db, d.id, { invoice_number: "R-1", total: 540, due_date: "2027-01-01", ticket_number: "T-1" }, transport, { manual: true });
  assertEquals(again, "sent"); assertEquals(db.tables.booking_email_deliveries.length, 1); assertEquals(d.attempts, 2);
});

Deno.test("confirm failure: retryable, no email sent", async () => {
  const db = fakeDb({ confirmOk: false });
  let n = 0;
  const transport = async () => (n++, { ok: true as const, id: "x" });
  // deno-lint-ignore no-explicit-any
  const r = await completeBooking(db, input as any, { issue: issue(db) as any, transport });
  assertEquals(r.status, 503); assertEquals(r.body.retryable, true); assertEquals(n, 0);
});
