// Pure, fail-closed season resolution and product eligibility for get-products (#15).
// No fallback to "all active products": no season, an ambiguous season or a query
// error yields no products. Only active, website-visible products of the single
// current season are eligible.

export type SeasonRow = { id: string; name: string; start_date: string; end_date: string };

export type SeasonResolution =
  | { ok: true; season: SeasonRow }
  | { ok: false; code: "season_query_failed" | "no_current_season" | "ambiguous_season"; status: number };

export function resolveCurrentSeason(
  rows: SeasonRow[] | null | undefined,
  error: unknown,
  today: string,
): SeasonResolution {
  if (error || !Array.isArray(rows)) return { ok: false, code: "season_query_failed", status: 503 };
  const covering = rows.filter((s) => s && s.start_date <= today && s.end_date >= today);
  if (covering.length === 0) return { ok: false, code: "no_current_season", status: 503 };
  if (covering.length > 1) return { ok: false, code: "ambiguous_season", status: 503 };
  return { ok: true, season: covering[0] };
}

export type ProductRow = {
  id: string;
  season_id: string;
  type: string;
  is_active: boolean | null;
  show_on_website: boolean | null;
  [k: string]: unknown;
};

/** Defence in depth: re-filter even though the query already filters. */
export function eligibleProducts<T extends ProductRow>(rows: T[] | null | undefined, seasonId: string): T[] {
  return (rows ?? []).filter((p) => p.season_id === seasonId && p.is_active === true && p.show_on_website === true && p.type !== "office_shift");
}
