/**
 * Durable, server-only delivery of the invoice e-mail (B+ Phase 2), including
 * the Swiss QR payment part.
 *
 * Same discipline as the booking confirmation delivery:
 *  - exactly one delivery row per invoice (`booking_email_deliveries`),
 *  - one automatic attempt per invoice, manual office/admin retry only,
 *  - the template must exist and be active; every placeholder must be known,
 *  - the payment part is built from the invoice's immutable payment snapshot,
 *    never from caller input.
 */
import { fillTemplate } from "./bookingDelivery.ts";
import { dataUrlToBase64, qrAttachmentFilename, renderQrPngDataUrl, type QrRenderer } from "./qrCode.ts";
import {
  buildQrPaymentPartHtml,
  buildQrPaymentPartText,
  hasQrCode,
  type QrPaymentPartDebtor,
} from "./swissQrBill.ts";
import { formatPaymentAmount, type PaymentSnapshot } from "./payment-domain.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export const INVOICE_TRIGGER = "invoice.created";
/** Placeholder that receives the server-generated QR payment part (raw HTML). */
export const INVOICE_QR_VAR = "invoice.qr_payment_part";
export const INVOICE_ALLOWED_VARS = [
  "customer.first_name",
  "customer.last_name",
  "customer.salutation",
  "ticket.ticket_number",
  "invoice.number",
  "invoice.total",
  "invoice.currency",
  "invoice.due_date",
  INVOICE_QR_VAR,
  "school.name",
] as const;

const SENDER = "Schneesportschule Malbun <info@schneesportschule-malbun.li>";

export const invoiceDeliveryKey = (invoiceId: string) => `invoice:${invoiceId}:invoice_created`;

interface InvoiceRow {
  id: string;
  invoice_number: string;
  ticket_id: string | null;
  customer_id: string | null;
  total: number;
  currency: string;
  due_date: string;
  status: string;
  payment_snapshot: PaymentSnapshot | null;
}

export interface InvoiceContext {
  invoice: InvoiceRow;
  ticket_number: string;
  first_name: string;
  last_name: string;
  salutation: string;
  school_name: string;
  debtor: QrPaymentPartDebtor | null;
}

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
};

