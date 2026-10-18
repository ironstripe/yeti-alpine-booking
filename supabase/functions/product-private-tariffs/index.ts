// Staff-only save of a private product's effective tariff matrix (duration x persons).
// Reads happen client-side via RLS; this function is the only write path.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { requireRole } from "../_shared/staffAuth.ts";

const CellSchema = z.object({
  duration_minutes: z.number().int().min(60).max(420).multipleOf(60),
  persons_per_lesson: z.number().int().min(1).max(5),
  price_chf: z.number().positive().max(100000).nullable(),
});
const BodySchema = z.object({
  product_id: z.string().uuid(),
  cells: z.array(CellSchema).max(35),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = await requireRole(req, ["admin", "office"], corsHeaders);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid tariff input", details: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("save_product_private_tariffs", {
    p_product_id: parsed.data.product_id,
    p_cells: parsed.data.cells,
    p_actor: auth.userId,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ tariffs: data ?? [] }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
