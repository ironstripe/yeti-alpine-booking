// B07b: optional "combined chain" mode for the B04/B05/B06 delivery suites.
// B07_COMBINED_CHAIN=1 installs every drizzle migration after the baseline and, after each pending file a
// suite installs itself, the remaining pending files of the tested install order — so delivery code runs
// against the full B01-B11 + B07-P + L1 + B07a + activation-guard database, not only its own files.
export const COMBINED = Deno.env.get("B07_COMBINED_CHAIN") === "1";
export const PENDING_ORDER = [
  "b04_delivery_compatibility.sql", "b06_invoice_delivery.sql", "b11_created_total_event.sql",
  "participant_birth_date_guard.sql", "group_lunch_full_day.sql", "group_lunch_season.sql",
  "pa_edit_booking.sql", "b05_office_confirmation_intent.sql",
  "product_private_tariff_rules.sql", "pa_tariff_l1.sql", "b07a_office_multi_create.sql", "b07_private_activation_guard.sql",
];
export function migrations(root: URL): string[] {
  const dir = new URL("drizzle/migrations/", root);
  return [...Deno.readDirSync(dir)].map((e) => e.name).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort().map((n) => new URL(n, dir).pathname);
}
/** Pending files strictly after `after` and strictly before `until` (exclusive), as absolute paths. */
export function segment(root: URL, after: string, until?: string): string[] {
  const a = PENDING_ORDER.indexOf(after), b = until ? PENDING_ORDER.indexOf(until) : PENDING_ORDER.length;
  if (a < 0 || b < 0) throw new Error("unknown pending file");
  return PENDING_ORDER.slice(a + 1, b).map((f) => new URL(`supabase/pending/${f}`, root).pathname);
}
