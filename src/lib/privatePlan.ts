// Canonical private-lesson plan helpers.
// When a wizard has `appointments`, that list IS the plan; everything else is derived.
import type { AppointmentSlot, TimeBlock, TimeSelection } from "@/contexts/BookingWizardContext";

export const PLAN_DAY_START = "09:00";
export const PLAN_DAY_END = "16:00";

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const endOf = (a: AppointmentSlot) => fromMin(toMin(a.startTime) + a.durationMinutes);

export interface WizardTimeWindow {
  startTime: string;
  endTime: string;
  duration: number;
}

/** Parse the shared wizard time window without inventing a default. */
export function parseWizardTimeSlot(slot: string | null | undefined): WizardTimeWindow | null {
  if (!slot) return null;
  const match = slot.match(/^(\d{2}:\d{2}) - (\d{2}:\d{2})$/);
  if (!match) return null;
  const startTime = match[1];
  const endTime = match[2];
  const startMinutes = toMin(startTime);
  const endMinutes = toMin(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null;
  return { startTime, endTime, duration: (endMinutes - startMinutes) / 60 };
}

/** Build a complete wizard time window, or null while either control is incomplete. */
export function buildWizardTimeSlot(startTime: string | null, endTime: string | null): WizardTimeWindow | null {
  if (!startTime || !endTime) return null;
  return parseWizardTimeSlot(`${startTime} - ${endTime}`);
}

/** A private booking needs either one complete shared window or a valid canonical plan. */
export function hasValidPrivateTiming(
  timeSlot: string | null | undefined,
  appointments: AppointmentSlot[] | null | undefined,
): boolean {
  if (appointments && appointments.length > 0) return validatePlan(appointments) === null;
  return parseWizardTimeSlot(timeSlot) !== null;
}

export function sortPlan(list: AppointmentSlot[]): AppointmentSlot[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

/** Returns a German error message, or null when the plan is valid. */
export function validatePlan(list: AppointmentSlot[]): string | null {
  for (const a of list) {
    const s = toMin(a.startTime);
    const e = s + a.durationMinutes;
    if (!a.date || Number.isNaN(s)) return "Ungültige Zeitangabe.";
    if (a.durationMinutes <= 0) return `${a.date}: Ende muss nach dem Beginn liegen.`;
    if (s < toMin(PLAN_DAY_START) || e > toMin(PLAN_DAY_END))
      return `${a.date}: Termine sind nur zwischen ${PLAN_DAY_START} und ${PLAN_DAY_END} möglich.`;
  }
  const sorted = sortPlan(list);
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1];
    const c = sorted[i];
    if (p.date === c.date && toMin(c.startTime) < toMin(p.startTime) + p.durationMinutes)
      return `${c.date}: Termine ${p.startTime}–${endOf(p)} und ${c.startTime}–${endOf(c)} überschneiden sich.`;
  }
  return null;
}

/** Legacy/display state derived from the canonical list. Never read back as the plan. */
export function deriveFromPlan(list: AppointmentSlot[], baseInstructorId: string | null) {
  const sorted = sortPlan(list);
  const selectedDates = [...new Set(sorted.map((a) => a.date))];
  const timeSelections: TimeSelection[] = sorted.map((a) => ({ date: a.date, startTime: a.startTime, endTime: endOf(a) }));
  const dayTimeOverrides: Record<string, TimeBlock[]> = {};
  const dayInstructorOverrides: Record<string, string | null> = {};
  for (const date of selectedDates) {
    const onDay = sorted.filter((a) => a.date === date);
    dayTimeOverrides[date] = onDay.map((a, i) => ({
      id: `plan-${date}-${i}`,
      startTime: a.startTime,
      endTime: endOf(a),
      instructorId: a.instructorId && a.instructorId !== baseInstructorId ? a.instructorId : undefined,
    }));
    const first = onDay[0]?.instructorId;
    if (first && first !== baseInstructorId && onDay.every((a) => a.instructorId === first))
      dayInstructorOverrides[date] = first;
  }
  const base = sorted[0];
  return {
    selectedDates,
    timeSelections,
    dayTimeOverrides,
    dayInstructorOverrides,
    timeSlot: base ? `${base.startTime} - ${endOf(base)}` : null,
    duration: base ? base.durationMinutes / 60 : null,
  };
}

/** True only if the set of dates really differs (order/duplicates ignored). */
export function dateSetChanged(prev: string[], next: string[]): boolean {
  const a = new Set(prev), b = new Set(next);
  return a.size !== b.size || [...b].some((d) => !a.has(d));
}

/** Banner visibility: explicit provenance is required; a plan alone is never proof. */
export function showSchedulerPrefillBanner(
  provenance: unknown | null | undefined,
  appointments: AppointmentSlot[] | null | undefined,
): boolean {
  return !!provenance && !!appointments && appointments.length > 0;
}

/**
 * Blocks to append to when adding an extra block to a day. A day without explicit
 * blocks keeps its effective lesson (per-day selection, else shared window) as the
 * first block, so the original lesson is never silently replaced. No default time.
 */
export function dayBlocksBeforeAdd(
  existing: TimeBlock[] | undefined,
  daySelection: { startTime: string; endTime: string } | undefined,
  timeSlot: string | null,
  makeId: () => string,
): TimeBlock[] {
  if (existing && existing.length > 0) return existing;
  const base = daySelection ?? parseWizardTimeSlot(timeSlot);
  return base ? [{ id: makeId(), startTime: base.startTime, endTime: base.endTime }] : [];
}
