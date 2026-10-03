/**
 * Durable e-mail delivery for 26/27 website course bookings (#36):
 *   - booking_confirmation: existing active `booking.confirmed` template
 *   - invoice: existing active `invoice.created` template + the full invoice
 *     document with Swiss QR payment part as attachment (invoiceDocument.ts)
 * Sender comes from configuration (school_settings name + email); if it, the
 * template or the payment details are missing the row fails VISIBLY with a
 * code and nothing is sent.
 *
 * Exactly one row per ticket+kind (booking_email_deliveries.idempotency_key).
 * Claims are optimistic (attempts counter) and leased (claimed_at). States:
 *   pending -> sending -> sent | failed
 * Recovery of a row stuck in `sending` past the lease:
 *   - provider_message_id known          -> sent (reconciled)
 *   - first claim < 24h ago              -> resend with the SAME provider key
 *                                           (provider dedupes for 24h)
 *   - first claim >= 24h ago             -> failed/unknown_outcome; only an
 *                                           explicit staff `force` resends,
 *                                           under a NEW key.
 * A known provider rejection (not sent) is retried with a new key.
 * Transport is injected; tests never send real e-mail.
 */
import { activeConfirmationTemplate, buildVars, fillTemplate } from "./bookingDelivery.ts";
import { renderInvoiceDocument } from "./invoiceDocument.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export type DeliveryKind = "booking_confirmation" | "invoice";
export const INVOICE_TRIGGER = "invoice.created";
export const LEASE_MS = 10 * 60 * 1000;
export const PROVIDER_DEDUPE_MS = 24 * 60 * 60 * 1000;

export interface Mail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
  idempotencyKey: string;
}
export type TransportResult = { ok: true; id: string } | { ok: false; error: string; status?: number };
export type Transport = (mail: Mail) => Promise<TransportResult>;

export const deliveryKey = (ticketId: string, kind: DeliveryKind) => `ticket:${ticketId}:${kind}`;

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const resendTransport: Transport = async (mail) => {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY fehlt", status: 0 };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Idempotency-Key": mail.idempotencyKey },
    body: JSON.stringify({
      from: mail.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text ?? undefined,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, content_type: a.content_type })),
    }),
  });
  const out = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, id: String(out.id ?? "") } : { ok: false, error: String(out?.message ?? res.status), status: res.status };
};

