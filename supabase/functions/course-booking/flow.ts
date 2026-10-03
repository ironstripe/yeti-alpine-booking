// Orchestration for 26/27 website course bookings (#36). All validation, pricing,
// locking, holds and enrollment live in the SQL state machine bc_2627_*:
//   reserve -> held -> finalize -> finalized -> begin_invoice -> invoicing
//   -> (issueInvoice: exactly one open invoice) -> confirm -> confirmed
// held/finalized can be released (cancel/expiry); invoicing/confirmed never.
// This layer only sequences the steps and the two durable e-mail deliveries.
// Online payment is never accepted here (no provider; fabricated references refused).
import { issueInvoice as defaultIssue } from "../_shared/invoice-service.ts";
import { attemptDelivery, ensureDelivery, type DeliveryKind, type Transport } from "../_shared/courseDelivery.ts";
import { err, httpFor, isToken, isUuid, positiveAmount, CONTRACT_VERSION } from "../_shared/courseBookingContract.ts";

// deno-lint-ignore no-explicit-any
type Client = any;
export interface Deps { issue?: typeof defaultIssue; transport: Transport }
export type Result = { status: number; body: Record<string, unknown> };

const rpc = async (sb: Client, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as Record<string, any>;
};

export async function options(sb: Client, body: Record<string, unknown>): Promise<Result> {
  const d = await rpc(sb, "bc_2627_course_options", { p_from: body.from ?? null, p_to: body.to ?? null });
  if (d?.status !== "success") return { status: 400, body: err(d?.code ?? "options_failed", d?.message ?? "Optionen nicht verfügbar") };
  return { status: 200, body: { success: true, status: "ok", contract_version: CONTRACT_VERSION, currency: "CHF",
    quote_version: d.quote_version, options: d.options, informational: d.informational } };
}

export async function reserve(sb: Client, body: Record<string, any>): Promise<Result> {
  const r = body?.reservation;
  if (!r || typeof r !== "object" || typeof r.idempotency_key !== "string") {
    return { status: 400, body: err("invalid_input", "reservation mit idempotency_key erforderlich") };
  }
  const d = await rpc(sb, "bc_2627_reserve", { p_payload: r });
  if (d?.status !== "success") return { status: httpFor(d?.code), body: err(d?.code ?? "reserve_failed", d?.message ?? "") };
  const total = positiveAmount(d.total_amount);
  if (total === null) return { status: 500, body: err("internal", "Ungültiger Betrag", true) };
  return {
    status: d.replayed ? 200 : 201,
    body: { success: true, status: d.state ?? "held", replayed: !!d.replayed, ticket_id: d.ticket_id, ticket_number: d.ticket_number,
      reservation_token: d.reservation_token, reservation_expires_at: d.reservation_expires_at, total_amount: total,
      currency: "CHF", quote: d.quote },
  };
}

export async function cancel(sb: Client, body: Record<string, any>): Promise<Result> {
  if (!isUuid(body?.ticket_id) || !isToken(body?.reservation_token)) return { status: 400, body: err("invalid_input", "ticket_id/reservation_token") };
  const d = await rpc(sb, "bc_2627_cancel", { p_ticket_id: body.ticket_id, p_token: body.reservation_token });
  if (d?.status !== "success") return { status: httpFor(d?.code), body: err(d?.code ?? "cancel_failed", d?.message ?? "") };
  return { status: 200, body: { success: true, status: "released", ticket_id: body.ticket_id,
    already_released: !!d.already_released, ticket_status: d.ticket_status ?? null } };
}

async function deliver(sb: Client, ticketId: string, email: string, transport: Transport) {
  const out: Record<DeliveryKind, string> = { booking_confirmation: "failed", invoice: "failed" };
  for (const kind of ["invoice", "booking_confirmation"] as DeliveryKind[]) {
    try {
      const row = await ensureDelivery(sb, ticketId, kind, email);
      if (!row) continue;
      if (row.status === "pending") {
        const r = await attemptDelivery(sb, row.id, transport, { mode: "auto" });
        out[kind] = r.outcome === "sent" ? "sent" : r.outcome === "not_claimed" ? "sending" : "failed";
      } else out[kind] = row.status;
    } catch (e) {
      console.error(`course-booking delivery ${kind}:`, (e as Error).message);
    }
  }
  return out;
}

/**
 * Complete = finalize + invoice + confirm + deliveries. Safe to repeat with the
 * identical body after a lost response: every step is idempotent and the
 * invoice is created only after begin_invoice moved the hold past the point of
 * no return, and never twice (issueInvoice returns the existing open invoice).
 */
export async function complete(sb: Client, input: Record<string, any>, deps: Deps): Promise<Result> {
  const issue = deps.issue ?? defaultIssue;
  if (!isUuid(input?.ticket_id) || !isToken(input?.reservation_token)) return { status: 400, body: err("invalid_input", "ticket_id/reservation_token") };
  if (!input.customer || typeof input.customer !== "object" || !Array.isArray(input.participants)) {
    return { status: 400, body: err("invalid_input", "customer und participants erforderlich") };
  }
  const ids = { p_ticket_id: input.ticket_id, p_token: input.reservation_token };

  const fin = await rpc(sb, "bc_2627_finalize", { ...ids, p_customer: input.customer, p_participants: input.participants, p_notes: input.notes ?? null });
  if (fin?.status !== "success") return { status: httpFor(fin?.code), body: err(fin.code, fin.message ?? "") };

  // Server-bound customer, recipient and immutable quote total.
  const b = await rpc(sb, "bc_2627_begin_invoice", ids);
  if (b?.status !== "success") return { status: httpFor(b?.code), body: err(b.code, b.message ?? "") };
  const total = positiveAmount(b.total_amount);
  if (total === null || !isUuid(b.customer_id) || typeof b.recipient_email !== "string") {
    return { status: 500, body: err("internal", "Reservation unvollständig", true) };
  }

  if (b.state !== "confirmed") {
    const r = await issue(sb, { ticketId: b.ticket_id, customerId: b.customer_id, subtotal: total, total, currency: "CHF", dueDays: 14 });
    if (!r.ok || !r.invoice || r.invoice.status !== "open") {
      console.error("course-booking issueInvoice:", r.error_code, r.error);
      return { status: 503, body: err("invoice_issue_failed", "Rechnung konnte nicht erstellt werden; bitte dieselbe Anfrage wiederholen", true,
        { reason: r.error_code ?? null, status: "invoicing" }) };
    }
  }
  const conf = await rpc(sb, "bc_2627_confirm", ids);
  if (conf?.status !== "success") {
    return { status: 503, body: err(conf?.code ?? "confirm_failed", conf?.message ?? "", true, { status: "invoicing" }) };
  }

  const delivery = await deliver(sb, b.ticket_id, b.recipient_email, deps.transport);
  return {
    status: 200,
    body: {
      success: true, status: "confirmed", payment_status: "invoice_open", payment_method: "invoice",
      ticket_id: b.ticket_id, ticket_number: b.ticket_number, total_amount: total, currency: "CHF",
      invoice_number: conf.invoice_number, due_date: conf.due_date,
      already_confirmed: !!conf.already_confirmed, delivery,
    },
  };
}
