// Informational catalog for Malbun 26/27; visibility is an explicit product decision.
// The OnePager calls this endpoint server-to-server with x-api-key.
// Selected products in the single current season may be shown, including inactive drafts;
// web reservations must stay disabled until pricing and concrete dates are verified.
import { createClient } from "npm:@supabase/supabase-js@2";
import { seriesDates, type ProductSeries } from '../_shared/productOffering.ts';
import { publicPrivateProjection } from '../_shared/publicPrivateTariffDisplay.ts';
import { checkApiKey, corsHeaders, json } from "../_shared/intakeAuth.ts";

const INTERNAL_TYPES = new Set(["office_shift"]);
const positive = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) > 0;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const authErr = checkApiKey(req);
  if (authErr) return authErr;
  try {
    const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url || !key) return json({error:"Service unavailable"},503);
    const db = createClient(url,key);
    const { data: seasons, error: seasonError } = await db.from("seasons")
      .select("id,name,start_date,end_date").eq("is_current", true).limit(2);
    if (seasonError) throw seasonError;
    if (seasons?.length !== 1) return json({ error: "No unique website season" }, 503);
    const season = seasons[0];

    const { data: rows, error: productError } = await db.from("products")
      .select("id,name,type,discipline,audience,price,pricing_type,currency,duration_minutes,min_age,max_age,sort_order,is_active")
      .eq("season_id", season.id).eq("show_on_website", true).order("sort_order");
    if (productError) throw productError;
    const offerings = (rows ?? []).filter((p) => !INTERNAL_TYPES.has(p.type));
    const ids = offerings.map((p) => p.id);
    const { data: tiers, error: tiersError } = ids.length
      ? await db.from("product_price_tiers").select("product_id,day_count,cumulative_price")
        .in("product_id", ids).order("day_count")
      : { data: [], error: null };
    if (tiersError) throw tiersError;
    // Install the incremental series migration before deploying this revision.
    const { data: publicSchedules, error: offeringError } = ids.length
      ? await db.from("product_public_offerings")
        .select("product_id,schedule_kind,weekdays,dates,time_blocks,display_schedule_text,series").in("product_id", ids)
      : { data: [], error: null };
    if (offeringError) throw offeringError;

    // Publish only numeric prices bound to the two private products, never raw source rows.
    const privateIds = offerings.filter((p) => p.type === "private").map((p) => p.id);
    const { data: sourceRates, error: rateError } = privateIds.length
      ? await db.from("bc_product_tariff_sources")
        .select("product_id,duration_minutes,persons_per_lesson,price_chf")
        .eq("import_status", "draft").in("product_id", privateIds)
      : { data: [], error: null };
    if (rateError) throw rateError;

    // Optional information only: installed and explicitly Office-verified rows.
    // Missing table during staged installation omits fields, never invents prices.
    const { data: displayRates, error: displayError } = privateIds.length
      ? await db.from("public_private_tariff_display").select("product_id,season_id,windows,base_persons,discount_percent,discount_threshold,discount_unit,discount_scope,source_note,source_date,verified_by,verified_at")
        .eq("season_id", season.id).in("product_id", privateIds).not("verified_at", "is", null)
      : { data: [], error: null };
    if (displayError && !["42P01", "PGRST205"].includes(displayError.code)) throw displayError;

    // Contract: products only, keyed by products.id. Internal scheduling data
    // (courses, instances, staff) is never queried or exposed here. The raw
    // product description holds BC import notes and stays unpublished until
    // editorially verified.
    const products = offerings.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.name,
      subtitle: "", // Editorial copy belongs in YETI; do not reuse unverified old website copy.
      type: p.type,
      discipline: p.discipline === "ski" || p.discipline === "snowboard" ? p.discipline : "other",
      audience: p.audience,
      icon_key: p.type === "private" ? "user" : p.type === "group_toddler" ? "baby" : "users",
      badge: null,
      requirement: null,
      meta: [],
      notes: [],
      public_offering: (() => {
        const o = (publicSchedules ?? []).find((row) => row.product_id === p.id);
        return o ? { schedule_kind: o.schedule_kind, weekdays: o.weekdays, dates: o.dates, time_blocks: o.time_blocks, display_schedule_text: o.display_schedule_text ?? null, ...(o.series?.length ? {series:o.series.map((s:ProductSeries)=>({sequence:s.sequence,label:s.label ?? null,start_date:s.start_date,end_date:s.end_date,max_selected_days:s.max_selected_days,dates:seriesDates(s,o.weekdays)}))} : {}) } : null;
      })(),
      pricing_type: p.pricing_type,
      // Informational only: private requires a real availability check, group
      // compatibility label is not a date promise: group dates need a suitable
      // internal offered course, without capacity sales limits. Neither
      // schedule metadata nor visibility enables booking.
      availability_policy: p.type === "private" ? "private_check" : "group_season",
      price: Number(p.price),
      price_tiers: (tiers ?? []).filter((t) => t.product_id === p.id &&
        Number.isInteger(t.day_count) && t.day_count >= 1 && t.day_count <= 7 && positive(t.cumulative_price))
        .map((t) => ({ day_count: t.day_count, cumulative_price: Number(t.cumulative_price) })),
      private_rates: (sourceRates ?? []).filter((r) => r.product_id === p.id &&
        Number.isInteger(r.duration_minutes) && Number.isInteger(r.persons_per_lesson) && positive(r.price_chf))
        .map((r) => ({ duration_minutes: r.duration_minutes, persons: r.persons_per_lesson, price: Number(r.price_chf) }))
        .sort((a, b) => a.duration_minutes - b.duration_minutes || a.persons - b.persons),
      ...(p.type === "private" ? publicPrivateProjection((displayRates ?? []).find((r) => r.product_id === p.id && r.season_id === season.id)) ?? {} : {}),
      duration_minutes: p.duration_minutes,
      min_age: p.min_age,
      max_age: p.max_age,
      currency: p.currency || "CHF",
      sort_order: p.sort_order ?? 0,
      // Intentional one-way publication: even active products are not web-bookable here.
      online_bookable: false,
    })).sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "de"));

    return json({ season, products });
  } catch (error) {
    console.error("get-website-products failed", error);
    return json({ error: "Website catalog unavailable" }, 503);
  }
});
