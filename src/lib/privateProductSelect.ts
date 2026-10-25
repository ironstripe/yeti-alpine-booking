// Which private product a wizard item books. Legacy (tariff switch OFF): unchanged duration+name match.
// Product tariffs (B07): a tariff product covers every duration, so the choice is per sport within the
// current season's active private products and must be unique; otherwise no product (fail closed,
// never a generic fallback or a legacy fixed-duration product).
export interface PrivateProductRow { id: string; type: string | null; name: string; duration_minutes: number | null }

export type PrivateProductChoice =
  | { kind: "product"; product: PrivateProductRow }
  | { kind: "none"; reason: "missing" | "ambiguous" | "incomplete" };

const sportName = (s: "ski" | "snowboard") => (s === "ski" ? "Ski" : "Snowboard");

export function selectPrivateProduct(
  products: PrivateProductRow[], sport: "ski" | "snowboard" | null, durationHours: number | null, tariffs: boolean,
): PrivateProductChoice {
  if (!sport) return { kind: "none", reason: "incomplete" };
  const bySport = products.filter((p) => p.type === "private" && p.name.includes(sportName(sport)));
  if (!tariffs) {
    if (!durationHours) return { kind: "none", reason: "incomplete" };
    const p = bySport.find((x) => x.duration_minutes === durationHours * 60);
    return p ? { kind: "product", product: p } : { kind: "none", reason: "missing" };
  }
  if (bySport.length === 1) return { kind: "product", product: bySport[0] };
  return { kind: "none", reason: bySport.length === 0 ? "missing" : "ambiguous" };
}
