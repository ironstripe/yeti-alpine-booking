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
    const { action: _a, ...payload } = p;
    rpc = await db.rpc("pa_create_booking", { p: payload, p_actor: auth.userId });
  } else if (p.action === "move") {
    rpc = await db.rpc("pa_move_appointment", {
      p_id: p.appointment_id, p_date: p.date, p_start: p.time_start, p_end: p.time_end,
      p_instr: p.instructor_id, p_actor: auth.userId,
    });
  } else {
    rpc = await db.rpc("pa_period_update", { p_group: p.period_group_id, p_changes: p.changes, p_actor: auth.userId });
  }

  if (rpc.error || !rpc.data) {
    console.error("private-appointments rpc failed", p.action, rpc.error?.code);
    return json({ error: "internal_error" }, 500);
  }
  const result = rpc.data as Record<string, unknown>;
  return json(publicBody(result), statusFor(result));
});
