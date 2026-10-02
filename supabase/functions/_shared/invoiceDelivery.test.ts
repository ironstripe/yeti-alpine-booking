// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/invoiceDelivery.test.ts
// Resend, the QR renderer and the database are simulated: no real mail, no DB.
import {
  attemptInvoiceDelivery,
  buildInvoiceVars,
  invoiceDeliveryKey,
  INVOICE_QR_VAR,
} from "./invoiceDelivery.ts";
import { generateQRReference, type PaymentSnapshot } from "./payment-domain.ts";

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

// ---------- In-memory fake (same shape as the bookingDelivery test) ----------
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (name: string) => {
    tables[name] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    let limit = Infinity;
    const matches = () => tables[name].filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (op === "insert" || op === "upsert") return inserted;
      const rows = matches().slice(0, limit);
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
        inserted = [{ id: `${name}-${++seq}`, ...p }];
        tables[name].push(...inserted);
        return b;
      },
      upsert: (p: Row) => {
        op = "upsert";
        const key = p.idempotency_key;
        const existing = tables[name].find((r) => r.idempotency_key === key);
        inserted = existing ? [] : [{ id: `${name}-${++seq}`, ...p }];
        if (!existing) tables[name].push(...inserted);
        return b;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
    };
    return b;
  };
  return { from };
}

const SNAPSHOT: PaymentSnapshot = {
  profile_id: "p1",
  profile_name: "Bank",
  bank_name: null,
  account_holder: "Schneesportschule Malbun AG",
  account_holder_address: { street: "Dorfstrasse", houseNumber: "12", zip: "9497", city: "Malbun", country: "LI" },
  iban: "LI21088100000000000000",
  iban_formatted: "LI21 0881 0000 0000 0000 00",
  bic_swift: null,
  account_type: "qr_iban",
  currency: "CHF",
  reference_type: "QRR",
  reference: generateQRReference("R-2026-00042"),
  country_scope: "CH_LI",
  presentation_type: "swiss_qr",
  payment_message: "Rechnung R-2026-00042",
  due_date: "2026-10-14",
  payload_version: "0200",
  qr_payload: "SPC\r\n0200\r\n1\r\nLI21088100000000000000",
  snapshot_created_at: "2026-09-30T20:00:00.000Z",
};

const TEMPLATE = {
  id: "tpl-inv",
  trigger: "invoice.created",
  is_active: true,
  subject: "Rechnung {{invoice.number}} - {{school.name}}",
  body_html:
    "<p>Hallo {{customer.first_name}} {{customer.last_name}}</p><p>CHF {{invoice.total}} bis {{invoice.due_date}}</p>{{invoice.qr_payment_part}}",
  body_text: null,
};

function setup(opts: { status?: string; template?: Row | null; invoiceStatus?: string; snapshot?: Row | null } = {}) {
  const invoiceId = "inv-1";
  const tables: Record<string, Row[]> = {
    booking_email_deliveries: [
      {
        id: "d1",
        ticket_id: "t1",
        kind: "invoice",
        recipient_email: "gast@example.test",
        idempotency_key: invoiceDeliveryKey(invoiceId),
        status: opts.status ?? "pending",
        attempts: 0,
      },
    ],
    email_templates: opts.template === null ? [] : [opts.template ?? { ...TEMPLATE }],
    invoices: [
      {
        id: invoiceId,
        invoice_number: "R-2026-00042",
        ticket_id: "t1",
        customer_id: "c1",
        total: 1250.5,
        currency: "CHF",
        due_date: "2026-10-14",
        status: opts.invoiceStatus ?? "open",
        payment_snapshot: opts.snapshot === undefined ? SNAPSHOT : opts.snapshot,
      },
    ],
    tickets: [{ id: "t1", ticket_number: "T-100", customer_id: "c1" }],
    customers: [{ id: "c1", first_name: "Anna", last_name: "Muster", salutation: "Frau", zip: "9494", city: "Schaan" }],
    school_settings: [{ id: "s1", name: "Schneesportschule Malbun" }],
    email_logs: [],
  };
  return { tables, sb: fakeDb(tables), d: () => tables.booking_email_deliveries[0] };
}

const qrStub = async (payload: string) => `data:image/png;base64,QR(${payload.length})`;

async function withResend(
  status: number,
  body: Row,
  fn: (calls: { headers: Headers; body: Row }[]) => Promise<void>,
) {
  const orig = globalThis.fetch;
  const calls: { headers: Headers; body: Row }[] = [];
  Deno.env.set("RESEND_API_KEY", "test-dummy");
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!String(url).startsWith("https://api.resend.com/")) throw new Error("unexpected fetch " + url);
    calls.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