export async function ensureInvoiceDelivery(
  sb: Client,
  input: { invoiceId: string; ticketId: string; email: string },
) {
  const key = invoiceDeliveryKey(input.invoiceId);
  await sb.from("booking_email_deliveries").upsert(
    {
      ticket_id: input.ticketId,
      kind: "invoice",
      idempotency_key: key,
      recipient_email: input.email,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  const { data } = await sb
    .from("booking_email_deliveries")
    .select("id, status")
    .eq("idempotency_key", key)
    .maybeSingle();
  return data as { id: string; status: string } | null;
}

export async function activeInvoiceTemplate(sb: Client) {
  const { data } = await sb
    .from("email_templates")
    .select("id, subject, body_html, body_text")
    .eq("trigger", INVOICE_TRIGGER)
    .eq("is_active", true)
    .maybeSingle();
  return data as { id: string; subject: string; body_html: string; body_text: string | null } | null;
}

/** Loads everything the template may reference. Only server-side reads. */
export async function loadInvoiceContext(sb: Client, invoiceId: string): Promise<InvoiceContext | null> {
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, invoice_number, ticket_id, customer_id, total, currency, due_date, status, payment_snapshot")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  let ticket_number = "";
  let first_name = "";
  let last_name = "";
  let salutation = "";
  let debtor: QrPaymentPartDebtor | null = null;

  if (invoice.ticket_id) {
    const { data: ticket } = await sb
      .from("tickets")
      .select("ticket_number")
      .eq("id", invoice.ticket_id)
      .maybeSingle();
    ticket_number = ticket?.ticket_number ?? "";
  }

  const customerId = invoice.customer_id;
  if (customerId) {
    const { data: customer } = await sb
      .from("customers")
      .select("salutation, first_name, last_name, organization_name, street, house_number, zip, city")
      .eq("id", customerId)
      .maybeSingle();
    if (customer) {
      first_name = customer.first_name ?? "";
      last_name = customer.last_name ?? customer.organization_name ?? "";
      salutation = customer.salutation ?? "";
      debtor = {
        name: customer.organization_name?.trim() || [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        street: customer.street,
        houseNumber: customer.house_number,
        zip: customer.zip,
        city: customer.city,
      };
    }
  }

  const { data: settings } = await sb.from("school_settings").select("name").limit(1).maybeSingle();
  const school_name = settings?.name ?? "";

  return { invoice, ticket_number, first_name, last_name, salutation, school_name, debtor };
}

export function buildInvoiceVars(
  ctx: InvoiceContext,
  qrPart: string,
): Record<string, string> {
  const { invoice } = ctx;
  return {
    "customer.first_name": ctx.first_name,
    "customer.last_name": ctx.last_name,
    "customer.salutation": ctx.salutation,
    "ticket.ticket_number": ctx.ticket_number,
    "invoice.number": invoice.invoice_number ?? "",
    // The template prints the currency itself; the value stays a bare amount.
    "invoice.total": formatPaymentAmount(Number(invoice.total ?? 0)),
    "invoice.currency": invoice.currency ?? "CHF",
    "invoice.due_date": fmtDate(invoice.due_date),
    [INVOICE_QR_VAR]: qrPart,
    "school.name": ctx.school_name,
  };
}

/**
 * One attempt for one delivery row. Claims the row atomically first, so two
 * concurrent callers can never send the same invoice twice.
 */
export async function attemptInvoiceDelivery(
  sb: Client,
  deliveryId: string,
  opts: { manual?: boolean; renderQr?: QrRenderer } = {},
): Promise<string> {
  const allowed = opts.manual ? ["failed"] : ["pending"];

  const { data: current } = await sb
    .from("booking_email_deliveries")
    .select("attempts")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!current) return "not_found";

  const { data: claimed } = await sb
    .from("booking_email_deliveries")
    .update({ status: "sending", attempts: current.attempts + 1 })
    .eq("id", deliveryId)
    .eq("attempts", current.attempts)
    .in("status", allowed)
    .select("id, ticket_id, recipient_email, idempotency_key")
    .maybeSingle();
  if (!claimed) return "not_claimed";

  const fail = async (code: string, message: string, extra: Record<string, unknown> = {}) => {
    await sb
      .from("booking_email_deliveries")
      .update({ status: "failed", last_error_code: code, last_error: message.slice(0, 500), ...extra })
      .eq("id", deliveryId);
    return "failed";
  };

  try {
    const key = String(claimed.idempotency_key ?? "");
    const invoiceId = key.split(":")[1];
    if (!invoiceId) return await fail("delivery_key_invalid", "Zustellschlüssel ist ungültig");

    const tpl = await activeInvoiceTemplate(sb);
    if (!tpl) return await fail("template_missing", "Vorlage invoice.created fehlt oder ist inaktiv");

    const ctx = await loadInvoiceContext(sb, invoiceId);
    if (!ctx) return await fail("invoice_missing", "Rechnung konnte nicht geladen werden");

    // A paid or cancelled invoice is never sent automatically.
    if (!["open", "sent"].includes(ctx.invoice.status ?? "")) {
      return await fail("invoice_not_open", `Rechnung ist nicht offen (${ctx.invoice.status})`);
    }

    // The payment part comes from the immutable snapshot; a missing snapshot is
    // a hard error instead of a silently incomplete invoice e-mail.
    const snapshot = ctx.invoice.payment_snapshot;
    if (!snapshot) return await fail("payment_snapshot_missing", "Rechnung hat keinen Zahlungs-Snapshot");

    const renderQr = opts.renderQr ?? renderQrPngDataUrl;
    let qrDataUrl: string | null = null;
    if (hasQrCode(snapshot)) {
      try {
        qrDataUrl = await renderQr(snapshot.qr_payload!);
      } catch (e) {
        return await fail("qr_render_failed", e instanceof Error ? e.message : String(e));
      }
    }

    const partInput = {
      snapshot,
      amount: Number(ctx.invoice.total ?? 0),
      debtor: ctx.debtor,
      invoiceNumber: ctx.invoice.invoice_number,
      dueDate: fmtDate(ctx.invoice.due_date),
      qrDataUrl,
    };
    const qrPart = buildQrPaymentPartHtml(partInput);
    const vars = buildInvoiceVars(ctx, qrPart);

    const subj = fillTemplate(tpl.subject, vars, false);
    const html = fillTemplate(tpl.body_html, vars, true, { raw: [INVOICE_QR_VAR] });
    const text = tpl.body_text
      ? fillTemplate(tpl.body_text, vars, false, { raw: [INVOICE_QR_VAR] })
      : null;
    const unknown = [...new Set([...subj.unknown, ...html.unknown, ...(text?.unknown ?? [])])];
    if (unknown.length) {
      return await fail("template_unknown_variable", `Unbekannte Platzhalter: ${unknown.join(", ")}`, {
        template_id: tpl.id,
      });
    }

    const subject = subj.text.replace(/[\r\n]+/g, " ");
    // Plain text gets the readable payment part instead of the HTML block.
    const bodyText = tpl.body_text
      ? text!.text
      : `${subject}\n\n${buildQrPaymentPartText(partInput)}`;

    const { data: log } = await sb
      .from("email_logs")
      .insert({
        template_id: tpl.id,
        recipient_email: claimed.recipient_email,
        subject,
        status: "queued",
        delivery_id: deliveryId,
        metadata: { ticket_id: claimed.ticket_id, invoice_id: invoiceId, kind: "invoice" },
      })
      .select("id")
      .single();

    const payload: Record<string, unknown> = {
      from: SENDER,
      to: [claimed.recipient_email],
      subject,
      html: html.text,
      text: bodyText,
    };
    if (qrDataUrl) {
      payload.attachments = [
        { filename: qrAttachmentFilename(ctx.invoice.invoice_number), content: dataUrlToBase64(qrDataUrl) },
      ];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Idempotency-Key": String(claimed.idempotency_key),
      },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(out?.message ?? res.status);
      if (log?.id) await sb.from("email_logs").update({ status: "failed", error_message: msg }).eq("id", log.id);
      return await fail("provider_error", msg, { template_id: tpl.id, email_log_id: log?.id ?? null });
    }

    const now = new Date().toISOString();
    if (log?.id) {
      await sb.from("email_logs").update({ status: "sent", sent_at: now, provider_message_id: out.id }).eq("id", log.id);
    }
    await sb
      .from("booking_email_deliveries")
      .update({
        status: "sent",
        sent_at: now,
        provider_message_id: out.id ?? null,
        template_id: tpl.id,
        email_log_id: log?.id ?? null,
        last_error_code: null,
        last_error: null,
      })
      .eq("id", deliveryId);
    await sb.from("invoices").update({ sent_at: now }).eq("id", invoiceId);
    return "sent";
  } catch (e) {
    return await fail("exception", e instanceof Error ? e.message : String(e));
  }
}
