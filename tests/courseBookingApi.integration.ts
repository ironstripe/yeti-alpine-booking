// End-to-end tests of the REAL 26/27 website API code path (#36):
//   course-booking handler -> flow -> supabase-js -> PostgREST -> PostgreSQL
//   (schema-only production baseline + pending SQL + synthetic fixtures)
//   including the production issueInvoice, invoice document/QR rendering and the
//   durable delivery state machine with a MOCKED transport (no e-mail is sent).
// Local only; refuses non-local databases. Needs psql and postgrest on PATH.
//   PGSSLMODE=disable PATH=<postgrest>/bin:$PATH \
//   deno run -A --node-modules-dir=none tests/courseBookingApi.integration.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { createHandler } from "../supabase/functions/course-booking/handler.ts";
import { createRetryHandler } from "../supabase/functions/retry-course-booking-delivery/handler.ts";
import type { Mail, Transport } from "../supabase/functions/_shared/courseDelivery.ts";
import { BK, AG, C1, K4, E4, PRIV, SA, SAT, fixtureSql } from "./bc2627Fixture.mjs";

const adminUrl = Deno.env.get("BC_TEST_DATABASE_URL") ?? "postgres://postgres@127.0.0.1:55432/postgres";
const u = new URL(adminUrl);
if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Error("Refusing non-local database");
const dbName = `bc2627_api_${Date.now()}`;
const root = new URL("../", import.meta.url);
const API_KEY = "local-test-key-not-a-secret";
const JWT_SECRET = "local-postgrest-test-secret-0123456789abcdef";
Deno.env.set("YETI_INTAKE_API_KEY", API_KEY);

const psql = async (url: string, args: string[], stdin?: string) => {
  const p = new Deno.Command("psql", { args: [url, "-q", "-v", "ON_ERROR_STOP=1", ...args], stdin: stdin ? "piped" : "null",
    stdout: "piped", stderr: "piped", env: { PGSSLMODE: "disable" } }).spawn();
  if (stdin) { const w = p.stdin.getWriter(); await w.write(new TextEncoder().encode(stdin)); await w.close(); }
  const o = await p.output();
  if (!o.success) throw new Error(`psql ${args.join(" ")}: ${new TextDecoder().decode(o.stderr)}`);
};

async function jwt(role: string) {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const head = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head)));
  return `${head}.${btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

let passed = 0; const results: string[] = [];
const fx: Record<string, unknown> = {};
const cap = (name: string, request: unknown, res: { status: number; body: unknown }) => { fx[name] = { request, http_status: res.status, response: res.body }; };
async function t(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${(e as Error).message}`); }
}

