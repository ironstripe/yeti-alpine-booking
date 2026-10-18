// Private product tariff matrix helpers: durations 1..7h x 1..5 persons.
// Effective prices live in product_private_tariffs; Booking-Corner originals
// (bc_product_tariff_sources) are read-only display fallback/comparison.

export const TARIFF_DURATIONS_MINUTES = [60, 120, 180, 240, 300, 360, 420] as const;
export const TARIFF_PERSONS = [1, 2, 3, 4, 5] as const;

export interface TariffCell {
  duration_minutes: number;
  persons_per_lesson: number;
  price_chf: number;
}

export interface TariffCellInput {
  duration_minutes: number;
  persons_per_lesson: number;
  price_chf: number | null;
}

export function cellKey(durationMinutes: number, persons: number): string {
  return `${durationMinutes}:${persons}`;
}

export function toCellMap(cells: TariffCell[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of cells) {
    map.set(cellKey(c.duration_minutes, c.persons_per_lesson), Number(c.price_chf));
  }
  return map;
}

/**
 * Build the minimal save payload: only cells whose value differs from the
 * currently persisted effective matrix. A blanked previously-set cell is sent
 * with price_chf null (removal). Returns null when nothing changed.
 */
export function buildTariffSavePayload(
  persisted: Map<string, number>,
  edited: Map<string, number | null>,
): TariffCellInput[] | null {
  const cells: TariffCellInput[] = [];
  for (const [key, value] of edited) {
    const [duration, persons] = key.split(":").map(Number);
    const before = persisted.get(key);
    if (value === null) {
      if (before !== undefined) {
        cells.push({ duration_minutes: duration, persons_per_lesson: persons, price_chf: null });
      }
    } else if (before !== value) {
      cells.push({ duration_minutes: duration, persons_per_lesson: persons, price_chf: value });
    }
  }
  for (const [key] of persisted) {
    if (!edited.has(key)) {
      const [duration, persons] = key.split(":").map(Number);
      cells.push({ duration_minutes: duration, persons_per_lesson: persons, price_chf: null });
    }
  }
  return cells.length ? cells : null;
}

/** Validate one edited price entry. Returns an error message or null. */
export function validateTariffPrice(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) return "Preis muss grösser als 0 sein";
  if (value > 100000) return "Preis ist unrealistisch hoch";
  return null;
}
