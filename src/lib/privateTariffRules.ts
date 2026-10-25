// B07-P: product-configured private tariff rules (client-side types + editor validation).
// The authoritative resolver is SQL `pa_product_quote`; nothing here computes a booking price.
// No rate value lives in code: rules are product configuration.

/**
 * Release switch: OFF until product_private_tariff_rules.sql is installed, every active private
 * product has reviewed rules, and the updated `private-appointments` function is deployed.
 * While OFF, office creates behave exactly as before (no quote call, no quote_revision).
 */
export const PRODUCT_PRIVATE_TARIFFS_LIVE = false;

/**
 * Effective switch. Production builds: exactly PRODUCT_PRIVATE_TARIFFS_LIVE. Local dev server only:
 * localStorage "yeti.privateTariffPreview" = "1" enables the path for intercepted browser tests
 * (the backend still rejects it until the pending SQL/function are installed).
 */
export function privateTariffsLive(): boolean {
  if (PRODUCT_PRIVATE_TARIFFS_LIVE) return true;
  if (!import.meta.env.DEV) return false;
  try { return globalThis.localStorage?.getItem("yeti.privateTariffPreview") === "1"; } catch { return false; }
}

export type TariffRuleKind = "exact_block" | "hourly";

export interface TariffRule {
  rule_kind: TariffRuleKind;
  window_start: string; // HH:MM
  window_end: string;   // HH:MM
  price_chf: number;
  extra_person_chf: number;
  max_persons: number;
  max_block_minutes: number | null;
  office_only: boolean;
  provenance: string;
}

const toMin = (t: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Returns one German error per invalid rule index (empty = valid). Mirrors the SQL save checks. */
export function validateTariffRules(rules: TariffRule[]): Map<number, string> {
  const errors = new Map<number, string>();
  rules.forEach((r, i) => {
    const s = toMin(r.window_start), e = toMin(r.window_end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return void errors.set(i, "Zeitfenster ungültig");
    if (r.rule_kind === "hourly" && (s % 60 !== 0 || e % 60 !== 0)) return void errors.set(i, "Stundentarif nur zu vollen Stunden");
    if (!(r.price_chf > 0)) return void errors.set(i, "Preis muss grösser als 0 sein");
    if (!(r.extra_person_chf >= 0)) return void errors.set(i, "Zuschlag pro Person ungültig");
    if (!Number.isInteger(r.max_persons) || r.max_persons < 1 || r.max_persons > 5) return void errors.set(i, "Max. Personen 1–5");
    if (r.max_block_minutes !== null && (r.rule_kind !== "hourly" || r.max_block_minutes < 60 || r.max_block_minutes % 60 !== 0))
      return void errors.set(i, "Max. Dauer nur für Stundentarif, volle Stunden");
    if (!r.provenance.trim()) return void errors.set(i, "Quelle angeben");
  });
  rules.forEach((a, i) => rules.forEach((b, j) => {
    if (j <= i || a.rule_kind !== b.rule_kind) return;
    const as = toMin(a.window_start), ae = toMin(a.window_end), bs = toMin(b.window_start), be = toMin(b.window_end);
    if (a.rule_kind === "exact_block" && as === bs && ae === be) errors.set(j, "Gleicher Block doppelt");
    if (a.rule_kind === "hourly" && as < be && bs < ae) errors.set(j, "Überschneidet anderen Stundentarif");
  }));
  return errors;
}

export const TARIFF_UNAVAILABLE_REASONS: Record<string, string> = {
  not_configured: "Für dieses Produkt sind keine Tarife hinterlegt.",
  no_rule: "Für diese Zeit ist kein Tarif hinterlegt.",
  ambiguous: "Die Tarife dieses Produkts sind mehrdeutig.",
  block_not_allowed: "Für diese Dauer/Zeit ist kein Tarif hinterlegt (nur Einzelstunde erlaubt).",
  office_only: "Dieser Tarif ist nur als Büro-Ausnahme buchbar.",
  persons_exceeded: "Zu viele Personen für diesen Tarif.",
  invalid_input: "Ungültige Zeitangabe.",
  discount_rule_not_configured: "Die Rabattregel für Privatlektionen ist nicht hinterlegt.",
};
