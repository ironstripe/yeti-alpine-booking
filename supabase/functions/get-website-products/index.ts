// Public-site product projection; the OnePager calls this server-to-server with x-api-key.
// No import drafts, HR data, raw source rows, or out-of-season products are returned.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkApiKey, corsHeaders, json } from "../_shared/intakeAuth.ts";

const INTERNAL_TYPES = new Set(["office_shift"]);
const ICONS = new Set(["user", "users", "baby", "calendar", "snowflake", "trophy", "sparkles"]);
const META_ICONS = new Set(["calendar", "clock", "users", "map"]);
const BADGES = new Set(["beliebt", "empfohlen"]);
const positive = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) > 0;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const authErr = checkApiKey(req);
  if (authErr) return authErr;
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: seasons, error: seasonError } = await db.from("seasons")
      .select("id,name,start_date,end_date").eq("is_current", true).limit(2);
    if (seasonError) throw seasonError;
    if (seasons?.length !== 1) return json({ error: "No unique website season" }, 503);
    const season = seasons[0];

    const { data: rows, error: productError } = await db.from("products")
      .select("id,name,type,discipline,audience,price,pricing_type,currency,duration_minutes,min_age,max_age,sort_order,website_subtitle,website_requirement,website_meta,website_notes,website_badge,website_icon_key,website_online_bookable")
      .eq("season_id", season.id).eq("is_active", true).order("sort_order");
    if (productError) throw productError;
    const offerings = (rows ?? []).filter((p) => !INTERNAL_TYPES.has(p.type));
    const ids = offerings.map((p) => p.id);
    const { data: tiers, error: tiersError } = ids.length
      ? await db.from("product_price_tiers").select("product_id,day_count,cumulative_price")
        .in("product_id", ids).order("day_count")
      : { data: [], error: null };
    if (tiersError) throw tiersError;

    // Private 26/27 duration/person amounts live in staff-protected source rows;
    // expose only their approved numeric tariff fields once their product is active.
    const privateIds = offerings.filter((p) => p.type === "private").map((p) => p.id);
    const { data: sourceRates, error: rateError } = privateIds.length
      ? await db.from("bc_product_tariff_sources")
        .select("product_id,duration_minutes,persons_per_lesson,price_chf")
        .eq("import_status", "draft").in("product_id", privateIds)
      : { data: [], error: null };
    if (rateError) throw rateError;

    const products = offerings.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.name,
      subtitle: p.website_subtitle || "",
      type: p.type,
      discipline: p.discipline === "ski" || p.discipline === "snowboard" ? p.discipline : "other",
      audience: p.audience,
      icon_key: ICONS.has(p.website_icon_key) ? p.website_icon_key : null,
      badge: BADGES.has(p.website_badge) ? p.website_badge : null,
      requirement: p.website_requirement || null,
      meta: Array.isArray(p.website_meta) ? p.website_meta.filter((m) => m &&
        typeof m.label === "string" && m.label.length <= 160 && META_ICONS.has(m.icon))
        .map((m) => ({ label: m.label, icon: m.icon })) : [],
      notes: Array.isArray(p.website_notes) ? p.website_notes.filter((n) => typeof n === "string" && n.length <= 250) : [],
      pricing_type: p.pricing_type,
      price: Number(p.price),
      price_tiers: (tiers ?? []).filter((t) => t.product_id === p.id &&
        Number.isInteger(t.day_count) && t.day_count >= 1 && t.day_count <= 7 && positive(t.cumulative_price))
        .map((t) => ({ day_count: t.day_count, cumulative_price: Number(t.cumulative_price) })),
      private_rates: (sourceRates ?? []).filter((r) => r.product_id === p.id &&
        Number.isInteger(r.duration_minutes) && Number.isInteger(r.persons_per_lesson) && positive(r.price_chf))
        .map((r) => ({ duration_minutes: r.duration_minutes, persons: r.persons_per_lesson, price: Number(r.price_chf) }))
        .sort((a, b) => a.duration_minutes - b.duration_minutes || a.persons - b.persons),
      duration_minutes: p.duration_minutes,
      min_age: p.min_age,
      max_age: p.max_age,
      currency: p.currency || "CHF",
      sort_order: p.sort_order ?? 0,
      // The release guard currently forces false in production; do not infer this
      // from is_active or from price alone.
      online_bookable: p.website_online_bookable === true,
    })).sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "de"));

    return json({ season, products });
  } catch (error) {
    console.error("get-website-products failed", error);
    return json({ error: "Website catalog unavailable" }, 503);
  }
});
