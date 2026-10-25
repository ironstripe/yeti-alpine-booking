import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertDeliverySchema, ensureDelivery, attemptDelivery, type Transport } from "../_shared/courseDelivery.ts";
// deno-lint-ignore no-explicit-any
type Client = any;

const Body = z.object({ invoice_id: z.string().uuid(), action: z.enum(["status", "send"]) }).strict();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const VALID_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * B06: staff-only first-send / safe retry of an already ISSUED invoice.
 * Never reissues, reprices or changes number/reference/amount/due date,
 * payment profile/snapshot or the financial invoice status. Delivery state
 * lives only in booking_email_deliveries (B04 protocol); invoices.status and
 * sent_at are NOT written here. The recipient is resolved server-side from
 * the saved billing party (billing partner email, else customer email).
 */
export function createSendInvoiceHandler(sb: Client, deps: {
  transport: Transport; authorize: (req: Request) => Promise<{ userId: string } | Response>; now?: () => number;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ success: false, outcome: "unavailable" }, 405);
    const auth = await deps.authorize(req);
    if (auth instanceof Response) return auth;
    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ success: false, outcome: "invalid" }, 400); }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ success: false, outcome: "invalid" }, 400);
    const { invoice_id: invoiceId, action } = parsed.data;

    try {
      const { data: inv, error: ie } = await sb.from("invoices")
        .select("id, ticket_id, customer_id, status, invoice_number").eq("id", invoiceId).maybeSingle();
      if (ie) throw new Error("invoice_read_failed");
      if (!inv) return json({ success: false, outcome: "not_found" }, 404);
      if (inv.status === "draft") return json({ success: false, outcome: "not_issued" });
      if (inv.status !== "open") return json({ success: false, outcome: "not_sendable", code: `status_${inv.status}` });
      if (!inv.ticket_id) return json({ success: false, outcome: "not_sendable", code: "no_ticket" });

      const { data: ticket, error: te } = await sb.from("tickets")
        .select("id, billing_partner_id, customer:customers(email)").eq("id", inv.ticket_id).maybeSingle();
      if (te) throw new Error("ticket_read_failed");
      if (!ticket) return json({ success: false, outcome: "not_found" }, 404);

      // Recipient authority: billing partner invoice -> its billing email, else the customer email.
      let recipient: string | null = null;
      if (ticket.billing_partner_id) {
        const { data: partner, error: pe } = await sb.from("billing_partners").select("billing_email").eq("id", ticket.billing_partner_id).maybeSingle();
        if (pe) throw new Error("recipient_read_failed");
        recipient = partner?.billing_email?.trim() || null;
      } else {
        recipient = ticket.customer?.email?.trim() || null;
      }

      // B06 schema gate: the invoice binding column must exist.
      const { error: schemaError } = await sb.from("booking_email_deliveries").select("invoice_id").limit(0);
      if (schemaError) return json({ success: false, outcome: "unavailable", code: "schema_incompatible" }, 503);
      await assertDeliverySchema(sb);

      const { data: existing, error: de } = await sb.from("booking_email_deliveries")
        .select("*").eq("ticket_id", inv.ticket_id).eq("kind", "invoice").maybeSingle();
      if (de) throw new Error("delivery_read_failed");

      const validRecipient0 = typeof recipient === "string" && VALID_EMAIL.test(recipient);
      if (action === "status") {
        return json({
          success: existing?.status === "sent",
          outcome: existing?.status === "sending" ? "in_progress" : existing?.status ?? (validRecipient0 ? "not_sent" : "no_recipient"),
          code: existing?.last_error_code ?? null,
        });
      }

      // Identity binding: a delivery row belongs to exactly one invoice.
      if (existing) {
        const bound = existing.invoice_id ?? existing.frozen_payload?.invoice_id ?? null;
        if (bound && bound !== invoiceId) {
          return json({ success: false, outcome: "needs_review", code: "different_invoice_bound" });
        }
        if (!bound && existing.delivery_protocol === "leased_v1" && existing.frozen_payload) {
          return json({ success: false, outcome: "needs_review", code: "unbound_frozen_payload" });
        }
        if (existing.status === "sent") return json({ success: true, outcome: "already_sent" });
        if (existing.delivery_protocol !== "leased_v1") {
          return json({ success: false, outcome: "needs_review", code: "legacy_delivery_review" });
        }
      }

      const validRecipient = validRecipient0;
      if (!existing && !validRecipient) return json({ success: false, outcome: "no_recipient" });

      const row = existing ?? await ensureDelivery(sb, inv.ticket_id, "invoice", recipient!, invoiceId);
      if (!row) throw new Error("delivery_read_failed");
      const mode = row.status === "pending" ? "auto" : row.status === "failed" ? "manual" : "recover";
      const result = await attemptDelivery(sb, row.id, deps.transport, { mode, now: deps.now });
      return json({ success: ["sent", "already_sent", "reconciled_sent"].includes(result.outcome), ...result });
    } catch (e) {
      return json({ success: false, outcome: "unavailable", code: e instanceof Error ? e.message : "delivery_unavailable" }, 503);
    }
  };
}
