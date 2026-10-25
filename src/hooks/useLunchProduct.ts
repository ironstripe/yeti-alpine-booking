// B09: lunch-supervision product resolved for the BOOKED course product's season and dates — the same
// rule bc_2627_staff_group_book applies per line (supabase/pending/group_lunch_season.sql):
// booked product -> products.season_id -> seasons (all dates inside) -> exactly one active
// products(type='lunch', same season) at CHF 30. Never today's season, labels, first row or a global singleton.
// Preview only: the server re-resolves and rejects a mismatching lunch_product_id.
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GROUP_LUNCH_PRICE_CHF } from "@/lib/groupLunch";

export interface LunchProductInfo { id: string; price: number; seasonId: string }
export interface LunchContext { productId: string | null | undefined; dates: string[] }

export type LunchResolution =
  | { ok: true; product: LunchProductInfo }
  | { ok: false; reason: "no_context" | "season" | "dates" | "missing" | "ambiguous" | "price" };

export const lunchContextKey = (ctx: LunchContext) =>
  ["lunch-product", "season", ctx.productId ?? null, [...new Set(ctx.dates)].sort().join(",")] as const;

type Row = { id: string; price: number | string | null };
export function pickSeasonLunch(
  season: { id: string; start_date: string; end_date: string } | null,
  dates: string[],
  lunchRows: Row[],
): LunchResolution {
  if (!season) return { ok: false, reason: "season" };
  if (dates.length === 0 || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < season.start_date || d > season.end_date)) {
    return { ok: false, reason: "dates" };
  }
  if (lunchRows.length === 0) return { ok: false, reason: "missing" };
  if (lunchRows.length > 1) return { ok: false, reason: "ambiguous" };
  const price = Number(lunchRows[0].price);
  if (price !== GROUP_LUNCH_PRICE_CHF) return { ok: false, reason: "price" };
  return { ok: true, product: { id: lunchRows[0].id, price, seasonId: season.id } };
}

export async function resolveLunchProduct(ctx: LunchContext): Promise<LunchResolution> {
  if (!ctx.productId || ctx.dates.length === 0) return { ok: false, reason: "no_context" };
  const { data: booked, error } = await supabase.from("products").select("season_id").eq("id", ctx.productId).maybeSingle();
  if (error) throw error;
  if (!booked?.season_id) return pickSeasonLunch(null, ctx.dates, []);
  const { data: season, error: sErr } = await supabase.from("seasons").select("id, start_date, end_date").eq("id", booked.season_id).maybeSingle();
  if (sErr) throw sErr;
  const { data: rows, error: lErr } = await supabase.from("products").select("id, price")
    .eq("type", "lunch").eq("is_active", true).eq("season_id", booked.season_id);
  if (lErr) throw lErr;
  return pickSeasonLunch(season ?? null, [...new Set(ctx.dates)], rows ?? []);
}

/** Resolved product or null (missing/ambiguous/out-of-season => lunch cannot be priced or saved). */
export async function fetchLunchProduct(ctx: LunchContext): Promise<LunchProductInfo | null> {
  const r = await resolveLunchProduct(ctx);
  return r.ok ? r.product : null;
}

const queryOptions = (ctx: LunchContext) => ({
  queryKey: lunchContextKey(ctx),
  queryFn: () => fetchLunchProduct(ctx),
  enabled: !!ctx.productId && ctx.dates.length > 0,
  staleTime: 60_000,
});

export function useLunchProduct(ctx: LunchContext) {
  return useQuery(queryOptions(ctx));
}

/** One resolution per booked context (per-participant mode may mix courses). */
export function useLunchProducts(contexts: LunchContext[]) {
  const results = useQueries({ queries: contexts.map(queryOptions) });
  return contexts.map((ctx, i) => ({ ctx, data: results[i]?.data ?? null, isLoading: !!results[i]?.isLoading }));
}
