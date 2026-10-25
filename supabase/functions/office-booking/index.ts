// Staff-only (office/admin) atomic multi-item booking (B07a). One DB transaction in the
// service_role-only b07a_office_multi: quote = dry run (rolled back), create = one ticket, all items or none.
// No e-mail/provider call here; confirmation delivery stays with staff-booking-confirmation (B05).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/staffAuth.ts";
import { OfficeBookingRequest, officePublicBody, officeStatusFor } from "../_shared/officeBookingContract.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireRole(req, ["office", "admin"], corsHeaders);
  if (auth instanceof Response) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid", field: "body" }, 400); }
  const parsed = OfficeBookingRequest.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid", fields: parsed.error.flatten().fieldErrors }, 400);
  const { action, ...payload } = parsed.data;
  const body = payload.finalization
    ? { ...payload, finalization: { ...payload.finalization, actor_name: auth.email?.split("@")[0] || "System", actor_email: auth.email } }
    : payload;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rpc = await db.rpc("b07a_office_multi", { p: body, p_actor: auth.userId, p_mode: action });
  // Not installed yet: say so; nothing was written.
  if (rpc.error?.code === "PGRST202") return json({ error: "unavailable" }, 503);
  if (rpc.error?.code === "22008") return json({ error: "invalid", field: "birth_date" }, 400);
  if (rpc.error || !rpc.data) {
    console.error("office-booking rpc failed", action, rpc.error?.code);
    return json({ error: "internal_error" }, 500);
  }
  const result = rpc.data as Record<string, unknown>;
  return json(officePublicBody(result), officeStatusFor(result));
});
