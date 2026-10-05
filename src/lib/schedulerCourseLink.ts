import { format, isValid, parseISO, startOfWeek } from "date-fns";

const INSTANCE_PREFIX = "group-instance-";

/** Deep link from a scheduler group block to the exact course/day/session in Wochenplanung. */
export function buildCoursePlanningLink(booking: { id: string; ticketId: string; date: string }): string {
  const params = new URLSearchParams();
  const day = parseISO(booking.date);
  if (isValid(day)) {
    params.set("week", format(startOfWeek(day, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    params.set("date", format(day, "yyyy-MM-dd"));
  }
  params.set("course", booking.ticketId);
  if (booking.id.startsWith(INSTANCE_PREFIX)) params.set("instance", booking.id.slice(INSTANCE_PREFIX.length));
  return `/trainings/planning?${params.toString()}`;
}

/** Week to show: explicit week, else the week of the given date, else null (caller decides). */
export function resolvePlanningWeek(week: string | null, date: string | null): Date | null {
  for (const v of [week, date]) {
    if (!v) continue;
    const d = parseISO(v);
    if (isValid(d)) return startOfWeek(d, { weekStartsOn: 1 });
  }
  return null;
}
