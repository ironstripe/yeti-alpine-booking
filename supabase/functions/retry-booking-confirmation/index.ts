// Office/admin-only manual retry of a failed booking e-mail delivery.
// Handles both delivery kinds of the B+ booking flow:
//   - `booking_confirmation` (B+ Phase 1)
//   - `invoice` (B+ Phase 2, invoice with Swiss QR payment part)
//
// The endpoint name is kept for compatibility with the existing office UI; the
// body stays `{ delivery_id }`. Nothing is ever sent twice: the delivery row is
// claimed atomically and only a `failed` row can be retried.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { requireRole } from "../_shared/staffAuth.ts";
import { activeConfirmationTemplate, attemptConfirmation } from "../_shared/bookingDelivery.ts";
import { activeInvoiceTemplate, attemptInvoiceDelivery } from "../_shared/invoiceDelivery.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const Body = z.object({ delivery_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireRole(req, ["office", "admin"], cors);
  if (auth instanceof Response) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: d } = await sb.from("booking_email_deliveries")
    .select("id, status, kind").eq("id", parsed.data.delivery_id).maybeSingle();
  if (!d) return json({ error: "not_found" }, 404);
  if (d.status !== "failed") return json({ error: "not_failed", status: d.status }, 409);

  const kind = d.kind ?? "booking_confirmation";

  if (kind === "invoice") {
    if (!(await activeInvoiceTemplate(sb))) return json({ error: "template_not_configured" }, 409);
    const result = await attemptInvoiceDelivery(sb, d.id, { manual: true });
    if (result === "not_claimed") return json({ error: "already_in_progress" }, 409);
    return json({ success: result === "sent", status: result, kind });
  }

  if (!(await activeConfirmationTemplate(sb))) return json({ error: "template_not_configured" }, 409);
  const result = await attemptConfirmation(sb, d.id, { manual: true });
  if (result === "not_claimed") return json({ error: "already_in_progress" }, 409);
  return json({ success: result === "sent", status: result, kind });
});