import { issueInvoice } from "./invoice-service.ts";
import { renderInvoiceDocument } from "./invoiceDocument.ts";
import type { PaymentProfile } from "./payment-domain.ts";

const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
type Row = Record<string, any>;
const profile: PaymentProfile = { id: "p", name: "Synthetic", presentation_type: "swiss_qr", account_holder: "Synthetic School",
  iban: "CH4431999123000889012", account_holder_street: "Teststrasse", account_holder_house_number: "1", account_holder_zip: "9490", account_holder_city: "Vaduz", account_holder_country: "LI",
  currency: "CHF", reference_type: "QRR", country_scope: "CH_LI", account_type: "qr_iban", is_active: true, is_archived: false, validation_status: "valid" };
function fixture(date: string | null = "2026-12-14", invoices: Row[] = [], failTicket = false) {
  const tables: Record<string, Row[]> = { tickets: [{ id: "t", customer_id: "c", payment_due_date: date }],
    customers: [{ id: "c", first_name: "Synthetic", last_name: "Payer", country: "LI", zip: "9490", city: "Vaduz" }],
    invoices, payment_profiles: [profile], ticket_history: [] };
  const writes: string[] = [];
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = []; let op = "read", patch: Row = {};
    const run = () => {
      if (name === "tickets" && failTicket) return { data: null, error: { message: "synthetic failure" } };
      let rows = tables[name].filter(r => filters.every(f => f(r)));
      if (op !== "read") writes.push(name + ":" + op);
      if (op === "insert") { const row = { id: "new", invoice_number: "R-2026-TEST", ...patch }; tables[name].push(row); rows = [row]; }
      if (op === "update") rows.forEach(r => Object.assign(r, patch));
      return { data: rows, error: null };
    };
    const b: any = { select: () => b, eq: (k: string, v: unknown) => (filters.push(r => r[k] === v), b),
      not: () => b, order: () => b, insert: (p: Row) => (op = "insert", patch = p, b),
      update: (p: Row) => (op = "update", patch = p, b),
      maybeSingle: async () => { const r = run(); return { ...r, data: r.data?.[0] ?? null }; },
      single: async () => { const r = run(); return { ...r, data: r.data?.[0] ?? null }; },
      then: (resolve: (v: unknown) => unknown) => resolve(run()) };
    return b;
  };
  return { sb: { from }, tables, writes };
}
const input = { ticketId: "t", customerId: "c", subtotal: 100, total: 100, dueDays: 99 };
Deno.test("new invoice stored ticket date beats dueDays and snapshot/document agree", async () => {
  const f = fixture(); const r = await issueInvoice(f.sb, input);
  eq(r.ok, true); eq(r.invoice?.due_date, "2026-12-14");
  eq((r.invoice?.payment_snapshot as Row)?.due_date, "2026-12-14");
  const doc = await renderInvoiceDocument({ invoice: r.invoice as any, school: { name: "Synthetic" }, customer: { last_name: "Payer" }, ticketNumber: "TEST", lines: [] });
  eq(doc.ok, true); eq(doc.ok && doc.html.includes("Zahlbar bis: 14.12.2026"), true);
});
for (const days of [undefined, 3]) Deno.test(`absent ticket date retains dueDays fallback ${days ?? 14}`, async () => {
  const d = new Date(); d.setDate(d.getDate() + (days ?? 14));
  const r = await issueInvoice(fixture(null).sb, { ...input, dueDays: days });
  eq(r.ok, true); eq(r.invoice?.due_date, d.toISOString().slice(0, 10));
});
Deno.test("issued invoice replay is frozen even if ticket lookup fails", async () => {
  const row = { id: "old", ticket_id: "t", status: "open", due_date: "2026-11-30", payment_snapshot: { due_date: "2026-11-30", frozen: true } };
  const f = fixture("2027-02-01", [row], true); const r = await issueInvoice(f.sb, input);
  eq(r.invoice, row); eq(f.writes, []);
});
Deno.test("resumed draft retains date and existing snapshot", async () => {
  const snapshot = { due_date: "2026-11-30", frozen: true };
  const f = fixture("2027-02-01", [{ id: "draft", ticket_id: "t", invoice_number: "R-DRAFT", status: "draft", total: 100, customer_id: "c", due_date: "2026-11-30", payment_snapshot: snapshot }]);
  const r = await issueInvoice(f.sb, input); eq(r.ok, true); eq(r.invoice?.due_date, "2026-11-30"); eq(r.invoice?.payment_snapshot, snapshot);
  eq(f.writes.includes("invoices:insert"), false);
});
Deno.test("additional invoice also uses authoritative ticket date", async () => {
  const r = await issueInvoice(fixture().sb, { ...input, allowAdditional: true }); eq(r.ok, true); eq(r.invoice?.due_date, "2026-12-14");
});
Deno.test("failed or missing ticket lookup aborts before writes despite explicit customer", async () => {
  for (const failed of [true, false]) {
    const f = fixture(null, [], failed); if (!failed) f.tables.tickets = [];
    const r = await issueInvoice(f.sb, input); eq(r.error_code, "TICKET_LOOKUP_FAILED"); eq(f.writes, []);
  }
});