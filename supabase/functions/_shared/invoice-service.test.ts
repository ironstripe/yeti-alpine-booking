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
async function frozenFixture() {
  // Generate a complete real snapshot and associated columns through production issuance.
  const initial = fixture("2026-11-30");
  const issued = await issueInvoice(initial.sb, input);
  eq(issued.ok, true);
  const row = structuredClone(issued.invoice) as Row;
  row.status = "draft";
  row.payment_snapshot.snapshot_created_at = "2026-10-01T12:00:00.000Z";
  return fixture("2027-02-01", [row]);
}
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
  const generated = await frozenFixture(); const row = generated.tables.invoices[0]; row.status = "open";
  const f = fixture("2027-02-01", [row], true); f.tables.payment_profiles = [];
  const before = structuredClone(row); const r = await issueInvoice(f.sb, { ...input, overrideProfileId: "changed", overrideReason: "changed" });
  eq(row, before);
  eq(r.invoice, row); eq(f.writes, []);
});
Deno.test("coherent resumed draft retains all frozen payment fields and historical snapshot timestamp", async () => {
  const f = await frozenFixture(); const before = structuredClone(f.tables.invoices[0]);
  const r = await issueInvoice(f.sb, input); eq(r.ok, true);
  for (const key of Object.keys(before).filter(k => k.startsWith("payment_") || k === "qr_reference" || k === "due_date")) eq(r.invoice?.[key], before[key]);
  eq(f.writes.includes("invoices:insert"), false);
  const doc = await renderInvoiceDocument({ invoice: r.invoice as any, school: { name: "Synthetic" }, customer: { last_name: "Payer" }, ticketNumber: "TEST", lines: [] });
  eq(doc.ok, true); eq(doc.ok && doc.html.includes("Zahlbar bis: 30.11.2026"), true);
});
Deno.test("snapshotless resumed draft issues normally with its original due date", async () => {
  const f = await frozenFixture(); f.tables.invoices[0].payment_snapshot = null;
  f.tables.payment_profiles = [{ ...profile, id: "new-profile", name: "New configuration" }];
  const r = await issueInvoice(f.sb, input); eq(r.ok, true); eq(r.invoice?.due_date, "2026-11-30");
  eq(r.invoice?.payment_profile_id, "new-profile"); eq((r.invoice?.payment_snapshot as Row).profile_id, "new-profile");
  eq((r.invoice?.payment_snapshot as Row).due_date, "2026-11-30"); eq(f.writes.includes("invoices:insert"), false);
});
Deno.test("changed current profile or override metadata cannot mix with a frozen draft", async () => {
  for (const change of ["id", "name", "reference_type", "override", "unavailable", "debtor"]) {
    const f = await frozenFixture(); const before = structuredClone(f.tables.invoices[0]);
    let options = input;
    if (change === "override") options = { ...input, overrideProfileId: "p", overrideReason: "New reason", actorUserId: "new-actor" } as typeof input;
    else if (change === "unavailable") f.tables.payment_profiles = [];
    else if (change === "debtor") f.tables.customers[0].last_name = "Changed";
    else f.tables.payment_profiles = [{ ...profile, [change]: change === "reference_type" ? "NON" : "changed" }];
    const r = await issueInvoice(f.sb, options); eq(r.ok, false); eq(f.writes, []); eq(f.tables.invoices[0], before);
  }
});
Deno.test("each inconsistent frozen payment column fails closed before writes", async () => {
  for (const key of ["qr_reference", "payment_profile_id", "payment_presentation_type", "payment_reference_type", "payment_reference", "payment_payload_version", "payment_routing_reason", "payment_profile_overridden", "payment_profile_override_reason", "payment_override_by", "currency"]) {
    const f = await frozenFixture(); f.tables.invoices[0][key] = key === "payment_profile_overridden" ? true : "changed";
    const before = structuredClone(f.tables.invoices[0]); const r = await issueInvoice(f.sb, input);
    eq(r.error_code, "DRAFT_PAYMENT_MISMATCH"); eq(f.writes, []); eq(f.tables.invoices[0], before);
  }
});
Deno.test("malformed or changed snapshot fields fail closed without replacing the snapshot", async () => {
  const generated = await frozenFixture();
  for (const key of Object.keys(generated.tables.invoices[0].payment_snapshot)) {
    const f = await frozenFixture(); f.tables.invoices[0].payment_snapshot[key] = "changed";
    const before = structuredClone(f.tables.invoices[0]); const r = await issueInvoice(f.sb, input);
    eq(r.error_code, "DRAFT_PAYMENT_MISMATCH"); eq(f.writes, []); eq(f.tables.invoices[0], before);
  }
  const f = await frozenFixture(); f.tables.invoices[0].payment_snapshot = { due_date: "2026-11-30", frozen: true };
  const r = await issueInvoice(f.sb, input); eq(r.error_code, "DRAFT_PAYMENT_MISMATCH"); eq(f.writes, []);
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