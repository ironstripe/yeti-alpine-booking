// B08: same birth-date rule as the server (shared, dependency-free).
export { schoolToday, isRealDate, birthDateIssue, BIRTH_DATE_MESSAGES, type BirthDateIssue } from "../../supabase/functions/_shared/birthDate";

import { birthDateIssue, BIRTH_DATE_MESSAGES } from "../../supabase/functions/_shared/birthDate";

/** Local calendar date of a picker value as YYYY-MM-DD (no UTC shift). */
export function pickerDateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Error message for a NEW or CHANGED birth date; unchanged existing values are never re-judged. */
export function birthDateChangeError(next: string | null, existing: string | null = null, now: Date = new Date()): string | null {
  if (next === null || next === existing) return null;
  const issue = birthDateIssue(next, now);
  return issue ? BIRTH_DATE_MESSAGES[issue] : null;
}
