import { privateTariffsLive } from "@/lib/privateTariffRules";

/**
 * Which private tariff editors the product form shows.
 * - matrix: obsolete per-duration grid (product_private_tariffs) — never released, always OFF.
 * - rules: B07-P product tariff rules (saved via product-private-tariff-rules) — follows the B07 release switch.
 */
export function privateTariffEditors(isEditing: boolean, productType: string | null | undefined) {
  const privateEdit = isEditing && productType === "private";
  return { matrix: false, rules: privateEdit && privateTariffsLive() };
}
