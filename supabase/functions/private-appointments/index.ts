// Staff-only (office/admin) boundary for private-lesson appointments.
// Every action is one DB transaction in a service_role-only pa_* function.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/staffAuth.ts";
import { publicBody, RequestSchema, statusFor } from "../_shared/privateAppointmentsContract.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireRole(req, ["office", "admin"], corsHeaders);
  if (auth instanceof Response) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid", field: "body" }, 400); }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid", fields: parsed.error.flatten().fieldErrors }, 400);
  const p = parsed.data;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let rpc;
  if (p.action === "create") {
    // B07 coordinated rollout: this function version ships only together with the B07 pricing SQL, whose
    // pa_create_booking requires the shown quote revisions. A screen loaded before the release omits them:
    // refuse explicitly (nothing saved, no legacy price) so the office reloads instead of retrying.
    if (typeof p.quote_revision !== "number" || typeof p.discount_rule_revision !== "number" || typeof p.day_context_digest !== "string") {
      return json({ error: "invalid", field: "client_outdated" }, 400);
    }
    const { action: _a, finalization, ...payload } = p;
    // Booking + settlement/notes in one transaction (pa_create_booking_finalized, migration 0006).
    const body = finalization
      ? { ...payload, finalization: { ...finalization, actor_name: auth.email?.split("@")[0] || "System", actor_email: auth.email } }
      : payload;
    rpc = p.confirmation_requested === undefined
      ? await db.rpc("pa_create_booking_finalized", { p: body, p_actor: auth.userId })
      : await db.rpc("b05_office_create", { p: body, p_actor: auth.userId, p_kind: "private" });
  } else if (p.action === "quote") {
    const { action: _a, ...payload } = p;
    rpc = await db.rpc("pa_create_quote", { p: payload });
  } else if (p.action === "move") {
    // L1: p_ack only when the user confirmed a server quote (7-arg overload); otherwise the legacy signature.
    rpc = await db.rpc("pa_move_appointment", {
      p_id: p.appointment_id, p_date: p.date, p_start: p.time_start, p_end: p.time_end,
      p_instr: p.instructor_id, p_actor: auth.userId,
      ...(p.acknowledged_quote_digest ? { p_ack: { quote_digest: p.acknowledged_quote_digest } } : {}),
    });
  } else if (p.action === "period_update") {
    rpc = await db.rpc("pa_period_update", {
      p_group: p.period_group_id, p_changes: p.changes, p_actor: auth.userId,
      ...(p.acknowledged_quote_digest ? { p_ack: { quote_digest: p.acknowledged_quote_digest } } : {}),
    });
  } else {
    // B03a: quote or apply an edit of an existing booking (one transaction, pa_edit_booking).
    const { action: _a, ...payload } = p;
    rpc = await db.rpc("pa_edit_booking", { p: payload, p_actor: auth.userId });
  }

  // Edit RPC not installed yet: say so clearly instead of an ambiguous "unknown result".
  if ((p.action === "edit" || p.action === "quote") && rpc.error?.code === "PGRST202") return json({ error: "unavailable" }, 503);
  // An acknowledgement can only exist after an L1 server asked for it; without L1 installed: unavailable, nothing written.
  if ((p.action === "move" || p.action === "period_update") && rpc.error?.code === "PGRST202") return json({ error: "unavailable" }, 503);
  // B08 last-resort guard (trigger): nothing was written; report the field, not an unknown result.
  if (rpc.error?.code === "22008") return json({ error: "invalid", field: "birth_date", index: null }, 400);
  // B07 guard (L1): a tariff-priced lesson can only take its server-requoted price; anything else is refused, nothing written.
  if (rpc.error?.code === "YT001") return json({ error: "tariff_transition_required" }, 409);
  if (rpc.error || !rpc.data) {
    console.error("private-appointments rpc failed", p.action, rpc.error?.code);
    return json({ error: "internal_error" }, 500);
  }
  const result = rpc.data as Record<string, unknown>;
  return json(publicBody(result), statusFor(result));
});
