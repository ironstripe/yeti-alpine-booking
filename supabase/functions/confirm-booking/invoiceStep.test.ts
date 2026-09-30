// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/confirm-booking/invoiceStep.test.ts
// In-memory DB and a stubbed invoice issuer; no real data is touched.
import { issueInvoiceThenConfirm } from "./invoiceStep.ts";
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const run = () => {
      const rows = tables[name].filter((r) => filters.every((f) => f(r)));
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return rows;
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      update: (p: Row) => ((patch = p), b),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
    };
    return b;
  };
  return { from };
}
const setup = (status = "provisional") => {
  const tables: Record<string, Row[]> = { tickets: [{ id: "t1", status }], invoices: [] };
  return { tables, sb: fakeDb(tables) };
};
const input = { ticketId: "t1", customerId: "c1", total: 200, now: new Date("2027-01-01T10:00:00Z") };
const okIssuer = (tables: Record<string, Row[]>, counter: { n: number }) => (async () => {
  counter.n++;
  const inv = { id: "i1", ticket_id: "t1", invoice_number: "R-1", due_date: "2027-01-15", status: "open" };
  tables.invoices.push(inv);
  return { ok: true, invoice: inv };
}) as any;

Deno.test("issuance failure leaves ticket provisional and retryable", async () => {
  const { sb, tables } = setup();
  const failing = (async () => ({ ok: false, error_code: "NO_COMPATIBLE_PROFILE", error: "no profile" })) as any;
  const r = await issueInvoiceThenConfirm(sb, input, failing);
  eq([r.ok, !r.ok && r.code], [false, "invoice_issue_failed"]);
  eq(tables.tickets[0].status, "provisional");
  eq(tables.tickets[0].payment_method, undefined);
  eq(tables.invoices.length, 0);
});

Deno.test("retry after failure confirms with exactly one open invoice", async () => {
  const { sb, tables } = setup();
  await issueInvoiceThenConfirm(sb, input, (async () => ({ ok: false, error: "x" })) as any);
  const c = { n: 0 };
  const r = await issueInvoiceThenConfirm(sb, input, okIssuer(tables, c));
  eq(r.ok && r.invoice.invoice_number, "R-1");
  eq([tables.tickets[0].status, tables.tickets[0].payment_method, tables.tickets[0].payment_due_date], ["confirmed", "invoice", "2027-01-15"]);
  eq(tables.invoices.length, 1);
});

Deno.test("existing open invoice is reused, not issued again", async () => {
  const { sb, tables } = setup();
  tables.invoices.push({ id: "i0", ticket_id: "t1", invoice_number: "R-0", due_date: "2027-01-15", status: "open" });
  const c = { n: 0 };
  const r = await issueInvoiceThenConfirm(sb, input, okIssuer(tables, c));
  eq([r.ok && r.invoice.invoice_number, c.n, tables.invoices.length, tables.tickets[0].status], ["R-0", 0, 1, "confirmed"]);
});

Deno.test("leftover non-open invoice is not accepted; ticket stays provisional", async () => {
  const { sb, tables } = setup();
  const draft = (async () => ({ ok: true, invoice: { id: "i2", invoice_number: "R-2", due_date: "x", status: "draft" } })) as any;
  const r = await issueInvoiceThenConfirm(sb, input, draft);
  eq(r.ok, false);
  eq(tables.tickets[0].status, "provisional");
});

Deno.test("issuer throwing does not confirm the ticket", async () => {
  const { sb, tables } = setup();
  let threw = false;
  try { await issueInvoiceThenConfirm(sb, input, (async () => { throw new Error("db down"); }) as any); } catch { threw = true; }
  eq([threw, tables.tickets[0].status], [true, "provisional"]);
});
