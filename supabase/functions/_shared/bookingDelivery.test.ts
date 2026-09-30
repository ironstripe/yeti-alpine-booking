// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/bookingDelivery.test.ts
// Resend and the database are simulated in memory: no real email, no real DB.
import { attemptConfirmation, confirmationKey, fillTemplate, placeholders } from "./bookingDelivery.ts";
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

Deno.test("fills flat vars with HTML escaping", () => {
  const r = fillTemplate("<p>{{ ticket_number }} {{customer_last_name}}</p>", { ticket_number: "T-1", customer_last_name: "<b>&" }, true);
  eq(r.text, "<p>T-1 &lt;b&gt;&amp;</p>"); eq(r.unknown, []);
});
Deno.test("plain text is not escaped", () => {
  eq(fillTemplate("{{a}}", { a: "<x>" }, false).text, "<x>");
});
Deno.test("unknown placeholders are reported, not dropped", () => {
  const r = fillTemplate("{{a}} {{invoice.number}}", { a: "1" }, true);
  eq(r.unknown, ["invoice.number"]); eq(r.text, "1 {{invoice.number}}");
});
Deno.test("placeholders deduplicated", () => eq(placeholders("{{a}}{{ a }}{{b}}"), ["a", "b"]));
Deno.test("idempotency key is stable per ticket", () =>
  eq(confirmationKey("abc"), "ticket:abc:booking_confirmation"));

// ---------- In-memory fakes ----------
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    let limit = Infinity;
    const run = () => {
      if (op === "insert") return inserted;
      const rows = tables[name].filter((r) => filters.every((f) => f(r))).slice(0, limit);
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      return rows;
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      order: () => b,
      limit: (n: number) => ((limit = n), b),
      update: (p: Row) => ((op = "update"), (patch = p), b),
      insert: (p: Row) => {
        op = "insert";
        inserted = [{ id: `log-${++seq}`, ...p }];
        tables[name].push(...inserted);
        return b;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null }),
      single: async () => ({ data: run()[0] ?? null }),
      then: (res: (v: unknown) => unknown) => res({ data: run() }),
    };
    return b;
  };
  return { from };
}

const TPL = { id: "tpl-1", trigger: "booking.confirmed", is_active: true, subject: "Bestätigung {{ticket_number}}", body_html: "<p>Hallo {{customer_last_name}}, {{product_name}} am {{booking_date}}</p>", body_text: null };
function setup(opts: { status?: string; template?: Row | null } = {}) {
  const tables: Record<string, Row[]> = {
    booking_email_deliveries: [{ id: "d1", ticket_id: "t1", recipient_email: "gast@example.test", idempotency_key: confirmationKey("t1"), status: opts.status ?? "pending", attempts: 0 }],
    email_templates: opts.template === null ? [] : [opts.template ?? { ...TPL }],
    tickets: [{ id: "t1", ticket_number: "T-100", customer: { last_name: "Muster" } }],
    ticket_items: [{ ticket_id: "t1", date: "2027-01-10", time_start: "10:00:00", time_end: "12:00:00", meeting_point: "Talstation", product: { name: "Privatlektion" } }],
    email_logs: [],
  };
  return { tables, sb: fakeDb(tables), d: () => tables.booking_email_deliveries[0] };
}
async function withResend(status: number, body: Row, fn: (calls: { headers: Headers; body: any }[]) => Promise<void>) {
  const orig = globalThis.fetch;
  const calls: { headers: Headers; body: any }[] = [];
  Deno.env.set("RESEND_API_KEY", "test-dummy");
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!String(url).startsWith("https://api.resend.com/")) throw new Error("unexpected fetch " + url);
    calls.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  try { await fn(calls); } finally { globalThis.fetch = orig; }
}

Deno.test("delivery: success sends exactly once with idempotency key", async () => {
  const { sb, d, tables } = setup();
  await withResend(200, { id: "re_1" }, async (calls) => {
    eq(await attemptConfirmation(sb, "d1"), "sent");
    eq(calls.length, 1);
    eq(calls[0].headers.get("Idempotency-Key"), "ticket:t1:booking_confirmation");
    eq(calls[0].body.to, ["gast@example.test"]);
    eq(calls[0].body.subject, "Bestätigung T-100");
    eq([d().status, d().provider_message_id, d().attempts], ["sent", "re_1", 1]);
    eq(tables.email_logs[0].status, "sent");
  });
});

Deno.test("delivery: provider error is recorded as failed, no automatic retry", async () => {
  const { sb, d } = setup();
  await withResend(422, { message: "bad" }, async (calls) => {
    eq(await attemptConfirmation(sb, "d1"), "failed");
    eq([d().status, d().last_error_code], ["failed", "provider_error"]);
    eq(await attemptConfirmation(sb, "d1"), "not_claimed"); // automatic path does not retry failed
    eq(calls.length, 1);
  });
});

Deno.test("delivery: missing or inactive template fails without sending", async () => {
  for (const template of [null, { ...TPL, is_active: false }]) {
    const { sb, d } = setup({ template });
    await withResend(200, { id: "x" }, async (calls) => {
      eq(await attemptConfirmation(sb, "d1"), "failed");
      eq(d().last_error_code, "template_missing");
      eq(calls.length, 0);
    });
  }
});

Deno.test("delivery: concurrent calls send only once", async () => {
  const { sb } = setup();
  await withResend(200, { id: "re_2" }, async (calls) => {
    const r = await Promise.all([attemptConfirmation(sb, "d1"), attemptConfirmation(sb, "d1")]);
    eq(r.sort(), ["not_claimed", "sent"]);
    eq(calls.length, 1);
  });
});

Deno.test("delivery: already sent is never resent (auto or manual)", async () => {
  const { sb } = setup({ status: "sent" });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptConfirmation(sb, "d1"), "not_claimed");
    eq(await attemptConfirmation(sb, "d1", { manual: true }), "not_claimed");
    eq(calls.length, 0);
  });
});

Deno.test("delivery: email contains no payment details", async () => {
  const { sb } = setup();
  await withResend(200, { id: "re_3" }, async (calls) => {
    await attemptConfirmation(sb, "d1");
    const all = JSON.stringify(calls[0].body).toLowerCase();
    for (const w of ["iban", "qr", "konto", "überweisung", "zahlungslink", "payment link", "attachments"]) {
      if (all.includes(w)) throw new Error(`payment word found: ${w}`);
    }
  });
});
