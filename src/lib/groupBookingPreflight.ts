// #15 containment: strict preflight for every group-course line of a staff booking,
// run BEFORE any write (ticket number, ticket, items, payments). It does not price
// 26/27 source-bound products — those are rejected until the canonical
// source-aware atomic server booking RPC is integrated. This is containment only;
// the browser still writes ticket + items in several steps (see docs/issues-15-36-status.md).

export interface GroupLineRequest {
  /** Label for error messages, e.g. participant name or "Buchung". */
  label: string;
  courseId: string | null;
  dates: string[];
}

export interface PreflightCourse { id: string; name: string; product_id: string | null; price_per_day: number | null; is_active: boolean | null }
export interface PreflightProduct { id: string; name: string; is_active: boolean | null; season_id: string; price: number | null; type: string; pricing_type?: string | null }
export interface PreflightSeason { id: string; name: string; start_date: string; end_date: string }

export interface PreflightInput {
  lines: GroupLineRequest[];
  courses: PreflightCourse[];
  products: PreflightProduct[];
  seasons: PreflightSeason[];
  /** Product IDs with any 26/27 tariff source row. */
  sourceBoundProductIds: Set<string>;
  /** Names of seasons whose products are source-bound regardless of evidence rows. */
  sourceBoundSeasonNames?: string[];
}

export interface PricedCourse { productId: string; unitPrice: number }
export type PreflightResult =
  | { ok: true; priced: Map<string, PricedCourse> }
  | { ok: false; errors: string[] };

const DEFAULT_SOURCE_SEASONS = ["Winter 26/27"];
/** Real YETI group-course product types; private/office_shift/lunch are rejected. */
const GROUP_PRODUCT_TYPES = new Set(["group", "group_toddler"]);
/** Only "fixed" means product.price is a per-day price (price × days). tiered/flat/hourly are not. */
const DAILY_PRICING_TYPES = new Set(["fixed"]);
/** Strict YYYY-MM-DD that is a real calendar date. */
export function isRealIsoDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function preflightGroupLines(input: PreflightInput): PreflightResult {
  const errors: string[] = [];
  const priced = new Map<string, PricedCourse>();
  const sourceSeasons = input.sourceBoundSeasonNames ?? DEFAULT_SOURCE_SEASONS;

  for (const line of input.lines) {
    const who = line.label;
    if (!line.courseId) { errors.push(`${who}: Kein Gruppenkurs ausgewählt.`); continue; }
    if (line.dates.length === 0) { errors.push(`${who}: Keine Kursdaten ausgewählt.`); continue; }
    const invalid = line.dates.filter((d) => !isRealIsoDate(d));
    if (invalid.length > 0) { errors.push(`${who}: Ungültiges Datum ${invalid.join(", ")}.`); continue; }
    const dupes = [...new Set(line.dates.filter((d, i) => line.dates.indexOf(d) !== i))];
    if (dupes.length > 0) { errors.push(`${who}: Datum ${dupes.join(", ")} ist mehrfach ausgewählt.`); continue; }
    const course = input.courses.find((c) => c.id === line.courseId);
    if (!course) { errors.push(`${who}: Gruppenkurs nicht gefunden.`); continue; }
    if (course.is_active !== true) { errors.push(`${who}: Gruppenkurs „${course.name}“ ist nicht aktiv.`); continue; }
    if (!course.product_id) {
      errors.push(`${who}: Gruppenkurs „${course.name}“ ist mit keinem Produkt verknüpft. Bitte im Kurs ein Produkt hinterlegen.`);
      continue;
    }
    const product = input.products.find((p) => p.id === course.product_id);
    if (!product) { errors.push(`${who}: Verknüpftes Produkt von „${course.name}“ nicht gefunden.`); continue; }
    if (product.is_active !== true) { errors.push(`${who}: Produkt „${product.name}“ ist nicht aktiv.`); continue; }
    if (!GROUP_PRODUCT_TYPES.has(product.type)) {
      errors.push(`${who}: Produkt „${product.name}“ ist kein Gruppenkurs-Produkt (Typ ${product.type}).`);
      continue;
    }

    const season = input.seasons.find((s) => s.id === product.season_id);
    if (!season) { errors.push(`${who}: Saison von „${product.name}“ nicht gefunden.`); continue; }
    if (input.sourceBoundProductIds.has(product.id) || sourceSeasons.includes(season.name)) {
      errors.push(
        `${who}: „${product.name}“ (${season.name}) ist an Booking-Corner-Tarife gebunden und kann hier noch nicht gebucht werden. ` +
          `Die Buchung über die serverseitige Tarifberechnung ist noch nicht freigeschaltet.`,
      );
      continue;
    }
    const outside = line.dates.filter((d) => d < season.start_date || d > season.end_date);
    if (outside.length > 0) {
      errors.push(`${who}: Datum ${outside.join(", ")} liegt ausserhalb der Saison ${season.name} von „${product.name}“.`);
      continue;
    }

    // Legacy supported path: course day price; product price only if it is an explicit per-day ("fixed") price.
    // Cumulative/tiered/flat/hourly product prices are never read as a day price. Never 0/NaN.
    const dailyProductPrice = DAILY_PRICING_TYPES.has(String(product.pricing_type ?? "")) && positive(product.price) ? product.price : null;
    const unitPrice = positive(course.price_per_day) ? course.price_per_day : dailyProductPrice;
    if (unitPrice === null) {
      errors.push(`${who}: Für „${course.name}“ ist kein gültiger Preis (> 0) hinterlegt.`);
      continue;
    }
    priced.set(course.id, { productId: product.id, unitPrice });
  }
  return errors.length ? { ok: false, errors } : { ok: true, priced };
}
