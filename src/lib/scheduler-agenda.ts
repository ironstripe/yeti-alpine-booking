import {
  OPERATIONAL_START_MINUTES,
  OPERATIONAL_END_MINUTES,
  timeToMinutes,
  type SchedulerAbsence,
  type SchedulerBooking,
} from "./scheduler-utils";

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export interface AgendaFreeEntry {
  kind: "free";
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
}

export interface AgendaBookingEntry {
  kind: "booking";
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  booking: SchedulerBooking;
}

export interface AgendaAbsenceEntry {
  kind: "absence";
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  absence: SchedulerAbsence;
}

export type AgendaEntry = AgendaFreeEntry | AgendaBookingEntry | AgendaAbsenceEntry;

interface Busy {
  start: number;
  end: number;
}

/** Absences relevant for one instructor on one day, normalised to minute ranges. */
export function getAbsenceRangesForDay(
  instructorId: string,
  date: string,
  absences: SchedulerAbsence[]
): { absence: SchedulerAbsence; start: number; end: number }[] {
  return absences
    .filter(
      (a) =>
        a.instructorId === instructorId &&
        a.status !== "rejected" &&
        date >= a.startDate &&
        date <= a.endDate
    )
    .map((a) => {
      if (a.isFullDay || !a.timeStart || !a.timeEnd) {
        return { absence: a, start: OPERATIONAL_START_MINUTES, end: OPERATIONAL_END_MINUTES };
      }
      return {
        absence: a,
        start: Math.max(OPERATIONAL_START_MINUTES, timeToMinutes(a.timeStart)),
        end: Math.min(OPERATIONAL_END_MINUTES, timeToMinutes(a.timeEnd)),
      };
    })
    .filter((r) => r.end > r.start);
}

function mergeBusy(ranges: Busy[]): Busy[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Busy[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Build the chronological agenda for one instructor on one day:
 * bookings and absences as they are, plus the remaining gaps as
 * compact free intervals (never one row per 15 minutes).
 */
export function buildAgendaForInstructor(
  instructorId: string,
  date: string,
  bookings: SchedulerBooking[],
  absences: SchedulerAbsence[],
  minFreeMinutes = 30
): AgendaEntry[] {
  const dayBookings = bookings.filter(
    (b) => b.instructorId === instructorId && b.date === date
  );
  const dayAbsences = getAbsenceRangesForDay(instructorId, date, absences);

  const entries: AgendaEntry[] = [];

  for (const b of dayBookings) {
    const start = timeToMinutes(b.timeStart);
    const end = timeToMinutes(b.timeEnd);
    entries.push({
      kind: "booking",
      startMinutes: start,
      endMinutes: end,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      booking: b,
    });
  }

  for (const a of dayAbsences) {
    entries.push({
      kind: "absence",
      startMinutes: a.start,
      endMinutes: a.end,
      startTime: minutesToTime(a.start),
      endTime: minutesToTime(a.end),
      absence: a.absence,
    });
  }

  const busy = mergeBusy(
    entries.map((e) => ({ start: e.startMinutes, end: e.endMinutes }))
  );

  let cursor = OPERATIONAL_START_MINUTES;
  for (const block of busy) {
    if (block.start - cursor >= minFreeMinutes) {
      entries.push({
        kind: "free",
        startMinutes: cursor,
        endMinutes: block.start,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(block.start),
      });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (OPERATIONAL_END_MINUTES - cursor >= minFreeMinutes) {
    entries.push({
      kind: "free",
      startMinutes: cursor,
      endMinutes: OPERATIONAL_END_MINUTES,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(OPERATIONAL_END_MINUTES),
    });
  }

  return entries.sort((a, b) => a.startMinutes - b.startMinutes);
}

export type InstructorAvailabilityState = "free" | "partly" | "full" | "absent";

export function getAvailabilityState(entries: AgendaEntry[]): InstructorAvailabilityState {
  const hasAbsence = entries.some((e) => e.kind === "absence");
  const freeMinutes = entries
    .filter((e): e is AgendaFreeEntry => e.kind === "free")
    .reduce((sum, e) => sum + (e.endMinutes - e.startMinutes), 0);
  const busyMinutes = entries
    .filter((e) => e.kind !== "free")
    .reduce((sum, e) => sum + (e.endMinutes - e.startMinutes), 0);

  if (freeMinutes === 0) return hasAbsence && busyMinutes > 0 ? "absent" : "full";
  if (busyMinutes === 0) return "free";
  return "partly";
}

export const AVAILABILITY_LABELS: Record<InstructorAvailabilityState, string> = {
  free: "Verfügbar",
  partly: "Teilweise frei",
  full: "Ausgebucht",
  absent: "Abwesend",
};
