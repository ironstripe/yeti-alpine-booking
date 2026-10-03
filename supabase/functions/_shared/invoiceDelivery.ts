/**
 * Invoice email delivery for 26/27 website course bookings (#36, immediate delivery).
 * One durable row per ticket (kind 'invoice', idempotency key ticket:<id>:invoice),
 * one automatic attempt, recoverable: a failed row can be retried manually and the
 * provider idempotency key prevents a duplicate email. Transport is injectable so
 * tests never send real email.
 */
// deno-lint-ignore no-explicit-any
type Client = any;

export type InvoiceMail = { to: string; subject: string; text: string; idempotencyKey: string };
export type Transport = (mail: InvoiceMail) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

export const invoiceKey = (ticketId: string) => `ticket:${ticketId}:invoice`;
const SENDER = "Schneesportschule Malbun <info@schneesportschule-malbun.li>";

export const resendTransport: Transport = async (mail) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Idempotency-Key": mail.idempotencyKey,
    },
    body: JSON.stringify({ from: SENDER, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  const out = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, id: String(out.id ?? "") } : { ok: false, error: String(out?.message ?? res.status) };
};

export async function ensureInvoiceDelivery(sb: Client, ticketId: string, email: string) {
  const key = invoiceKey(ticketId);
  await sb.from("booking_email_deliveries").upsert(
    { ticket_id: ticketId, kind: "invoice", idempotency_key: key, recipient_email: email },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  const { data } = await sb.from("booking_email_deliveries").select("id, status, attempts").eq("idempotency_key", key).maybeSingle();
  return data as { id: string; status: string; attempts: number } | null;
}

export async function attemptInvoiceDelivery(
  sb: Client,
  deliveryId: string,
  invoice: { invoice_number: string; total: number; due_date: string; ticket_number: string },
  transport: Transport,
  opts: { manual?: boolean } = {},
): Promise<string> {
  const { data: cur } = await sb.from("booking_email_deliveries").select("attempts").eq("id", deliveryId).maybeSingle();
  if (!cur) return "not_found";
  const { data: claimed } = await sb.from("booking_email_deliveries")
    .update({ status: "sending", attempts: cur.attempts + 1 })
    .eq("id", deliveryId).eq("attempts", cur.attempts).in("status", opts.manual ? ["failed"] : ["pending"])
    .select("id, recipient_email, idempotency_key").maybeSingle();
  if (!claimed) return "not_claimed";
  try {
    const r = await transport({
      to: claimed.recipient_email,
      idempotencyKey: claimed.idempotency_key,
      subject: `Rechnung ${invoice.invoice_number} – Buchung ${invoice.ticket_number}`,
      text: `Rechnung ${invoice.invoice_number}\nBetrag: CHF ${invoice.total.toFixed(2)}\nZahlbar bis: ${invoice.due_date}`,
    });
    if (!r.ok) {
      await sb.from("booking_email_deliveries").update({ status: "failed", last_error_code: "provider_error", last_error: r.error.slice(0, 500) }).eq("id", deliveryId);
      return "failed";
    }
    await sb.from("booking_email_deliveries").update({
      status: "sent", sent_at: new Date().toISOString(), provider_message_id: r.id, last_error_code: null, last_error: null,
    }).eq("id", deliveryId);
    return "sent";
  } catch (e) {
    await sb.from("booking_email_deliveries").update({ status: "failed", last_error_code: "exception", last_error: String(e).slice(0, 500) }).eq("id", deliveryId);
    return "failed";
  }
}
