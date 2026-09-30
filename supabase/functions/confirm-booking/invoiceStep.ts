// Invariant: a website invoice booking is confirmed ONLY once exactly one open
// invoice exists. The invoice is issued (or an existing open one reused) first;
// the ticket status changes only afterwards. On failure the ticket stays in its
// provisional/payment_pending state so the same confirm call can be retried.
import { issueInvoice as defaultIssue } from "../_shared/invoice-service.ts";

// deno-lint-ignore no-explicit-any
type Client = any;
export type OpenInvoice = { id: string; invoice_number: string; due_date: string };
export type InvoiceStepResult =
  | { ok: true; invoice: OpenInvoice }
  | { ok: false; code: "invoice_issue_failed" | "ticket_update_failed"; error: string };

export async function issueInvoiceThenConfirm(
  sb: Client,
  input: { ticketId: string; customerId: string; total: number; now: Date },
  issue: typeof defaultIssue = defaultIssue,
): Promise<InvoiceStepResult> {
  const { data: openRows } = await sb
    .from("invoices")
    .select("id, invoice_number, due_date, status")
    .eq("ticket_id", input.ticketId)
    .eq("status", "open");
  if ((openRows?.length ?? 0) > 1) {
    return { ok: false, code: "invoice_issue_failed", error: "multiple open invoices" };
  }
  let invoice: (OpenInvoice & { status?: string }) | null = openRows?.[0] ?? null;

  if (!invoice) {
    const issued = await issue(sb, {
      ticketId: input.ticketId,
      customerId: input.customerId,
      subtotal: input.total,
      total: input.total,
      currency: "CHF",
      dueDays: 14,
    });
    if (!issued.ok || !issued.invoice) {
      return { ok: false, code: "invoice_issue_failed", error: String(issued.error_code ?? issued.error ?? "unknown") };
    }
    invoice = issued.invoice as OpenInvoice & { status?: string };
    // issueInvoice may return a leftover non-open (e.g. draft) invoice idempotently.
    if (invoice.status !== "open") {
      return { ok: false, code: "invoice_issue_failed", error: `invoice not open (${invoice.status})` };
    }
  }

  const due = new Date(input.now);
  due.setDate(due.getDate() + 14);
  const { data: updated, error } = await sb.from("tickets").update({
    status: "confirmed",
    payment_method: "invoice",
    payment_due_date: due.toISOString().slice(0, 10),
    updated_at: input.now.toISOString(),
  }).eq("id", input.ticketId).in("status", ["provisional", "payment_pending"]).select("id");
  if (error) return { ok: false, code: "ticket_update_failed", error: error.message };
  if (!updated?.length) {
    // A concurrent call confirmed it already; still fine only if it is confirmed now.
    const { data: t } = await sb.from("tickets").select("status").eq("id", input.ticketId).maybeSingle();
    if (t?.status !== "confirmed") return { ok: false, code: "ticket_update_failed", error: `status ${t?.status}` };
  }
  return { ok: true, invoice: { id: invoice.id, invoice_number: invoice.invoice_number, due_date: invoice.due_date } };
}
