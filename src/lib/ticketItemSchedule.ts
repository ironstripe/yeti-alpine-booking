// Real schedule of a booking line (pure).
// 26/27 staff group lines are package-shaped (one line per participant+course: date = first day,
// end_date = last day, time_start/time_end = min/max over all blocks). Their real schedule is the
// set of enrolled course instances (e.g. 10–12 + 14–16 on every day), never one 10–16 lesson.
import { MEETING_POINTS } from "@/lib/meeting-point-utils";
import { minutesBetween, sessionKey } from "@/lib/finance";

export interface EnrollmentBlock { date: string; start_time: string | null; end_time: string | null }
export interface ScheduledItem {
  item_type?: string | null;
  date: string;
  end_date?: string | null;
  time_start: string | null;
  time_end: string | null;
  instructor_id?: string | null;
  actual_duration_minutes?: number | null;
  product?: { duration_minutes?: number | null; [k: string]: unknown } | null;
  enrollments?: Array<{ instance?: EnrollmentBlock | null } | null> | null;
}

export function enrollmentBlocks(item: ScheduledItem): EnrollmentBlock[] {
  return (item.enrollments ?? [])
    .map((e) => e?.instance)
    .filter((b): b is EnrollmentBlock => !!b && !!b.date)
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
}

/** Package line = group line spanning several days or carrying real enrollment blocks. */
export function isPackageGroupItem(item: ScheduledItem): boolean {
  return item.item_type === "group" && (enrollmentBlocks(item).length > 0 || (!!item.end_date && item.end_date !== item.date));
}

/** Per-day block list for display: [{date, times: ["10:00–12:00","14:00–16:00"]}]. */
export function scheduleByDay(item: ScheduledItem): Array<{ date: string; times: string[] }> {
  const blocks = enrollmentBlocks(item);
  if (blocks.length === 0) {
    const t = item.time_start && item.time_end ? [`${item.time_start.slice(0, 5)}–${item.time_end.slice(0, 5)}`] : [];
    return [{ date: item.date, times: t }];
  }
  const days = new Map<string, string[]>();
  for (const b of blocks) {
    const t = b.start_time && b.end_time ? `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}` : "";
    days.set(b.date, [...(days.get(b.date) ?? []), ...(t ? [t] : [])]);
  }
  return [...days.entries()].map(([date, times]) => ({ date, times }));
}

/** Last real day of the line (package end_date / last block), for date ranges. */
export const itemLastDate = (item: ScheduledItem) => {
  const blocks = enrollmentBlocks(item);
  return blocks.length ? blocks[blocks.length - 1].date : item.end_date || item.date;
};

/**
 * Teaching sessions of a line inside [start, end] (inclusive yyyy-MM-dd). Package lines count each
 * real block on its own day; all other lines keep the existing single-session rule.
 */
export function itemSessions(item: ScheduledItem, start: string, end: string): Array<{ key: string; minutes: number }> {
  const blocks = enrollmentBlocks(item);
  if (item.item_type === "group" && blocks.length > 0) {
    return blocks
      .filter((b) => b.date >= start && b.date <= end)
      .map((b) => ({
        key: sessionKey({ instructorId: item.instructor_id ?? null, date: b.date, timeStart: b.start_time, timeEnd: b.end_time }),
        minutes: minutesBetween(b.start_time, b.end_time) || 0,
      }));
  }
  if (item.date < start || item.date > end) return [];
  const minutes =
    item.actual_duration_minutes ??
    (item.time_start && item.time_end ? minutesBetween(item.time_start, item.time_end) : item.product?.duration_minutes ?? 0);
  return [{ key: sessionKey({ instructorId: item.instructor_id ?? null, date: item.date, timeStart: item.time_start, timeEnd: item.time_end }), minutes: minutes || 0 }];
}

/** Meeting point label: catalog name for catalog ids, the stored text otherwise (never a substitute). */
export const meetingPointLabel = (value: string | null | undefined) =>
  value ? MEETING_POINTS.find((p) => p.id === value)?.name ?? value : null;

/** PostgREST embed for the real blocks of a line. */
export const ENROLLMENT_BLOCKS_SELECT = "enrollments:group_course_enrollments(instance:group_course_instances(date,start_time,end_time))";
