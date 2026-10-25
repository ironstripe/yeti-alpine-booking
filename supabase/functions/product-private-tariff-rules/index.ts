// B07-P (not deployed): staff-only, revision-checked save of a private product's tariff rules.
// Reads happen client-side via RLS (staff SELECT); this function is the only write path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/staffAuth.ts";
import { SaveRulesBodySchema } from "../_shared/privateTariffRulesContract.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireRole(req, ["admin", "office"], corsHeaders);
  if (auth instanceof Response) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid", field: "body" }, 400); }
  const parsed = SaveRulesBodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid", fields: parsed.error.flatten().fieldErrors }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("save_product_private_tariff_rules", {
    p_product: parsed.data.product_id,
    p_expected_revision: parsed.data.expected_revision,
    p_rules: parsed.data.rules,
    p_actor: auth.userId,
  });
  if (error?.code === "PGRST202") return json({ error: "unavailable" }, 503);
  if (error || !data) return json({ error: "internal_error" }, 500);
  const r = data as Record<string, unknown>;
  if (r.ok === true) return json({ revision: r.revision, rules: r.rules }, 200);
  if (r.error === "stale") return json({ error: "stale", revision: r.revision }, 409);
  return json({ error: "invalid", field: r.field ?? null, message: r.message ?? null }, 400);
});
