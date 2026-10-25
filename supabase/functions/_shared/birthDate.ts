// B08: dependency-free birth-date rule shared by Edge Functions and the frontend.
// A birth date must be a real calendar date (YYYY-MM-DD) not after the school's "today"
// (Europe/Zurich, same day boundary as SQL pa_business_today). Today itself is valid.
// No minimum age is implied here; course age eligibility stays separate.

export const SCHOOL_TIME_ZONE = "Europe/Zurich";

/** School-local calendar date (YYYY-MM-DD) for an instant, independent of the runtime's timezone. */
export function schoolToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True only for an existing calendar date written as YYYY-MM-DD (rejects 2027-02-30, 2026-02-29). */
export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= days;
}

export type BirthDateIssue = "invalid" | "future";

export function birthDateIssue(value: unknown, now: Date = new Date()): BirthDateIssue | null {
  if (typeof value !== "string" || !isRealDate(value)) return "invalid";
  return value > schoolToday(now) ? "future" : null;
}

export const BIRTH_DATE_MESSAGES: Record<BirthDateIssue, string> = {
  invalid: "Ungültiges Geburtsdatum.",
  future: "Das Geburtsdatum darf nicht in der Zukunft liegen.",
};
