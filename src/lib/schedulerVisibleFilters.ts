import { isGroupReserve, OPERATIONAL_START_MINUTES, OPERATIONAL_END_MINUTES, type SchedulerAbsence, type SchedulerBooking, type SchedulerInstructor } from "./scheduler-utils";

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function minutes(value?: string): number | null {
  if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const [h, m, s = 0] = value.split(":").map(Number);
  return h <= 23 && m <= 59 && s <= 59 ? h * 60 + m + s / 60 : null;
}

/** Display evidence only. Never pass the reduced list into conflict or write paths. */
export function hiddenAbsentInstructorIds(
  instructors: Pick<SchedulerInstructor, "id" | "real_time_status">[],
  dates: string[], bookings: SchedulerBooking[], absences: SchedulerAbsence[],
): Set<string> {
  const hidden = new Set<string>();
  if (!dates.length || !dates.every(validDate)) return hidden;
  const displayed = new Set(dates);
  const assigned = new Set(bookings.filter(b => displayed.has(b.date)).map(b => b.instructorId));
  const byTeacher = new Map<string, SchedulerAbsence[]>();
  for (const absence of absences) {
    const rows = byTeacher.get(absence.instructorId) ?? [];
    rows.push(absence);
    byTeacher.set(absence.instructorId, rows);
  }
  for (const instructor of instructors) {
    if (assigned.has(instructor.id) || instructor.real_time_status === "on_call") continue;
    const rows = byTeacher.get(instructor.id) ?? [];
    const fullRange = dates.every(date => {
      const intervals: [number, number][] = [];
      for (const a of rows) {
        // Deployment gates are unavailable-window projections, not confirmed absence records.
        // In particular empty/unknown windows cannot prove absence.
        if (a.status !== "confirmed" || isGroupReserve(a) || a.type === "office_duty" || a.id.startsWith("deployment-")) continue;
        if (!validDate(a.startDate) || !validDate(a.endDate) || a.startDate > a.endDate) continue;
        if (date < a.startDate || date > a.endDate) continue;
        if (a.isFullDay === true) intervals.push([OPERATIONAL_START_MINUTES, OPERATIONAL_END_MINUTES]);
        else {
          const start = minutes(a.timeStart), end = minutes(a.timeEnd);
          if (start === null || end === null || end <= start) continue;
          intervals.push([Math.max(start, OPERATIONAL_START_MINUTES), Math.min(end, OPERATIONAL_END_MINUTES)]);
        }
      }
      intervals.sort((a, b) => a[0] - b[0]);
      let covered = OPERATIONAL_START_MINUTES;
      for (const [start, end] of intervals) {
        if (start > covered) break;
        covered = Math.max(covered, end);
      }
      return covered >= OPERATIONAL_END_MINUTES;
    });
    if (fullRange) hidden.add(instructor.id);
  }
  return hidden;
}

export function applyTeacherVisibility<T extends { id: string }>(
  all: T[], compatible: T[], selectedId: string | null, hideAbsent: boolean, hidden: Set<string>,
): T[] {
  if (selectedId) return all.filter(i => i.id === selectedId);
  return hideAbsent ? compatible.filter(i => !hidden.has(i.id)) : compatible;
}