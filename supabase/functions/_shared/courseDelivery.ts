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
 *                                           review is required; force cannot
 *                                           bypass this outcome in this batch.
 * Only a definitive provider rejection (4xx except 408/409/429, or 0 = not
 * attempted) is known not-sent and rotates the key on manual retry. Network,
 * 5xx, 408/409/429 are `transport_unknown`: same key AND the frozen payload
 * (stored with a SHA-256 digest before handing over) are reused, so a changed
 * template/config can never produce a different mail under the same key.
 * If the provider accepted but the `sent` write fails, the row stays leased
 * in `sending` (outcome `unknown`) and recovery reconciles from
 * provider_message_id / email_logs evidence.
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
  const { data, error } = await sb.from("school_settings").select("name, email").order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error("sender_read_failed");
  const s = data?.[0];
  const email = s?.email?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const name = (s?.name ?? "").replace(/[<>"\r\n]/g, "").trim();
  return name ? `${name} <${email}>` : email;
}

export async function ensureDelivery(sb: Client, ticketId: string, kind: DeliveryKind, email: string) {
  await assertDeliverySchema(sb);
  const key = deliveryKey(ticketId, kind);
  const { error } = await sb.from("booking_email_deliveries").upsert(
    { ticket_id: ticketId, kind, idempotency_key: key, recipient_email: email, delivery_protocol: "leased_v1" },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`delivery upsert failed: ${error.message}`);
  const { data, error: readError } = await sb.from("booking_email_deliveries").select("*").eq("idempotency_key", key).maybeSingle();
  if (readError) throw new Error("delivery_read_failed");
  return data as DeliveryRow | null;
}

export interface DeliveryRow {
  id: string; ticket_id: string; kind: DeliveryKind; idempotency_key: string; recipient_email: string;
  status: string; attempts: number; claimed_at: string | null; first_claimed_at: string | null;
  provider_idempotency_key: string | null; provider_message_id: string | null; last_error_code: string | null;
  delivery_protocol: string | null; frozen_payload: FrozenPayload | null; payload_digest: string | null;
}

export type AttemptMode = "auto" | "manual" | "recover";
export type AttemptOutcome =
  | "sent" | "failed" | "unknown" | "not_claimed" | "not_found" | "already_sent" | "needs_review" | "reconciled_sent";

export async function attemptDelivery(
  sb: Client,
  deliveryId: string,
  transport: Transport,
  opts: { mode: AttemptMode; force?: boolean; now?: () => number } = { mode: "auto" },
): Promise<{ outcome: AttemptOutcome; code?: string }> {
  const now = opts.now ?? Date.now;
  try { await assertDeliverySchema(sb); } catch { return { outcome: "needs_review", code: "schema_incompatible" }; }
  const { data: cur, error: readError } = await sb.from("booking_email_deliveries").select("*").eq("id", deliveryId).maybeSingle();
  if (readError) return { outcome: "needs_review", code: "delivery_read_failed" };
  if (!cur) return { outcome: "not_found" };
  const row = cur as DeliveryRow;
  if (row.status === "sent") return { outcome: "already_sent" };
  // NULL provenance cannot distinguish a never-attempted old row from a legacy handoff.
  // Never assign invented lease timestamps, rotate keys or reconcile legacy logs automatically.
  if (row.delivery_protocol !== "leased_v1") return { outcome: "needs_review", code: "legacy_delivery_review" };
  if (!["booking_confirmation", "invoice"].includes(row.kind)) return { outcome: "needs_review", code: "unsupported_kind" };
  if (opts.mode === "auto" && row.status !== "pending") return { outcome: "not_claimed" };
  if (opts.mode === "manual" && row.status !== "failed") return { outcome: "not_claimed" };
  if (opts.mode === "recover" && row.status !== "sending") return { outcome: "not_claimed" };

  const t = now();
  const fresh = row.status === "pending" && row.attempts === 0 && !row.first_claimed_at && !row.claimed_at &&
    !row.provider_idempotency_key && !row.frozen_payload && !row.payload_digest && !row.provider_message_id;
  const first = row.first_claimed_at ? Date.parse(row.first_claimed_at) : NaN;
  const lease = row.claimed_at ? Date.parse(row.claimed_at) : NaN;
  if (!fresh && (!Number.isFinite(first) || !Number.isFinite(lease) || first > t || lease > t ||
    !row.provider_idempotency_key || row.attempts < 1)) return { outcome: "needs_review", code: "invalid_delivery_history" };
  if (opts.mode === "auto" && !fresh) return { outcome: "needs_review", code: "invalid_delivery_history" };
  if (opts.mode === "recover" && t - lease < LEASE_MS) return { outcome: "not_claimed" };

  let providerKey = row.provider_idempotency_key ?? row.idempotency_key;
  let firstClaimed = row.first_claimed_at;
  const retryKnownNotSent = opts.mode === "manual" && DEFINITELY_NOT_SENT.has(row.last_error_code ?? "");
  // Corruption stays review-required even on repeated manual retry or force=true.
  if (row.last_error_code === "payload_digest_mismatch" || row.last_error_code === "frozen_payload_missing") {
    return { outcome: "needs_review", code: row.last_error_code };
  }
  if (!fresh) {
    const { data: logs, error: logError } = await sb.from("email_logs").select("id, provider_message_id")
      .eq("delivery_id", row.id).eq("status", "sent").not("provider_message_id", "is", null);
    if (logError) return { outcome: "needs_review", code: "evidence_read_failed" };
    const evidence = row.provider_message_id ?? logs?.[0]?.provider_message_id;
    if (evidence) {
      const { data, error } = await sb.from("booking_email_deliveries").update({ status: "sent", sent_at: new Date(t).toISOString(), provider_message_id: evidence })
        .eq("id", row.id).eq("attempts", row.attempts).eq("status", row.status).select("id").maybeSingle();
      return error ? { outcome: "unknown", code: "sent_state_unpersisted" } : { outcome: data ? "reconciled_sent" : "not_claimed" };
    }
    if (!retryKnownNotSent) {
      if (!row.frozen_payload || row.frozen_payload.mail?.idempotencyKey !== providerKey || !row.payload_digest) {
        return { outcome: "needs_review", code: "frozen_payload_missing" };
      }
      if (await payloadDigest(row.frozen_payload.mail) !== row.payload_digest) return { outcome: "needs_review", code: "payload_digest_mismatch" };
      if (t - first >= PROVIDER_DEDUPE_MS) return { outcome: "needs_review", code: "unknown_outcome" };
      if (opts.mode === "manual" && !["transport_unknown", "unknown_outcome"].includes(row.last_error_code ?? "")) {
        return { outcome: "needs_review", code: "ambiguous_failure" };
      }
    } else {
      // Only a durably recorded pre-handoff failure/definite rejection permits a new request.
      providerKey = `${row.idempotency_key}:a${row.attempts + 1}`;
      firstClaimed = null;
    }
  }

  const fromStatus = opts.mode === "auto" ? "pending" : opts.mode === "manual" ? "failed" : "sending";
  const stamp = new Date(t).toISOString();
  const { data: claimed, error: claimError } = await sb.from("booking_email_deliveries").update({
    status: "sending", attempts: row.attempts + 1, claimed_at: stamp,
    first_claimed_at: firstClaimed ?? stamp, provider_idempotency_key: providerKey,
  }).eq("id", row.id).eq("attempts", row.attempts).eq("status", fromStatus).select("*").maybeSingle();
  if (claimError) return { outcome: "needs_review", code: "claim_write_failed" };
  if (!claimed) return { outcome: "not_claimed" };

  const fail = async (code: string, message: string, extra: Record<string, unknown> = {}) => {
    const { data: w, error: we } = await sb.from("booking_email_deliveries")
      .update({ status: "failed", last_error_code: code, last_error: message.slice(0, 500), ...extra })
      .eq("id", row.id).eq("attempts", row.attempts + 1).eq("status", "sending").select("id").maybeSingle();
    // If even this write fails the row stays leased in `sending` and is recovered later with the same key.
    if (we || !w) return { outcome: "unknown" as const, code: "state_unpersisted" };
    return { outcome: "failed" as const, code };
  };

  let logId: string | null = null;
  let handedOver = false; // from here on the provider MAY have accepted the mail
  try {
    // 1) Payload: reuse the frozen payload for the same provider key, otherwise render and freeze it.
    let mail: Mail;
    let templateId: string | null = null;
    let invoiceId: string | null = null;
    const frozen = claimed.frozen_payload as FrozenPayload | null;
    if (frozen && frozen.mail?.idempotencyKey === providerKey) {
      if ((await payloadDigest(frozen.mail)) !== claimed.payload_digest) {
        return await fail("payload_digest_mismatch", "Gespeicherter Versandinhalt wurde verändert – manuelle Prüfung nötig");
      }
      mail = frozen.mail; templateId = frozen.template_id; invoiceId = frozen.invoice_id;
    } else {
      if (!fresh && !retryKnownNotSent) return await fail("frozen_payload_missing", "Versandinhalt fehlt – manuelle Prüfung nötig");
      const sender = await resolveSender(sb);
      if (!sender) return await fail("sender_not_configured", "Absender (Schul-E-Mail in den Einstellungen) fehlt");
      const content = row.kind === "invoice" ? await invoiceContent(sb, row.ticket_id) : await confirmationContent(sb, row.ticket_id);
      if (!content.ok) return await fail(content.code, content.message, content.templateId ? { template_id: content.templateId } : {});
      mail = { from: sender, to: row.recipient_email, subject: content.subject, html: content.html, text: content.text ?? null,
        attachments: content.attachments ?? [], idempotencyKey: providerKey };
      templateId = content.templateId; invoiceId = content.invoiceId ?? null;
      const fp: FrozenPayload = { mail, template_id: templateId, invoice_id: invoiceId };
      const { data: fz, error: fe } = await sb.from("booking_email_deliveries")
        .update({ frozen_payload: fp, payload_digest: await payloadDigest(mail), template_id: templateId })
        .eq("id", row.id).eq("attempts", row.attempts + 1).eq("status", "sending").select("id").maybeSingle();
      // Nothing handed to the provider yet: a definitive not-sent failure.
      if (fe || !fz) return await fail("payload_freeze_failed", fe?.message ?? "Versandinhalt konnte nicht gespeichert werden");
    }

    const { data: log, error: logError } = await sb.from("email_logs").insert({
      template_id: templateId, recipient_email: mail.to, subject: mail.subject, status: "queued",
      delivery_id: row.id, metadata: { ticket_id: row.ticket_id, kind: row.kind, invoice_id: invoiceId, provider_idempotency_key: providerKey },
    }).select("id").single();
    if (logError || !log?.id) return await fail("audit_write_failed", "Versandprotokoll konnte nicht gespeichert werden");
    logId = log.id;

    // 2) Transport.
    handedOver = true;
    let r: TransportResult;
    try {
      r = await transport(mail);
    } catch (e) {
      if (logId) await sb.from("email_logs").update({ status: "failed", error_message: String(e).slice(0, 500) }).eq("id", logId);
      return await fail("transport_unknown", e instanceof Error ? e.message : String(e), { email_log_id: logId });
    }
    if (!r.ok) {
      const definitive = isDefinitiveRejection(r.status);
      if (logId) await sb.from("email_logs").update({ status: "failed", error_message: r.error }).eq("id", logId);
      // Only a definitive rejection is known "not sent"; network/5xx/409/429 keep key + payload.
      return await fail(definitive ? "provider_error" : "transport_unknown", `${r.status ?? "?"}: ${r.error}`, { email_log_id: logId });
    }

    if (!r.id) return await fail("transport_unknown", "Anbieterantwort ohne Nachrichten-ID", { email_log_id: logId });

    // 3) Durable sent state. Provider accepted: never report `sent` unless it is persisted.
    const sentAt = new Date(now()).toISOString();
    if (logId) await sb.from("email_logs").update({ status: "sent", sent_at: sentAt, provider_message_id: r.id }).eq("id", logId);
    const { data: done, error: de } = await sb.from("booking_email_deliveries").update({
      status: "sent", sent_at: sentAt, provider_message_id: r.id || null,
      email_log_id: logId, last_error_code: null, last_error: null,
    }).eq("id", row.id).eq("attempts", row.attempts + 1).eq("status", "sending").select("id").maybeSingle();
    if (de || !done) {
      // Keep the row leased in `sending`; record the provider id as evidence for recovery.
      if (r.id) await sb.from("booking_email_deliveries").update({ provider_message_id: r.id }).eq("id", row.id).eq("status", "sending");
      return { outcome: "unknown", code: "sent_state_unpersisted" };
    }
    return { outcome: "sent" };
  } catch (e) {
    if (handedOver) return { outcome: "unknown", code: "post_send_exception" }; // leave leased; recover with same key
    return await fail("exception", e instanceof Error ? e.message : String(e), { email_log_id: logId });
  }
}

/** Explicit columns: select("*") alone does not detect an incompatible old schema. */
export async function assertDeliverySchema(sb: Client): Promise<void> {
  const { error } = await sb.from("booking_email_deliveries")
    .select("id, claimed_at, first_claimed_at, provider_idempotency_key, frozen_payload, payload_digest, delivery_protocol").limit(0);
  if (error) throw new Error("schema_incompatible");
}
const DEFINITELY_NOT_SENT = new Set([
  "sender_not_configured", "template_missing", "template_unknown_variable", "invoice_missing",
  "payment_details_missing", "payload_freeze_failed", "audit_write_failed", "provider_error",
]);

interface FrozenPayload { mail: Mail; template_id: string | null; invoice_id: string | null }

/** 4xx (except 408/409/429) and 0 (not attempted) mean the provider definitively did not send. */
export const isDefinitiveRejection = (status?: number) =>
  status !== undefined && (status === 0 || (status >= 400 && status < 500 && ![408, 409, 429].includes(status)));

export async function payloadDigest(m: Mail): Promise<string> {
  const canon = JSON.stringify([m.from, m.to, m.subject, m.html, m.text ?? null,
    (m.attachments ?? []).map((a) => [a.filename, a.content_type, a.content]), m.idempotencyKey]);
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
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
  const { data: tpl, error: templateError } = await sb.from("email_templates").select("id, subject, body_html, body_text")
    .eq("trigger", INVOICE_TRIGGER).eq("is_active", true).maybeSingle();
  if (templateError) throw new Error("template_read_failed");
  if (!tpl) return { ok: false, code: "template_missing", message: "Vorlage invoice.created fehlt oder ist inaktiv" };

  const { data: invoices, error: invoiceRead } = await sb.from("invoices").select("*").eq("ticket_id", ticketId).eq("status", "open");
  if (invoiceRead) throw new Error("invoice_read_failed");
  if ((invoices?.length ?? 0) !== 1) return { ok: false, code: "invoice_missing", message: `${invoices?.length ?? 0} offene Rechnungen` };
  const inv = invoices[0];
  const { data: t, error: ticketRead } = await sb.from("tickets").select("ticket_number, customer_id").eq("id", ticketId).maybeSingle();
  const { data: c, error: customerRead } = await sb.from("customers").select("first_name, last_name, street, house_number, zip, city")
    .eq("id", inv.customer_id ?? t?.customer_id).maybeSingle();
  const { data: school, error: schoolRead } = await sb.from("school_settings").select("name, phone, email, website, vat_number")
    .order("created_at", { ascending: true }).limit(1);
  const { data: items, error: itemsRead } = await sb.from("ticket_items")
    .select("id, date, end_date, time_start, time_end, line_total, group_name, item_type, product:products(name)")
    .eq("ticket_id", ticketId).neq("status", "cancelled").order("date").order("time_start");
  const { data: resv, error: reservationRead } = await sb.from("bc_2627_reservations").select("quote_snapshot").eq("ticket_id", ticketId).maybeSingle();
  if (ticketRead || customerRead || schoolRead || itemsRead || reservationRead) throw new Error("content_read_failed");
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
