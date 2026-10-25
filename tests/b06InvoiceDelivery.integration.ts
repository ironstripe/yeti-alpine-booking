// B06: office invoice send — actual legacy schema + ONLY pending B04 + B06 SQL,
// local PostgREST, fake transport. Never reads env database credentials.
// Refuses all non-local HTTP traffic. Asserts invoice financial immutability.
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { routePayment } from "../supabase/functions/_shared/payment-domain.ts";
import { createSendInvoiceHandler } from "../supabase/functions/send-invoice/handler.ts";
import type { Mail, Transport } from "../supabase/functions/_shared/courseDelivery.ts";

const admin = "postgres://postgres@127.0.0.1:55432/postgres";
const db = `b06_${Date.now()}`;
const url = admin.replace(/postgres$/, db);
const root = new URL("../", import.meta.url);
async function psql(target: string, args: string[]) {
  const out = await new Deno.Command("psql", { args: [target, "-q", "-v", "ON_ERROR_STOP=1", ...args], env: { PGSSLMODE: "disable" }, stdout: "piped", stderr: "piped" }).output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
}
const secret = "isolated-b06-local-jwt-0123456789abcdef";
async function jwt(role: string, sub?: string) {
  const enc = (x: unknown) => btoa(JSON.stringify(x)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role, sub, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return body + "." + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
await psql(admin, ["-c", `CREATE DATABASE ${db}`]);
const sql = postgres(url, { ssl: false, onnotice: () => {}, max: 8 });
let rest: Deno.ChildProcess | undefined;
let pass = 0, fail = 0;
async function test(name: string, fn: () => Promise<void>) { try { await fn(); pass++; console.log("ok " + name); } catch (e) { fail++; console.log("FAIL " + name + ": " + String(e)); } }

const profile: any = {
  id: "00000000-0000-4000-8000-0000000000p1".replace("p1", "a1"), name: "CHF QR", currency: "CHF", presentation_type: "swiss_qr",
  iban: "CH4431999123000889012", account_holder: "Schneesportschule Malbun",
  account_holder_street: "Talstation", account_holder_house_number: "1", account_holder_zip: "9497",
  account_holder_city: "Malbun", account_holder_country: "LI", reference_type: "QRR",
  country_scope: "CH_LI", account_type: "qr_iban", is_active: true, is_archived: false, validation_status: "valid",
};
function snapshotFor(invoiceNumber: string, total: number) {
  const r = routePayment({
    billingCountry: "CH", currency: "CHF", invoiceIdentifier: invoiceNumber, invoiceNumber, dueDate: "2026-12-31", amount: total,
    debtor: { name: "Müller", street: "Bergstrasse", houseNumber: "12b", zip: "8000", city: "Zürich", country: "CH" }, profiles: [profile],
  });
  if (!r.ok || !r.snapshot) throw new Error("routing failed");
  return r.snapshot;
}

try {
  for (const file of ["tests/sql/baseline_prelude.sql", "tests/sql/production_schema_baseline.sql"]) await psql(url, ["-f", new URL(file, root).pathname]);
  await psql(url, ["-f", new URL("supabase/pending/b04_delivery_compatibility.sql", root).pathname]);
  await psql(url, ["-f", new URL("supabase/pending/b06_invoice_delivery.sql", root).pathname]);
  await psql(url, ["-f", new URL("drizzle/migrations/0009_customers_email_optional.sql", root).pathname]);
  // Synthetic stub for the website reservation table invoiceContent reads.
  await sql.unsafe(`CREATE TABLE bc_2627_reservations(ticket_id uuid, quote_snapshot jsonb)`);
  await sql.unsafe(`INSERT INTO school_settings(name,email) VALUES ('Test','test@example.invalid');
    INSERT INTO email_templates(name,trigger,subject,body_html,is_active) VALUES ('Invoice','invoice.created','Rechnung {{invoice.number}}','<p>{{customer.last_name}} {{invoice.total}} {{invoice.due_date}}</p>',true);
    INSERT INTO customers(id,email,first_name,last_name,street,zip,city,country) VALUES ('00000000-0000-4000-8000-0000000000c1','kunde@example.invalid','Andrée','Müller','Bergstrasse','8000','Zürich','CH')`);
  await sql.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; END $$;
    GRANT anon,authenticated,service_role TO authenticator; ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO service_role,authenticated,anon;
    GRANT ALL ON booking_email_deliveries,email_logs,email_templates,tickets,school_settings,ticket_items,customers,products,invoices,billing_partners,bc_2627_reservations TO service_role;
    GRANT SELECT ON booking_email_deliveries TO authenticated;`);

  const port = 41000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
  rest = new Deno.Command("postgrest", { env: { PGRST_DB_URI: url.replace("postgres@", "authenticator@"), PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: secret, PGRST_SERVER_PORT: String(port), PGRST_SERVER_HOST: "127.0.0.1", PGRST_LOG_LEVEL: "crit", PGSSLMODE: "disable" }, stdout: "null", stderr: "null" }).spawn();
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base); await r.body?.cancel(); if (r.ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 50)); }
  const localFetch = async (input: RequestInfo | URL, init?: RequestInit) => { const target = String(input).replace(`${base}/rest/v1`, base); if (!target.startsWith(base)) throw new Error("Non-local request refused"); return fetch(target, init); };
  const sb = createClient(base, await jwt("service_role"), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } });

  let clock = Date.now(), calls: Mail[] = [], mode = "ok";
  const transport: Transport = async (mail) => { calls.push(structuredClone(mail)); if (mode === "timeout") throw new Error("fake timeout"); if (mode === "reject") return { ok: false, error: "fake 422", status: 422 }; return { ok: true, id: `fake-${calls.length}` }; };
  const handler = createSendInvoiceHandler(sb, { transport, authorize: async () => ({ userId: "synthetic-office" }), now: () => clock });
  const invoke = async (invoiceId: string, action: string, extra = {}) => {
    const r = await handler(new Request("http://localhost/send-invoice", { method: "POST", body: JSON.stringify({ invoice_id: invoiceId, action, ...extra }) }));
    return { status: r.status, ...await r.json() };
  };

  let seq = 0;
  async function fixture(opts: { status?: string; email?: string | null; partner?: boolean; total?: number } = {}) {
    seq++;
    const total = opts.total ?? 105;
    const num = `R-2026-B06-${String(seq).padStart(3, "0")}`;
    let customerId = "00000000-0000-4000-8000-0000000000c1";
    if (opts.email !== undefined && opts.email !== "kunde@example.invalid") {
      const [c] = await sql`INSERT INTO customers(email,last_name) VALUES (${opts.email === null ? null : crypto.randomUUID() + opts.email},'NoMail') RETURNING id`;
      customerId = c.id;
    }
    let partnerId: string | null = null;
    if (opts.partner) {
      const [p] = await sql`INSERT INTO billing_partners(name,billing_email) VALUES (${'Gemeinde ' + seq},'gemeinde@example.invalid') RETURNING id`;
      partnerId = p.id;
    }
    const [t] = await sql`INSERT INTO tickets(ticket_number,total_amount,customer_id,billing_partner_id) VALUES (${'B06-' + seq},${total},${customerId},${partnerId}) RETURNING id`;
    const snap = snapshotFor(num, total);
    const [inv] = await sql`INSERT INTO invoices(invoice_number,ticket_id,customer_id,subtotal,total,currency,qr_reference,invoice_date,due_date,status,payment_snapshot,payment_reference_type,payment_reference)
      VALUES (${num},${t.id},${customerId},${total},${total},'CHF',${snap.reference},'2026-10-25','2026-12-31',${opts.status ?? "open"},${sql.json(snap as any)},'QRR',${snap.reference}) RETURNING id`;
    return { invoice: inv.id, ticket: t.id, snapshot: snap };
  }
  const invoiceRow = async (id: string) => (await sql`SELECT to_jsonb(i) row FROM invoices i WHERE id=${id}`)[0].row;

  await test("issued invoice sends PDF; invoice row byte-identical; frozen payload reused on retry", async () => {
    const f = await fixture();
    const before = await invoiceRow(f.invoice);
    assertEquals((await invoke(f.invoice, "status")).outcome, "not_sent");
    const r = await invoke(f.invoice, "send");
    if (r.outcome !== "sent") console.log("DEBUG first send:", JSON.stringify(r));
    assertEquals(r.outcome, "sent");
    assertEquals(calls.length, 1);
    const mail = calls[0];
    assertEquals(mail.to, "kunde@example.invalid");
    assertEquals(mail.attachments?.[0]?.content_type, "application/pdf");
    assert(mail.attachments?.[0]?.filename.endsWith(".pdf"));
    assertEquals(new TextDecoder().decode(Uint8Array.from(atob(mail.attachments![0].content), (c) => c.charCodeAt(0)).slice(0, 5)), "%PDF-");
    assert(mail.html.includes("Müller"));
    assertEquals(await invoiceRow(f.invoice), before); // no financial/status/sent_at mutation
    assertEquals((await invoke(f.invoice, "status")).outcome, "sent");
    assertEquals((await invoke(f.invoice, "send")).outcome, "already_sent");
    assertEquals(calls.length, 1);
  });

  await test("draft and paid invoices are never mailed; recipient authority is billing partner", async () => {
    const draft = await fixture({ status: "draft" });
    assertEquals((await invoke(draft.invoice, "send")).outcome, "not_issued");
    const paid = await fixture({ status: "paid" });
    assertEquals((await invoke(paid.invoice, "send")).outcome, "not_sendable");
    const partner = await fixture({ partner: true });
    assertEquals((await invoke(partner.invoice, "send")).outcome, "sent");
    assertEquals(calls.at(-1)?.to, "gemeinde@example.invalid");
  });

  await test("missing/blank customer email fails closed with no_recipient, no transport", async () => {
    const f = await fixture({ email: null });
    const n = calls.length;
    assertEquals((await invoke(f.invoice, "send")).outcome, "no_recipient");
    assertEquals((await invoke(f.invoice, "status")).outcome, "no_recipient");
    assertEquals(calls.length, n);
  });

  await test("provider rejection (HTTP200 contract) marks failed, invoice untouched, manual retry sends once", async () => {
    const f = await fixture();
    const before = await invoiceRow(f.invoice);
    mode = "reject";
    const r = await invoke(f.invoice, "send");
    assertEquals(r.status, 200);
    assertEquals(r.success, false);
    assertEquals(r.outcome, "failed");
    assertEquals(await invoiceRow(f.invoice), before);
    mode = "ok";
    assertEquals((await invoke(f.invoice, "send")).outcome, "sent");
    assertEquals(calls.length, 2);
  });

  await test("concurrent sends produce exactly one transport handoff", async () => {
    const f = await fixture();
    const n = calls.length;
    const r = await Promise.all([invoke(f.invoice, "send"), invoke(f.invoice, "send")]);
    assertEquals(r.map((x) => x.outcome).sort(), ["not_claimed", "sent"]);
    assertEquals(calls.length, n + 1);
  });

  await test("unknown within 24h reuses same key and frozen PDF bytes; expired/digest mismatch need review", async () => {
    const f = await fixture();
    mode = "timeout";
    const timed = await invoke(f.invoice, "send");
    assertEquals(timed.code, "transport_unknown");
    mode = "ok";
    const [d] = await sql`SELECT * FROM booking_email_deliveries WHERE ticket_id=${f.ticket} AND kind='invoice'`;
    assertEquals(d.invoice_id, f.invoice);
    const frozenMail = d.frozen_payload.mail;
    assertEquals((await invoke(f.invoice, "send")).outcome, "sent");
    assertEquals(calls.at(-1), frozenMail); // exact same bytes + key
    // expired unknown
    const f2 = await fixture();
    mode = "timeout";
    await invoke(f2.invoice, "send");
    mode = "ok";
    const [d2] = await sql`SELECT * FROM booking_email_deliveries WHERE ticket_id=${f2.ticket} AND kind='invoice'`;
    clock = new Date(d2.first_claimed_at).getTime() + 24 * 60 * 60 * 1000;
    const n = calls.length;
    assertEquals((await invoke(f2.invoice, "send")).outcome, "needs_review");
    assertEquals(calls.length, n);
    clock = Date.now();
    // digest corruption
    const f3 = await fixture();
    mode = "timeout";
    await invoke(f3.invoice, "send");
    mode = "ok";
    await sql`UPDATE booking_email_deliveries SET payload_digest='bad' WHERE ticket_id=${f3.ticket}`;
    assertEquals((await invoke(f3.invoice, "send")).outcome, "needs_review");
  });

  await test("delivery bound to a different invoice is review-required, never reused", async () => {
    const f1 = await fixture();
    assertEquals((await invoke(f1.invoice, "send")).outcome, "sent");
    // replacement invoice on the same ticket
    const num = "R-2026-B06-999";
    const snap = snapshotFor(num, 50);
    const [inv2] = await sql`INSERT INTO invoices(invoice_number,ticket_id,customer_id,subtotal,total,currency,qr_reference,invoice_date,due_date,status,payment_snapshot)
      VALUES (${num},${f1.ticket},'00000000-0000-4000-8000-0000000000c1',50,50,'CHF',${snap.reference},'2026-10-25','2026-12-31','open',${sql.json(snap as any)}) RETURNING id`;
    const n = calls.length;
    assertEquals((await invoke(inv2.id, "send")).outcome, "needs_review");
    assertEquals((await invoke(inv2.id, "send")).code, "different_invoice_bound");
    assertEquals(calls.length, n);
  });

  await test("unauthorized, strict body, wrong invoice id and missing template fail closed", async () => {
    const f = await fixture();
    const n = calls.length;
    for (const status of [401, 403]) {
      const denied = createSendInvoiceHandler(sb, { transport, authorize: async () => new Response("denied", { status }) });
      assertEquals((await denied(new Request("http://localhost/s", { method: "POST", body: JSON.stringify({ invoice_id: f.invoice, action: "send" }) }))).status, status);
    }
    assertEquals((await invoke(f.invoice, "send", { recipient_email: "evil@example.invalid" })).status, 400);
    assertEquals((await invoke(crypto.randomUUID(), "send")).outcome, "not_found");
    await sql`UPDATE email_templates SET is_active=false WHERE trigger='invoice.created'`;
    assertEquals((await invoke(f.invoice, "send")).code, "template_missing");
    await sql`UPDATE email_templates SET is_active=true WHERE trigger='invoice.created'`;
    assertEquals(calls.length, n);
  });

  await test("missing B06 schema (invoice_id column) fails closed with 503", async () => {
    const f = await fixture();
    await sql`ALTER TABLE booking_email_deliveries RENAME COLUMN invoice_id TO hidden_invoice_id`;
    await sql.unsafe("NOTIFY pgrst,'reload schema';NOTIFY pgrst,'reload config'");
    await new Promise((r) => setTimeout(r, 300));
    const n = calls.length;
    const r = await invoke(f.invoice, "send");
    assertEquals(r.status, 503);
    assertEquals(r.code, "schema_incompatible");
    assertEquals(calls.length, n);
    await sql`ALTER TABLE booking_email_deliveries RENAME COLUMN hidden_invoice_id TO invoice_id`;
    await sql.unsafe("NOTIFY pgrst,'reload schema';NOTIFY pgrst,'reload config'");
    await new Promise((r) => setTimeout(r, 300));
  });

  await test("RLS hides delivery content from anonymous and teacher roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const client = createClient(base, await jwt(role, "00000000-0000-4000-8000-000000000099"), { auth: { persistSession: false }, global: { fetch: localFetch } });
      const r = await client.from("booking_email_deliveries").select("recipient_email,frozen_payload");
      assert(r.error || r.data?.length === 0);
    }
  });
} finally {
  console.log(`${pass} passed / ${fail} failed`);
  try { rest?.kill("SIGTERM"); await rest?.status; } catch { /* already dead */ }
  await sql.end();
  await psql(admin, ["-c", `DROP DATABASE ${db} WITH (FORCE)`]);
}
if (fail) Deno.exit(1);
