/**
 * Display-only label for a product's stored duration (e.g. the "CHF 70.– /2h" suffix).
 * Never recompute prices, booking minutes or payroll from this value.
 *
 * Confirmed rule: a booked clock block includes a 5-minute change-over, so stored
 * effective teaching minutes run slightly under the clock hours (55 / 115 / 230 for
 * 1 / 2 / 4 clock hours). Show whole clock hours instead of fractional hours.
 */
export function formatDurationLabel(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 45) return `${Math.round(minutes)}min`;
  return `${Math.max(1, Math.round(minutes / 60))}h`;
}
