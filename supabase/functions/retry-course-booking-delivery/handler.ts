// Office/admin-only resend and stuck-delivery recovery for 26/27 website
// booking e-mails (booking_confirmation + invoice). NOT deployed.
//   { action: "retry", delivery_id, force? }  failed row -> resend
//       force is required only when the outcome is unknown AND the provider's
//       24h dedupe window has passed (could otherwise duplicate an e-mail).
//   { action: "recover_stuck" }               rows stuck in 'sending' past the lease
import { z } from "https://esm.sh/zod@3.23.8";
import { attemptDelivery, LEASE_MS, type Transport } from "../_shared/courseDelivery.ts";

// deno-lint-ignore no-explicit-any
type Client = any;
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry"), delivery_id: z.string().uuid(), force: z.boolean().optional() }),
  z.object({ action: z.literal("recover_stuck") }),
]);

export function createRetryHandler(
  sb: Client,
  deps: { transport: Transport; authorize: (req: Request) => Promise<{ userId: string } | Response>; now?: () => number },
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const auth = await deps.authorize(req);
    if (auth instanceof Response) return auth;
    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

    if (parsed.data.action === "retry") {
      const { data: d } = await sb.from("booking_email_deliveries").select("id, status, kind")
        .eq("id", parsed.data.delivery_id).in("kind", ["invoice", "booking_confirmation"]).maybeSingle();
      if (!d) return json({ error: "not_found" }, 404);
      if (d.status !== "failed") return json({ error: "not_failed", status: d.status }, 409);
      const r = await attemptDelivery(sb, d.id, deps.transport, { mode: "manual", force: parsed.data.force, now: deps.now });
      if (r.outcome === "not_claimed") return json({ error: "already_in_progress" }, 409);
      if (r.outcome === "needs_review") return json({ error: "unknown_outcome_requires_force", code: r.code }, 409);
      await sb.from("ticket_history").insert({ ticket_id: (await ticketOf(sb, d.id)), event_type: "email_resend",
        created_by_user_id: auth.userId, details: { delivery_id: d.id, kind: d.kind, outcome: r.outcome, code: r.code ?? null, force: !!parsed.data.force } });
      return json({ success: r.outcome === "sent", status: r.outcome, code: r.code ?? null });
    }

    const cutoff = new Date((deps.now ?? Date.now)() - LEASE_MS).toISOString();
    const { data: stuck } = await sb.from("booking_email_deliveries").select("id")
      .eq("status", "sending").in("kind", ["invoice", "booking_confirmation"]).lt("claimed_at", cutoff).limit(100);
    const results: Array<{ id: string; outcome: string; code?: string }> = [];
    for (const s of stuck ?? []) {
      const r = await attemptDelivery(sb, s.id, deps.transport, { mode: "recover", now: deps.now });
      results.push({ id: s.id, outcome: r.outcome, code: r.code });
    }
    return json({ success: true, recovered: results });
  };
}

async function ticketOf(sb: Client, deliveryId: string) {
  const { data } = await sb.from("booking_email_deliveries").select("ticket_id").eq("id", deliveryId).maybeSingle();
  return data?.ticket_id ?? null;
}
