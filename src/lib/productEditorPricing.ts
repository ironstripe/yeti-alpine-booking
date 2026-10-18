import { z } from "zod";
import { getDefaultPriceTiers, type PriceTier } from "./pricing-utils";

export const editorPricingTypeSchema = z.enum(["fixed", "tiered", "hourly", "flat"]);
interface StoredPricing {
  pricing_type: string | null;
  price: number;
  price_tiers?: PriceTier[];
}
interface EditorPricing {
  pricing_type: z.infer<typeof editorPricingTypeSchema>;
  price?: number;
  price_tiers: PriceTier[];
}

export function editorPriceTiers(stored: PriceTier[] = []): PriceTier[] {
  const tiers = new Map(getDefaultPriceTiers().map(tier => [tier.day_count, tier]));
  for (const tier of stored) tiers.set(tier.day_count, { ...tier, cumulative_price: Number(tier.cumulative_price) });
  return [...tiers.values()].sort((a, b) => a.day_count - b.day_count);
}

function sameTiers(a: PriceTier[], b: PriceTier[]) {
  const sorted = (tiers: PriceTier[]) => [...tiers].sort((x, y) => x.day_count - y.day_count);
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

// Metadata saves omit pricing fields and never replace tiers.
export function productEditorPricingPatch(data: EditorPricing, original: StoredPricing | null) {
  const type = data.pricing_type;
  const storedDays = new Set(original?.price_tiers?.map(tier => tier.day_count));
  const tiers = data.price_tiers.filter(tier => tier.cumulative_price > 0 || storedDays.has(tier.day_count));
  const modelChanged = !original || type !== (original.pricing_type || "fixed");
  const priceChanged = !original || (data.price ?? 0) !== original.price;
  const tiersChanged = type === "tiered" && !sameTiers(tiers, original?.price_tiers ?? []);
  return {
    ...(modelChanged ? { pricing_type: type } : {}),
    ...(modelChanged || (type !== "tiered" && priceChanged)
      ? { price: type === "tiered" ? 0 : (data.price ?? 0) } : {}),
    ...(type === "tiered" && (modelChanged || tiersChanged) ? { price_tiers: tiers } : {}),
  };
}

export function productTierWriteAction(pricingType: string | null | undefined, tiers: PriceTier[] | undefined) {
  if (tiers !== undefined && (pricingType === undefined || pricingType === "tiered")) return "replace";
  if (pricingType === "fixed" || pricingType === "hourly") return "delete";
  return "keep";
}