await psql(adminUrl, ["-c", `CREATE DATABASE ${dbName}`, "-c", `ALTER DATABASE ${dbName} SET search_path = public, extensions`]);
u.pathname = `/${dbName}`;
const dbUrl = u.toString();
const sql = postgres(dbUrl, { onnotice: () => {}, ssl: false, max: 5 });
let rest: Deno.ChildProcess | null = null;
try {
  for (const f of ["tests/sql/baseline_prelude.sql", "tests/sql/production_schema_baseline.sql", "supabase/pending/bc_2627_atomic_course_booking.sql"]) {
    await psql(dbUrl, ["-f", new URL(f, root).pathname]);
  }
  await psql(dbUrl, [], fixtureSql);
  // Supabase-equivalent role setup for the Data API (service_role bypasses RLS).
  await psql(dbUrl, [], `
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; END $$;
    GRANT anon, authenticated, service_role TO authenticator;
    ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    -- synthetic configuration (example IBAN from the SIX documentation)
    INSERT INTO school_settings(name,email,street,house_number,zip,city,country,phone)
      VALUES ('Testschule','info@example.invalid','Teststrasse','1','9497','Malbun','LI','+423 000 00 00');
    INSERT INTO payment_profiles(name,presentation_type,account_holder,iban,account_holder_street,account_holder_house_number,
      account_holder_zip,account_holder_city,account_holder_country,currency,reference_type,country_scope,account_type,
      is_default,is_active,validation_status)
      VALUES ('Test CHF','swiss_qr','Testschule AG','CH9300762011623852957','Teststrasse','1','9497','Malbun','LI','CHF','SCOR','CH_LI','iban',true,true,'valid');
    INSERT INTO email_templates(name,trigger,subject,body_html,body_text,is_active) VALUES
      ('Bestätigung','booking.confirmed','Buchungsbestätigung - {{ticket_number}}','<p>Guten Tag {{customer_last_name}}, Buchung {{ticket_number}}: {{product_name}} {{booking_date}} {{booking_time}}</p>',NULL,true),
      ('Rechnung','invoice.created','Rechnung {{invoice.number}} - {{school.name}}','<p>Hallo {{customer.first_name}} {{customer.last_name}}, Rechnung {{invoice.number}} über {{invoice.total}}, zahlbar bis {{invoice.due_date}}.</p>',NULL,true);
  `);

  const port = 39000 + Math.floor(Math.random() * 1000);
  const au = new URL(dbUrl); au.username = "authenticator";
  rest = new Deno.Command("postgrest", { env: { PGRST_DB_URI: au.toString(), PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(port), PGRST_SERVER_HOST: "127.0.0.1", PGRST_DB_POOL: "20", PGRST_LOG_LEVEL: "crit", PGSSLMODE: "disable" },
    stdout: "null", stderr: "null" }).spawn();
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`${base}/`); await r.body?.cancel(); if (r.ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  const sb = createClient(base, await jwt("service_role"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(String(input).replace(`${base}/rest/v1`, base), init) },
  });

  // ---- mocked transport: records mails, never sends ----
  const sent: Mail[] = [];
  let mode: "ok" | "fail" | "throw" = "ok";
  const transport: Transport = async (m) => {
    if (mode === "throw") throw new Error("network down (simulated)");
    if (mode === "fail") return { ok: false, error: "rejected (simulated)", status: 422 };
    sent.push(m); return { ok: true, id: `mock-${sent.length}` };
  };
  const handler = createHandler(sb, { transport });
  const call = async (body: unknown, key = API_KEY) => {
    const res = await handler(new Request("http://x/course-booking", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  let clock = Date.now();
  const staff = createRetryHandler(sb, { transport, now: () => clock,
    authorize: async (req) => req.headers.get("authorization") === "Bearer office" ? { userId: "00000000-0000-4000-8000-0000000000aa" }
      : new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) });
  const staffCall = async (body: unknown, auth = "Bearer office") => {
    const res = await staff(new Request("http://x/retry", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };

  let n = 0;
  const key = () => `api-key-${++n}-${Date.now()}`;
  const kid = (ref: string) => ({ ref, birth_date: "2018-05-01", discipline: "ski", skill_level: "ski_blauer_koenig" });
  const adult = (ref: string) => ({ ref, birth_date: "1985-03-03", discipline: "ski", skill_level: "ski_adult_green" });
  const named = (p: Record<string, string>) => ({ ...p, first_name: `P-${p.ref}`, last_name: "Familie" });
  const customer = (email = "familie@example.invalid") => ({ email, first_name: "Test", last_name: "Familie", street: "Weg", zip: "9490", city: "Vaduz", country: "LI" });
  const groupSel = (ref: string, dates = ["2027-01-04", "2027-01-05"]) => ({ kind: "group", participant_ref: ref, period_key: BK, product_id: K4, dates, blocks: ["10:00-12:00", "14:00-16:00"] });
  const reserveBody = (people: Record<string, string>[], selections: unknown[]) => ({ action: "reserve", reservation: { idempotency_key: key(), participants: people, selections } });
  const completeBody = (r: Record<string, any>, people: Record<string, string>[], email?: string) => ({ action: "complete", ticket_id: r.ticket_id, reservation_token: r.reservation_token, customer: customer(email), participants: people.map(named) });
  const invoicesOf = (ticket: string) => sql`SELECT * FROM invoices WHERE ticket_id=${ticket}`;
  const deliveriesOf = (ticket: string) => sql`SELECT * FROM booking_email_deliveries WHERE ticket_id=${ticket} ORDER BY kind`;
  const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

  await t("auth + online payment refused + unknown action", async () => {
    assertEquals((await call({ action: "options" }, "wrong")).status, 401);
    const p = await call({ action: "complete", payment_method: "card" });
    assertEquals(p.status, 503); assertEquals(p.body.code, "payment_provider_unavailable");
    assertEquals((await call({ action: "nope" })).body.code, "unknown_action");
  });

  await t("options contract: exact block IDs string[], tiers, no sales cap flag", async () => {
    const o = await call({ action: "options" });
    cap("options", { action: "options" }, { status: o.status, body: { ...o.body, options: o.body.options.filter((x: any) => [K4, SAT].includes(x.product_id) && [BK, SA].includes(x.period_key)) } });
    assertEquals(o.status, 200); assertEquals(o.body.success, true); assertEquals(o.body.currency, "CHF");
    const k4 = o.body.options.find((x: any) => x.period_key === BK && x.product_id === K4);
    assertEquals(k4.blocks, ["10:00-12:00", "14:00-16:00"]); assertEquals(k4.block_mode, "all"); assertEquals(k4.bookable, true);
    assert(k4.tiers.every((x: any) => typeof x.price === "number" && x.price > 0));
    const sat = o.body.options.find((x: any) => x.product_id === SAT);
    assertEquals(sat.blocks, ["10:00-12:00"]);
  });

  let fam: Record<string, any> = {}; let famPeople: Record<string, string>[] = [];
  await t("full flow: family above threshold -> one booking, one open invoice with QR snapshot, invoice+confirmation mails rendered", async () => {
    famPeople = [kid("a"), kid("b"), kid("c"), adult("m")];
    const rb = reserveBody(famPeople, [groupSel("a"), groupSel("b"), groupSel("c"),
      { kind: "group", participant_ref: "m", period_key: AG, product_id: E4, dates: ["2027-01-04"], blocks: ["10:00-12:00", "14:00-16:00"] }]);
    const r = await call(rb);
    cap("reserve_success", rb, r);
    assertEquals(r.status, 201, JSON.stringify(r.body));
    assertEquals(r.body.status, "held"); assertEquals(r.body.total_amount, 3 * 200 + 120); assertEquals(r.body.currency, "CHF");
    assert(!Number.isNaN(Date.parse(r.body.reservation_expires_at)));
    fam = r.body;
    const c = await call(completeBody(fam, famPeople));
    cap("complete_success", completeBody(fam, famPeople), c);
    assertEquals(c.status, 200, JSON.stringify(c.body));
    assertEquals(c.body.status, "confirmed"); assertEquals(c.body.total_amount, 720); assertEquals(c.body.already_confirmed, false);
    assertEquals(c.body.delivery, { invoice: "sent", booking_confirmation: "sent" });
    const inv = await invoicesOf(fam.ticket_id);
    assertEquals(inv.length, 1); assertEquals(inv[0].status, "open"); assertEquals(Number(inv[0].total), 720);
    assertEquals(inv[0].payment_snapshot.presentation_type, "swiss_qr"); assert(inv[0].payment_snapshot.qr_payload.startsWith("SPC"));
    assertEquals(c.body.invoice_number, inv[0].invoice_number);
    const mails = sent.filter((m) => m.to === "familie@example.invalid");
    assertEquals(mails.length, 2);
    const im = mails.find((m) => m.subject.startsWith("Rechnung"))!;
    assertEquals(im.from, "Testschule <info@example.invalid>");
    assertEquals(im.subject, `Rechnung ${inv[0].invoice_number} - Testschule`);
    assert(im.html.includes("CHF 720.00"));
    assertEquals(im.attachments?.length, 1); assertEquals(im.attachments![0].filename, `Rechnung-${inv[0].invoice_number}.html`);
    const doc = decode(im.attachments![0].content);
    for (const s of [inv[0].invoice_number, "CH93 0076 2011 6238 5295 7", "720.00", "Zahlteil", "<svg", fam.ticket_number, "Kinder 4h", "04.01.2027, 05.01.2027"]) {
      assert(doc.includes(s), `invoice document misses ${s}`);
    }
    const cm = mails.find((m) => m.subject.startsWith("Buchungsbestätigung"))!;
    assertEquals(cm.subject, `Buchungsbestätigung - ${fam.ticket_number}`);
    const [cnt] = await sql`SELECT current_participants c, (SELECT count(*)::int FROM group_course_enrollments e WHERE e.instance_id=gi.id) n
      FROM group_course_instances gi WHERE course_id=${C1} AND date='2027-01-04' AND start_time='10:00'`;
    assertEquals(cnt.c, cnt.n); assert(cnt.n >= 3, "over planning threshold 2, still booked");
  });

  await t("lost response: identical complete returns same confirmed booking/invoice, no second invoice or mail", async () => {
    const before = sent.length;
    const c = await call(completeBody(fam, famPeople));
    cap("complete_already_confirmed", completeBody(fam, famPeople), c);
    assertEquals(c.status, 200); assertEquals(c.body.already_confirmed, true); assertEquals(c.body.status, "confirmed");
    assertEquals((await invoicesOf(fam.ticket_id)).length, 1);
    assertEquals(sent.length, before);
    const par = await Promise.all([1, 2, 3].map(() => call(completeBody(fam, famPeople))));
    assert(par.every((x) => x.status === 200 && x.body.invoice_number === c.body.invoice_number));
    assertEquals((await invoicesOf(fam.ticket_id)).length, 1); assertEquals(sent.length, before);
  });

  await t("changed complete body after confirmation rejected (bound customer/recipient)", async () => {
    const c = await call(completeBody(fam, famPeople, "attacker@example.invalid"));
    cap("complete_finalize_conflict", completeBody(fam, famPeople, "attacker@example.invalid"), c);
    assertEquals(c.status, 409); assertEquals(c.body.code, "finalize_conflict");
  });

  await t("reserve replay: same key+body same ticket; same key other body conflict", async () => {
    const body = reserveBody([kid("r")], [groupSel("r", ["2027-01-06"])]);
    const a = await call(body); const b = await call(body);
    assertEquals(a.status, 201); assertEquals(b.status, 200); assertEquals(b.body.replayed, true); assertEquals(a.body.ticket_id, b.body.ticket_id);
    const c = await call({ ...body, reservation: { ...body.reservation, selections: [groupSel("r", ["2027-01-07"])] } });
    assertEquals(c.status, 409); assertEquals(c.body.code, "idempotency_conflict");
    await call({ action: "cancel", ticket_id: a.body.ticket_id, reservation_token: a.body.reservation_token });
  });

  await t("parallel first completes of the SAME ticket: exactly one invoice, one mail per kind", async () => {
    const people = [kid("s1")];
    const r = (await call(reserveBody(people, [groupSel("s1", ["2027-01-06"])]))).body;
    const before = sent.length;
    const res = await Promise.all([1, 2, 3, 4].map(() => call(completeBody(r, people, "same@example.invalid"))));
    assert(res.some((x) => x.status === 200), JSON.stringify(res.map((x) => x.body)));
    const ok = res.filter((x) => x.status === 200);
    assertEquals(new Set(ok.map((x) => x.body.invoice_number)).size, 1);
    assertEquals((await invoicesOf(r.ticket_id)).length, 1);
    // retries of any non-200 converge
    const again = await call(completeBody(r, people, "same@example.invalid"));
    assertEquals(again.status, 200);
    assertEquals(sent.length - before, 2);
  });

  await t("concurrent completes of 10 different bookings: unique invoice numbers via production issueInvoice (no test retry)", async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => call(reserveBody([kid(`x${i}`)], [groupSel(`x${i}`, ["2027-01-07"])]))));
    assert(rs.every((r) => r.status === 201));
    const cs = await Promise.all(rs.map((r, i) => call(completeBody(r.body, [kid(`x${i}`)], `c${i}@example.invalid`))));
    assert(cs.every((c) => c.status === 200), JSON.stringify(cs.find((c) => c.status !== 200)?.body));
    assertEquals(new Set(cs.map((c) => c.body.invoice_number)).size, 10);
  });

  await t("expired hold: complete -> 410 expired, no invoice, no mail", async () => {
    const people = [kid("e")];
    const r = (await call(reserveBody(people, [groupSel("e", ["2027-01-06"])]))).body;
    await sql`UPDATE tickets SET reservation_expires_at = now() - interval '1 minute' WHERE id=${r.ticket_id}`;
    const before = sent.length;
    const c = await call(completeBody(r, people));
    cap("complete_expired", completeBody(r, people), c);
    assertEquals(c.status, 410); assertEquals(c.body.code, "expired"); assertEquals(c.body.success, false);
    assertEquals((await invoicesOf(r.ticket_id)).length, 0); assertEquals(sent.length, before);
  });

  await t("cancel: atomic release, idempotent; complete after cancel refused; cancel after confirm refused", async () => {
    const people = [kid("k")];
    const r = (await call(reserveBody(people, [groupSel("k", ["2027-01-06"])]))).body;
    const a = await call({ action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token });
    cap("cancel_success", { action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token }, a);
    assertEquals(a.status, 200); assertEquals(a.body.status, "released"); assertEquals(a.body.already_released, false);
    const b = await call({ action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token });
    cap("cancel_already_released", { action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token }, b);
    assertEquals(b.body.already_released, true);
    const [{ items }] = await sql`SELECT count(*)::int items FROM ticket_items WHERE ticket_id=${r.ticket_id} AND status<>'cancelled'`;
    assertEquals(items, 0);
    const c = await call(completeBody(r, people));
    assertEquals(c.body.success, false); assertEquals((await invoicesOf(r.ticket_id)).length, 0);
    const d = await call({ action: "cancel", ticket_id: fam.ticket_id, reservation_token: fam.reservation_token });
    cap("cancel_after_confirm", { action: "cancel", ticket_id: fam.ticket_id, reservation_token: fam.reservation_token }, d);
    assertEquals(d.status, 409); assertEquals(d.body.code, "invalid_status");
    const w = await call({ action: "cancel", ticket_id: r.ticket_id, reservation_token: "x".repeat(64) });
    assertEquals(w.status, 404);
  });

  await t("cancel vs complete race (x6): never an invoice on a released hold", async () => {
    for (let i = 0; i < 6; i++) {
      const people = [kid(`q${i}`)];
      const r = (await call(reserveBody(people, [groupSel(`q${i}`, ["2027-01-05"])]))).body;
      const [c, x] = await Promise.all([call(completeBody(r, people, `race${i}@example.invalid`)), call({ action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token })]);
      const [{ state }] = await sql`SELECT state FROM bc_2627_reservations WHERE ticket_id=${r.ticket_id}`;
      const inv = await invoicesOf(r.ticket_id);
      if (state === "released") { assertEquals(inv.length, 0); assertEquals(c.body.success, false); assertEquals(x.status, 200); }
      else { assertEquals(state, "confirmed"); assertEquals(inv.length, 1); assertEquals(x.status, 409); assertEquals(c.status, 200); }
    }
  });

  await t("missing payment profile: 503 retryable, no invoice/mail; identical retry after config fix -> exactly one invoice", async () => {
    const people = [kid("p")];
    const r = (await call(reserveBody(people, [groupSel("p", ["2027-01-06"])]))).body;
    await sql`UPDATE payment_profiles SET is_active=false, is_default=false`;
    const before = sent.length;
    const c = await call(completeBody(r, people));
    cap("complete_invoice_issue_failed", completeBody(r, people), c);
    assertEquals(c.status, 503); assertEquals(c.body.code, "invoice_issue_failed"); assertEquals(c.body.retryable, true);
    assertEquals((await invoicesOf(r.ticket_id)).length, 0); assertEquals(sent.length, before);
    // hold passed the point of no return: expiry/cancel cannot release it now
    await sql`UPDATE tickets SET reservation_expires_at = now() - interval '1 minute' WHERE id=${r.ticket_id}`;
    await sql`SELECT bc_2627_release_expired()`;
    assertEquals((await call({ action: "cancel", ticket_id: r.ticket_id, reservation_token: r.reservation_token })).status, 409);
    await sql`UPDATE payment_profiles SET is_active=true, is_default=true`;
    const c2 = await call(completeBody(r, people));
    assertEquals(c2.status, 200, JSON.stringify(c2.body)); assertEquals((await invoicesOf(r.ticket_id)).length, 1);
  });

  let failedRow: Record<string, any> = {};
  await t("provider rejection: booking confirmed, delivery failed visibly; staff resend with new provider key", async () => {
    const people = [kid("f")];
    const r = (await call(reserveBody(people, [groupSel("f", ["2027-01-06"])]))).body;
    mode = "fail";
    const c = await call(completeBody(r, people, "fail@example.invalid"));
    mode = "ok";
    cap("complete_delivery_failed", completeBody(r, people, "fail@example.invalid"), c);
    assertEquals(c.status, 200); assertEquals(c.body.delivery, { invoice: "failed", booking_confirmation: "failed" });
    const rows = await deliveriesOf(r.ticket_id);
    assertEquals(rows.map((x) => x.status), ["failed", "failed"]); assert(rows.every((x) => x.last_error_code === "provider_error"));
    failedRow = rows.find((x) => x.kind === "invoice")!;
    assertEquals((await staffCall({ action: "retry", delivery_id: failedRow.id }, "Bearer nobody")).status, 401);
    const s = await staffCall({ action: "retry", delivery_id: failedRow.id });
    assertEquals(s.status, 200); assertEquals(s.body.status, "sent");
    const [row] = await sql`SELECT * FROM booking_email_deliveries WHERE id=${failedRow.id}`;
    assertEquals(row.status, "sent"); assertEquals(row.provider_idempotency_key, `${row.idempotency_key}:a2`);
    assertEquals(sent.at(-1)!.idempotencyKey, `${row.idempotency_key}:a2`);
    assertEquals((await staffCall({ action: "retry", delivery_id: failedRow.id })).status, 409);
    const [{ h }] = await sql`SELECT count(*)::int h FROM ticket_history WHERE ticket_id=${r.ticket_id} AND event_type='email_resend'`;
    assertEquals(h, 1);
  });

  await t("missing sender config: delivery fails 'sender_not_configured', nothing handed to transport", async () => {
    await sql`UPDATE school_settings SET email=NULL`;
    const people = [kid("g")];
    const r = (await call(reserveBody(people, [groupSel("g", ["2027-01-06"])]))).body;
    const before = sent.length;
    const c = await call(completeBody(r, people, "nosender@example.invalid"));
    await sql`UPDATE school_settings SET email='info@example.invalid'`;
    assertEquals(c.status, 200); assertEquals(sent.length, before);
    const rows = await deliveriesOf(r.ticket_id);
    assert(rows.every((x) => x.status === "failed" && x.last_error_code === "sender_not_configured"));
  });

  await t("missing QR snapshot: invoice delivery fails 'payment_details_missing' (no amount-only mail)", async () => {
    const people = [kid("h")];
    const r = (await call(reserveBody(people, [groupSel("h", ["2027-01-06"])]))).body;
    mode = "fail"; await call(completeBody(r, people, "noqr@example.invalid")); mode = "ok";
    await sql`UPDATE invoices SET payment_snapshot = payment_snapshot - 'qr_payload' WHERE ticket_id=${r.ticket_id}`;
    const row = (await deliveriesOf(r.ticket_id)).find((x) => x.kind === "invoice")!;
    const before = sent.length;
    const s = await staffCall({ action: "retry", delivery_id: row.id });
    assertEquals(s.body.code, "payment_details_missing"); assertEquals(sent.length, before);
  });

  await t("network failure (unknown outcome): resend within 24h reuses provider key; stuck 'sending' recovery; >24h needs force", async () => {
    const people = [kid("n")];
    const r = (await call(reserveBody(people, [groupSel("n", ["2027-01-06"])]))).body;
    mode = "throw";
    const c = await call(completeBody(r, people, "net@example.invalid"));
    mode = "ok";
    assertEquals(c.status, 200);
    const inv = (await deliveriesOf(r.ticket_id)).find((x) => x.kind === "invoice")!;
    assertEquals(inv.last_error_code, "transport_unknown");
    clock = Date.now();
    const s = await staffCall({ action: "retry", delivery_id: inv.id });
    assertEquals(s.body.status, "sent"); assertEquals(sent.at(-1)!.idempotencyKey, inv.idempotency_key);

    const conf = (await deliveriesOf(r.ticket_id)).find((x) => x.kind === "booking_confirmation")!;
    // simulate a crash while sending: stuck past the lease, first claim 1h ago -> same key resend
    await sql`UPDATE booking_email_deliveries SET status='sending', claimed_at=now()-interval '20 minutes', first_claimed_at=now()-interval '1 hour' WHERE id=${conf.id}`;
    clock = Date.now();
    const rec = await staffCall({ action: "recover_stuck" });
    assertEquals(rec.body.recovered.find((x: any) => x.id === conf.id).outcome, "sent");
    assertEquals(sent.at(-1)!.idempotencyKey, conf.provider_idempotency_key ?? conf.idempotency_key);
    // stuck beyond provider dedupe window -> needs review, then explicit force -> new key
    await sql`UPDATE booking_email_deliveries SET status='sending', provider_message_id=NULL, claimed_at=now()-interval '25 hours', first_claimed_at=now()-interval '25 hours' WHERE id=${conf.id}`;
    const rec2 = await staffCall({ action: "recover_stuck" });
    assertEquals(rec2.body.recovered.find((x: any) => x.id === conf.id).outcome, "needs_review");
    const nf = await staffCall({ action: "retry", delivery_id: conf.id });
    assertEquals(nf.status, 409); assertEquals(nf.body.error, "unknown_outcome_requires_force");
    const f = await staffCall({ action: "retry", delivery_id: conf.id, force: true });
    assertEquals(f.body.status, "sent"); assertNotEquals(sent.at(-1)!.idempotencyKey, conf.idempotency_key);
    // stuck with known provider id -> reconciled without resend
    await sql`UPDATE booking_email_deliveries SET status='sending', provider_message_id='mock-x', claimed_at=now()-interval '20 minutes' WHERE id=${conf.id}`;
    const before = sent.length;
    const rec3 = await staffCall({ action: "recover_stuck" });
    assertEquals(rec3.body.recovered.find((x: any) => x.id === conf.id).outcome, "reconciled_sent"); assertEquals(sent.length, before);
  });

  await t("private lesson via API: native appointments + participants + billing line; one invoice", async () => {
    const people = [kid("v1"), kid("v2")];
    const r = await call(reserveBody(people, [{ kind: "private", product_id: PRIV, participant_refs: ["v1", "v2"], items: [{ date: "2027-01-20", time_start: "10:00", time_end: "11:00" }] }]));
    assertEquals(r.status, 201, JSON.stringify(r.body));
    const c = await call(completeBody(r.body, people, "priv@example.invalid"));
    assertEquals(c.status, 200, JSON.stringify(c.body));
    const [a] = await sql`SELECT pa.id, (SELECT count(*)::int FROM private_appointment_participants p WHERE p.appointment_id=pa.id) n,
      (SELECT count(*)::int FROM ticket_items ti WHERE ti.appointment_id=pa.id) li FROM private_appointments pa WHERE ticket_id=${r.body.ticket_id}`;
    assertEquals(a.n, 2); assertEquals(a.li, 1); assertEquals((await invoicesOf(r.body.ticket_id)).length, 1);
  });

  await t("Saturday series via API (exact block id) books and invoices", async () => {
    const people = [kid("sa")];
    const r = await call(reserveBody(people, [{ kind: "group", participant_ref: "sa", period_key: SA, product_id: SAT, dates: ["2027-01-09", "2027-01-16", "2027-01-23", "2027-02-06"], blocks: ["10:00-12:00"] }]));
    assertEquals(r.status, 201, JSON.stringify(r.body)); assertEquals(r.body.total_amount, 240);
    assertEquals((await call(completeBody(r.body, people, "sat@example.invalid"))).status, 200);
  });

  await t("invalid block ids rejected", async () => {
    const r = await call(reserveBody([kid("bb")], [{ ...groupSel("bb"), blocks: ["10:00-12:00"] }]));
    assertEquals(r.status, 400); assertEquals(r.body.code, "invalid_selection");
  });
  if (Deno.env.get("BC_WRITE_FIXTURES") === "1") {
    const dir = new URL("supabase/functions/course-booking/fixtures/", root);
    await Deno.mkdir(dir, { recursive: true });
    for (const [k, v] of Object.entries(fx)) await Deno.writeTextFile(new URL(`${k}.json`, dir), JSON.stringify(v, null, 2) + "\n");
    results.push(`info wrote ${Object.keys(fx).length} fixtures`);
  }
} finally {
  console.log(results.join("\n"));
  console.log(`${passed}/${results.length} passed`);
  try { rest?.kill("SIGTERM"); await rest?.status; } catch { /* ignore */ }
  await sql.end();
  await psql(adminUrl, ["-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]).catch(() => {});
}
