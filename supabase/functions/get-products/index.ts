// Public endpoint: list active products/courses of the current season with prices.
// Used by the website to render course overview/detail pages without hardcoded prices.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Current season by today's date
    const today = new Date().toISOString().slice(0, 10);
    const { data: season } = await supabase
      .from("seasons")
      .select("id, name, start_date, end_date")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let query = supabase
      .from("products")
      .select("id, name, description, type, duration_minutes, price, currency, vat_rate, pricing_type, min_age, max_age, sort_order, season_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (season) query = query.eq("season_id", season.id);

    const { data: products, error } = await query;
    if (error) throw new Error(error.message);

    // Attach price tiers
    const ids = (products ?? []).map((p) => p.id);
    let tiers: any[] = [];
    if (ids.length > 0) {
      const { data: t } = await supabase
        .from("product_price_tiers")
        .select("product_id, day_count, cumulative_price")
        .in("product_id", ids)
        .order("day_count", { ascending: true });
      tiers = t ?? [];
    }

    const result = (products ?? []).map((p) => ({
      ...p,
      price_tiers: tiers.filter((t) => t.product_id === p.id),
    }));

    return json({ success: true, season, products: result });
  } catch (e) {
    console.error("get-products error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
