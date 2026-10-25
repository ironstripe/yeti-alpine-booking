/**
 * Durable, server-only delivery of the booking confirmation email for website
 * invoice bookings (B+ Phase 1). Exactly one delivery row per ticket, one
 * automatic attempt, manual office/admin retry only. No invoice email here.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

export const CONFIRMATION_TRIGGER = "booking.confirmed";
export const ALLOWED_CONFIRMATION_VARS = [
  "ticket_number",
  "customer_salutation",
  "customer_last_name",
  "product_name",
  "booking_date",
  "booking_time",
  "meeting_point",
] as const;

const SENDER = "Schneesportschule Malbun <info@schneesportschule-malbun.li>";

export const confirmationKey = (ticketId: string) => `ticket:${ticketId}:booking_confirmation`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function placeholders(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

/** Flat fill. Returns unknown placeholders instead of silently leaving them. */
export function fillTemplate(
  tpl: string,
  vars: Record<string, string>,
  html: boolean,
): { text: string; unknown: string[] } {
  const unknown = placeholders(tpl).filter((k) => !(k in vars));
  const text = tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, k) =>
    k in vars ? (html ? esc(vars[k]) : vars[k]) : m,
  );
  return { text, unknown };
}

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
};
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");

export async function ensureConfirmationDelivery(sb: Client, ticketId: string, email: string) {
  const key = confirmationKey(ticketId);
  const { error: insertError } = await sb.from("booking_email_deliveries").upsert(
    { ticket_id: ticketId, kind: "booking_confirmation", idempotency_key: key, recipient_email: email, delivery_protocol: "legacy_v1" },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (insertError) throw new Error("confirmation_schema_or_insert_failed");
  const { data, error: readError } = await sb
    .from("booking_email_deliveries")
    .select("id, status")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (readError) throw new Error("confirmation_read_failed");
  return data as { id: string; status: string } | null;
}

export async function activeConfirmationTemplate(sb: Client) {
  const { data, error } = await sb
    .from("email_templates")
    .select("id, subject, body_html, body_text")
    .eq("trigger", CONFIRMATION_TRIGGER)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("template_read_failed");
  return data as { id: string; subject: string; body_html: string; body_text: string | null } | null;
}

export async function buildVars(sb: Client, ticketId: string, salutation: string) {
  const { data: t, error: ticketError } = await sb
    .from("tickets")
    .select("ticket_number, customer:customers(last_name)")
    .eq("id", ticketId)
    .maybeSingle();
  const { data: items, error: itemError } = await sb
    .from("ticket_items")
    .select("date, time_start, time_end, meeting_point, product:products(name)")
    .eq("ticket_id", ticketId)
    .order("date", { ascending: true })
    .order("time_start", { ascending: true })
    .limit(1);
  if (ticketError || itemError) throw new Error("confirmation_content_read_failed");
  const first = items?.[0];
  return {
    ticket_number: t?.ticket_number ?? "",
    customer_salutation: salutation,
    customer_last_name: t?.customer?.last_name ?? "",
    product_name: first?.product?.name ?? "",
    booking_date: fmtDate(first?.date),
    booking_time: first?.time_start
      ? `${fmtTime(first.time_start)}${first.time_end ? `–${fmtTime(first.time_end)}` : ""}`
      : "",
    meeting_point: first?.meeting_point ?? "",
  } as Record<string, string>;
}

export async function attemptConfirmation(
  sb: Client,
  deliveryId: string,
  opts: { manual?: boolean; salutation?: string } = {},
): Promise<string> {
  const allowed = opts.manual ? ["failed"] : ["pending"];

  // Atomic claim: only one caller moves the row into 'sending'.
  const { data: current, error: readError } = await sb
    .from("booking_email_deliveries")
    .select("*")
    .eq("id", deliveryId)
    .maybeSingle();
  if (readError) return "needs_review";
  if (!current) return "not_found";
  // Staged coexistence: this legacy sender must never claim a leased course row
  // (including invoice rows). New protocol has its own frozen bytes and lease.
  if (current.delivery_protocol === "leased_v1" || current.kind !== "booking_confirmation") return "not_claimed";
  // Old failed rows do not record whether a provider handoff occurred.
  if (opts.manual) return "needs_review";
  if (current.delivery_protocol !== "legacy_v1" || current.attempts !== 0) return "needs_review";
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
    await sb.from("booking_email_deliveries")
      .update({ status: "failed", last_error_code: code, last_error: message.slice(0, 500), ...extra })
      .eq("id", deliveryId);
    return "failed";
  };

  try {
    const tpl = await activeConfirmationTemplate(sb);
    if (!tpl) return await fail("template_missing", "Vorlage booking.confirmed fehlt oder ist inaktiv");

    const vars = await buildVars(sb, claimed.ticket_id, opts.salutation ?? "");
    const subj = fillTemplate(tpl.subject, vars, false);
    const html = fillTemplate(tpl.body_html, vars, true);
    const text = tpl.body_text ? fillTemplate(tpl.body_text, vars, false) : null;
    const unknown = [...new Set([...subj.unknown, ...html.unknown, ...(text?.unknown ?? [])])];
    if (unknown.length) {
      return await fail("template_unknown_variable", `Unbekannte Platzhalter: ${unknown.join(", ")}`, { template_id: tpl.id });
    }
    const subject = subj.text.replace(/[\r\n]+/g, " ");

    const { data: log } = await sb.from("email_logs").insert({
      template_id: tpl.id,
      recipient_email: claimed.recipient_email,
      subject,
      status: "queued",
      delivery_id: deliveryId,
      metadata: { ticket_id: claimed.ticket_id, kind: "booking_confirmation" },
    }).select("id").single();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Idempotency-Key": claimed.idempotency_key,
      },
      body: JSON.stringify({ from: SENDER, to: [claimed.recipient_email], subject, html: html.text, text: text?.text }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(out?.message ?? res.status);
      if (log?.id) await sb.from("email_logs").update({ status: "failed", error_message: msg }).eq("id", log.id);
      return await fail("provider_error", msg, { template_id: tpl.id, email_log_id: log?.id ?? null });
    }
    const now = new Date().toISOString();
    if (log?.id) await sb.from("email_logs").update({ status: "sent", sent_at: now, provider_message_id: out.id }).eq("id", log.id);
    await sb.from("booking_email_deliveries").update({
      status: "sent", sent_at: now, provider_message_id: out.id ?? null, template_id: tpl.id,
      email_log_id: log?.id ?? null, last_error_code: null, last_error: null,
    }).eq("id", deliveryId);
    return "sent";
  } catch (e) {
    return await fail("exception", e instanceof Error ? e.message : String(e));
  }
}
