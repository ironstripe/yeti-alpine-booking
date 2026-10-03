// Orchestration for 26/27 website course bookings (#36). All validation, pricing,
// locking and enrollment happen in the SQL functions bc_2627_*; this layer only
// sequences: finalize -> exactly one open invoice -> bc_2627_confirm -> deliveries.
// Online payment is never accepted here (no provider; fabricated references refused).
import { issueInvoice as defaultIssue } from "../_shared/invoice-service.ts";
import { attemptInvoiceDelivery, ensureInvoiceDelivery, type Transport } from "../_shared/invoiceDelivery.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export interface CompleteInput {
  ticket_id: string;
  reservation_token: string;
  customer: Record<string, unknown> & { email: string };
  participants: Array<Record<string, unknown>>;
  notes?: string;
}

export async function completeBooking(
  sb: Client,
  input: CompleteInput,
  deps: { issue?: typeof defaultIssue; transport: Transport },
) {
  const issue = deps.issue ?? defaultIssue;
  const { data: fin, error: finErr } = await sb.rpc("bc_2627_finalize", {
    p_ticket_id: input.ticket_id, p_token: input.reservation_token,
    p_customer: input.customer, p_participants: input.participants, p_notes: input.notes ?? null,
  });
  if (finErr) return { status: 500, body: { success: false, code: "internal" } };
  if (fin?.status !== "success") return { status: 409, body: { success: false, ...fin } };

  const { data: t } = await sb.from("tickets").select("id, ticket_number, total_amount, customer_id").eq("id", input.ticket_id).maybeSingle();
  if (!t?.customer_id) return { status: 409, body: { success: false, code: "not_finalized" } };

  const { data: open } = await sb.from("invoices").select("id, invoice_number, due_date, total, status").eq("ticket_id", t.id).eq("status", "open");
  if ((open?.length ?? 0) > 1) return { status: 409, body: { success: false, code: "multiple_open_invoices" } };
  let invoice = open?.[0] ?? null;
  if (!invoice) {
    const r = await issue(sb, { ticketId: t.id, customerId: t.customer_id, subtotal: t.total_amount, total: t.total_amount, currency: "CHF", dueDays: 14 });
    if (!r.ok || !r.invoice || r.invoice.status !== "open") {
      return { status: 503, body: { success: false, code: "invoice_issue_failed", retryable: true } };
    }
    invoice = r.invoice;
  }

  const { data: conf, error: confErr } = await sb.rpc("bc_2627_confirm", { p_ticket_id: t.id, p_token: input.reservation_token });
  if (confErr || conf?.status !== "success") {
    return { status: 503, body: { success: false, code: conf?.code ?? "confirm_failed", retryable: true } };
  }

  let invoiceDelivery = "failed";
  const d = await ensureInvoiceDelivery(sb, t.id, input.customer.email);
  if (d) {
    invoiceDelivery = d.status === "pending"
      ? await attemptInvoiceDelivery(sb, d.id, { invoice_number: invoice.invoice_number, total: Number(t.total_amount), due_date: invoice.due_date, ticket_number: t.ticket_number }, deps.transport)
      : d.status;
  }
  return {
    status: 200,
    body: {
      success: true, ticket_id: t.id, ticket_number: t.ticket_number, status: "confirmed", payment_status: "invoice_open",
      invoice_number: invoice.invoice_number, due_date: invoice.due_date, total_amount: t.total_amount,
      already_confirmed: !!conf.already_confirmed, delivery: { invoice: invoiceDelivery },
    },
  };
}