Deno.test("vars use the documented flat placeholder names", () => {
  const ctx = {
    invoice: {
      id: "inv-1",
      invoice_number: "R-2026-00042",
      ticket_id: "t1",
      customer_id: "c1",
      total: 1250.5,
      currency: "CHF",
      due_date: "2026-10-14",
      status: "open",
      payment_snapshot: SNAPSHOT,
    },
    ticket_number: "T-100",
    first_name: "Anna",
    last_name: "Muster",
    salutation: "Frau",
    school_name: "Schneesportschule Malbun",
    debtor: { name: "Anna Muster" },
  };
  const vars = buildInvoiceVars(ctx, "<div>part</div>");
  eq(vars["invoice.number"], "R-2026-00042");
  eq(vars["invoice.currency"], "CHF");
  eq(vars["invoice.due_date"], "14.10.2026");
  eq(vars[INVOICE_QR_VAR], "<div>part</div>");
  if (!/1\s?250\.50/.test(vars["invoice.total"])) throw new Error("amount not formatted: " + vars["invoice.total"]);
});

Deno.test("invoice mail is sent once with the QR part and an attachment", async () => {
  const { sb, d, tables } = setup();
  await withResend(200, { id: "re_inv" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }), "sent");
    eq(calls.length, 1);
    eq(calls[0].headers.get("Idempotency-Key"), "invoice:inv-1:invoice_created");
    eq(calls[0].body.to, ["gast@example.test"]);
    eq(calls[0].body.subject, "Rechnung R-2026-00042 - Schneesportschule Malbun");
    const html = String(calls[0].body.html);
    if (!html.includes("data:image/png;base64,QR(")) throw new Error("QR image missing in mail");
    if (html.includes("{{")) throw new Error("unresolved placeholder in mail");
    if (!html.includes("Zahlteil")) throw new Error("payment part missing");
    const att = calls[0].body.attachments as { filename: string; content: string }[];
    eq(att.length, 1);
    eq(att[0].filename, "QR-Rechnung-R-2026-00042.png");
    eq(d().status, "sent");
    eq(tables.invoices[0].sent_at != null, true);
    eq(tables.email_logs[0].status, "sent");
  });
});

Deno.test("automatic path never retries a failed invoice", async () => {
  const { sb, d } = setup();
  await withResend(422, { message: "bad" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }), "failed");
    eq(d().last_error_code, "provider_error");
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }), "not_claimed");
    eq(calls.length, 1);
  });
});

Deno.test("missing template or paid invoice fails without sending", async () => {
  const missing = setup({ template: null });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(missing.sb, "d1", { renderQr: qrStub }), "failed");
    eq(missing.d().last_error_code, "template_missing");
    eq(calls.length, 0);
  });

  const paid = setup({ invoiceStatus: "paid" });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(paid.sb, "d1", { renderQr: qrStub }), "failed");
    eq(paid.d().last_error_code, "invoice_not_open");
    eq(calls.length, 0);
  });
});

Deno.test("missing payment snapshot fails instead of sending an incomplete invoice", async () => {
  const { sb, d } = setup({ snapshot: null });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }), "failed");
    eq(d().last_error_code, "payment_snapshot_missing");
    eq(calls.length, 0);
  });
});

Deno.test("unknown placeholder fails before any mail is sent", async () => {
  const { sb, d } = setup({
    template: { ...TEMPLATE, body_html: "<p>{{invoice.not_a_field}}</p>{{invoice.qr_payment_part}}" },
  });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }), "failed");
    eq(d().last_error_code, "template_unknown_variable");
    eq(calls.length, 0);
  });
});

Deno.test("failing QR renderer fails the delivery, no attachment-less mail", async () => {
  const { sb, d } = setup();
  const broken = async () => {
    throw new Error("encoder down");
  };
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sb, "d1", { renderQr: broken }), "failed");
    eq(d().last_error_code, "qr_render_failed");
    eq(calls.length, 0);
  });
});

Deno.test("concurrent attempts send exactly once", async () => {
  const { sb } = setup();
  await withResend(200, { id: "re_1" }, async (calls) => {
    const results = await Promise.all([
      attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }),
      attemptInvoiceDelivery(sb, "d1", { renderQr: qrStub }),
    ]);
    eq(results.sort(), ["not_claimed", "sent"]);
    eq(calls.length, 1);
  });
});

Deno.test("manual retry is allowed for a failed delivery only", async () => {
  const failed = setup({ status: "failed" });
  await withResend(200, { id: "re_2" }, async (calls) => {
    eq(await attemptInvoiceDelivery(failed.sb, "d1", { manual: true, renderQr: qrStub }), "sent");
    eq(failed.d().status, "sent");
    eq(calls.length, 1);
  });

  const sent = setup({ status: "sent" });
  await withResend(200, { id: "x" }, async (calls) => {
    eq(await attemptInvoiceDelivery(sent.sb, "d1", { manual: true, renderQr: qrStub }), "not_claimed");
    eq(calls.length, 0);
  });
});