export async function resolveSender(sb: Client): Promise<string | null> {
  const { data } = await sb.from("school_settings").select("name, email").order("created_at", { ascending: true }).limit(1);
  const s = data?.[0];
  const email = s?.email?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const name = (s?.name ?? "").replace(/[<>"\r\n]/g, "").trim();
  return name ? `${name} <${email}>` : email;
}

export async function ensureDelivery(sb: Client, ticketId: string, kind: DeliveryKind, email: string) {
  const key = deliveryKey(ticketId, kind);
  const { error } = await sb.from("booking_email_deliveries").upsert(
    { ticket_id: ticketId, kind, idempotency_key: key, recipient_email: email },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`delivery upsert failed: ${error.message}`);
  const { data } = await sb.from("booking_email_deliveries").select("*").eq("idempotency_key", key).maybeSingle();
  return data as DeliveryRow | null;
}

export interface DeliveryRow {
  id: string; ticket_id: string; kind: DeliveryKind; idempotency_key: string; recipient_email: string;
  status: string; attempts: number; claimed_at: string | null; first_claimed_at: string | null;
  provider_idempotency_key: string | null; provider_message_id: string | null; last_error_code: string | null;
}

export type AttemptMode = "auto" | "manual" | "recover";
export type AttemptOutcome =
  | "sent" | "failed" | "not_claimed" | "not_found" | "already_sent" | "needs_review" | "reconciled_sent";

export async function attemptDelivery(
  sb: Client,
  deliveryId: string,
  transport: Transport,
  opts: { mode: AttemptMode; force?: boolean; now?: () => number } = { mode: "auto" },
): Promise<{ outcome: AttemptOutcome; code?: string }> {
  const now = opts.now ?? Date.now;
  const { data: cur } = await sb.from("booking_email_deliveries").select("*").eq("id", deliveryId).maybeSingle();
  if (!cur) return { outcome: "not_found" };
  const row = cur as DeliveryRow;
  if (row.status === "sent") return { outcome: "already_sent" };

  const t = now();
  const firstAge = row.first_claimed_at ? t - Date.parse(row.first_claimed_at) : 0;
  let providerKey = row.provider_idempotency_key ?? row.idempotency_key;
  let firstClaimed = row.first_claimed_at;

  if (opts.mode === "auto" && row.status !== "pending") return { outcome: "not_claimed" };
  if (opts.mode === "recover") {
    if (row.status !== "sending" || !row.claimed_at || t - Date.parse(row.claimed_at) < LEASE_MS) return { outcome: "not_claimed" };
    if (row.provider_message_id) {
      const { data } = await sb.from("booking_email_deliveries").update({ status: "sent", sent_at: new Date(t).toISOString() })
        .eq("id", row.id).eq("attempts", row.attempts).eq("status", "sending").select("id").maybeSingle();
      return { outcome: data ? "reconciled_sent" : "not_claimed" };
    }
    if (firstAge >= PROVIDER_DEDUPE_MS) {
      await sb.from("booking_email_deliveries").update({
        status: "failed", last_error_code: "unknown_outcome",
        last_error: "Versandstatus unbekannt und Anbieter-Deduplizierung (24h) abgelaufen – manuelle Prüfung nötig",
      }).eq("id", row.id).eq("attempts", row.attempts).eq("status", "sending");
      return { outcome: "needs_review", code: "unknown_outcome" };
    }
    // same provider key within the dedupe window
  }
  if (opts.mode === "manual") {
    if (row.status !== "failed") return { outcome: "not_claimed" };
    const unknown = row.last_error_code === "unknown_outcome" || row.last_error_code === "transport_unknown";
    if (unknown && firstAge >= PROVIDER_DEDUPE_MS && !opts.force) return { outcome: "needs_review", code: "unknown_outcome" };
    if (!unknown || firstAge >= PROVIDER_DEDUPE_MS) {
      // Known not-sent (or explicitly forced after the window): new provider key.
      providerKey = `${row.idempotency_key}:a${row.attempts + 1}`;
      firstClaimed = null;
    }
  }

  const fromStatus = opts.mode === "auto" ? "pending" : opts.mode === "manual" ? "failed" : "sending";
  const stamp = new Date(t).toISOString();
  const { data: claimed } = await sb.from("booking_email_deliveries").update({
    status: "sending", attempts: row.attempts + 1, claimed_at: stamp,
    first_claimed_at: firstClaimed ?? stamp, provider_idempotency_key: providerKey,
  }).eq("id", row.id).eq("attempts", row.attempts).eq("status", fromStatus).select("*").maybeSingle();
  if (!claimed) return { outcome: "not_claimed" };

  const fail = async (code: string, message: string, extra: Record<string, unknown> = {}) => {
    await sb.from("booking_email_deliveries").update({ status: "failed", last_error_code: code, last_error: message.slice(0, 500), ...extra })
      .eq("id", row.id).eq("attempts", row.attempts + 1);
    return { outcome: "failed" as const, code };
  };

  let logId: string | null = null;
  try {
    const sender = await resolveSender(sb);
    if (!sender) return await fail("sender_not_configured", "Absender (Schul-E-Mail in den Einstellungen) fehlt");
    const content = row.kind === "invoice" ? await invoiceContent(sb, row.ticket_id) : await confirmationContent(sb, row.ticket_id);
    if (!content.ok) return await fail(content.code, content.message, content.templateId ? { template_id: content.templateId } : {});

    const { data: log } = await sb.from("email_logs").insert({
      template_id: content.templateId, recipient_email: row.recipient_email, subject: content.subject, status: "queued",
      delivery_id: row.id, metadata: { ticket_id: row.ticket_id, kind: row.kind, invoice_id: content.invoiceId ?? null },
    }).select("id").single();
    logId = log?.id ?? null;

    let r: TransportResult;
    try {
      r = await transport({ from: sender, to: row.recipient_email, subject: content.subject, html: content.html, text: content.text,
        attachments: content.attachments, idempotencyKey: providerKey });
    } catch (e) {
      // Outcome unknown (network): keep the provider key so a retry within 24h is deduplicated.
      if (logId) await sb.from("email_logs").update({ status: "failed", error_message: String(e).slice(0, 500) }).eq("id", logId);
      return await fail("transport_unknown", e instanceof Error ? e.message : String(e), { template_id: content.templateId, email_log_id: logId });
    }
    if (!r.ok) {
      if (logId) await sb.from("email_logs").update({ status: "failed", error_message: r.error }).eq("id", logId);
      return await fail("provider_error", r.error, { template_id: content.templateId, email_log_id: logId });
    }
    const sentAt = new Date(now()).toISOString();
    if (logId) await sb.from("email_logs").update({ status: "sent", sent_at: sentAt, provider_message_id: r.id }).eq("id", logId);
    await sb.from("booking_email_deliveries").update({
      status: "sent", sent_at: sentAt, provider_message_id: r.id || null, template_id: content.templateId,
      email_log_id: logId, last_error_code: null, last_error: null,
    }).eq("id", row.id);
    return { outcome: "sent" };
  } catch (e) {
    return await fail("exception", e instanceof Error ? e.message : String(e), { email_log_id: logId });
  }
}

type Content =
  | { ok: true; templateId: string; subject: string; html: string; text: string | null; attachments?: Mail["attachments"]; invoiceId?: string }
  | { ok: false; code: string; message: string; templateId?: string };

function fill(tpl: { id: string; subject: string; body_html: string; body_text: string | null }, vars: Record<string, string>): Content {
  const subj = fillTemplate(tpl.subject, vars, false);
  const html = fillTemplate(tpl.body_html, vars, true);
  const text = tpl.body_text ? fillTemplate(tpl.body_text, vars, false) : null;
  const unknown = [...new Set([...subj.unknown, ...html.unknown, ...(text?.unknown ?? [])])];
  if (unknown.length) return { ok: false, code: "template_unknown_variable", message: `Unbekannte Platzhalter: ${unknown.join(", ")}`, templateId: tpl.id };
  return { ok: true, templateId: tpl.id, subject: subj.text.replace(/[\r\n]+/g, " "), html: html.text, text: text?.text ?? null };
}

async function confirmationContent(sb: Client, ticketId: string): Promise<Content> {
  const tpl = await activeConfirmationTemplate(sb);
  if (!tpl) return { ok: false, code: "template_missing", message: "Vorlage booking.confirmed fehlt oder ist inaktiv" };
  return fill(tpl, await buildVars(sb, ticketId, ""));
}

const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

async function invoiceContent(sb: Client, ticketId: string): Promise<Content> {
  const { data: tpl } = await sb.from("email_templates").select("id, subject, body_html, body_text")
    .eq("trigger", INVOICE_TRIGGER).eq("is_active", true).maybeSingle();
  if (!tpl) return { ok: false, code: "template_missing", message: "Vorlage invoice.created fehlt oder ist inaktiv" };

  const { data: invoices } = await sb.from("invoices").select("*").eq("ticket_id", ticketId).eq("status", "open");
  if ((invoices?.length ?? 0) !== 1) return { ok: false, code: "invoice_missing", message: `${invoices?.length ?? 0} offene Rechnungen` };
  const inv = invoices[0];
  const { data: t } = await sb.from("tickets").select("ticket_number, customer_id").eq("id", ticketId).maybeSingle();
  const { data: c } = await sb.from("customers").select("first_name, last_name, street, house_number, zip, city")
    .eq("id", inv.customer_id ?? t?.customer_id).maybeSingle();
  const { data: school } = await sb.from("school_settings").select("name, phone, email, website, vat_number")
    .order("created_at", { ascending: true }).limit(1);
  const { data: items } = await sb.from("ticket_items")
    .select("id, date, end_date, time_start, time_end, line_total, group_name, item_type, product:products(name)")
    .eq("ticket_id", ticketId).neq("status", "cancelled").order("date").order("time_start");
  const { data: resv } = await sb.from("bc_2627_reservations").select("quote_snapshot").eq("ticket_id", ticketId).maybeSingle();
  const lines = (items ?? []).map((it: Record<string, any>) => {
    const qline = (resv?.quote_snapshot?.lines ?? []).find((l: any) => (l.ticket_item_ids ?? []).includes(it.id));
    const when = qline?.dates ? (qline.dates as string[]).map(fmtDate).join(", ") : fmtDate(it.date);
    const time = qline?.blocks ? (qline.blocks as string[]).join(" + ") : `${String(it.time_start ?? "").slice(0, 5)}–${String(it.time_end ?? "").slice(0, 5)}`;
    return { description: it.product?.name ?? it.group_name ?? "Leistung", details: `${when} · ${time}`, amount: Number(it.line_total) };
  });

  const doc = await renderInvoiceDocument({
    invoice: inv, school: school?.[0] ?? { name: "" }, customer: c ?? { last_name: "" }, ticketNumber: t?.ticket_number ?? "", lines,
  });
  if (!doc.ok) return { ok: false, code: doc.code, message: doc.message, templateId: tpl.id };

  const currency = (inv.currency ?? "CHF").toUpperCase();
  const filled = fill(tpl, {
    "customer.first_name": c?.first_name ?? "", "customer.last_name": c?.last_name ?? "",
    "invoice.number": inv.invoice_number, "invoice.total": `${currency} ${Number(inv.total).toFixed(2)}`,
    "invoice.due_date": fmtDate(inv.due_date), "school.name": school?.[0]?.name ?? "",
  });
  if (!filled.ok) return filled;
  return { ...filled, invoiceId: inv.id, attachments: [{ filename: doc.filename, content: b64(doc.html), content_type: "text/html" }] };
}
