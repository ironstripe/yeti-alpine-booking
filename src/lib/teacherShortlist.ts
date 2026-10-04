// Time-first teacher shortlist for private lessons (pure, no I/O).
//
// Derives the exact intervals a private booking will create (same derivation
// order as the save path in useCreateBooking, but WITHOUT its "10:00"/"12:00"
// fallbacks: missing time is reported, never invented) and classifies each
// eligible teacher as fully / partially / not available for ALL of them.
// The server stays authoritative; this only decides what the list may offer.
import type { AppointmentSlot, TimeBlock, TimeSelection } from "@/contexts/BookingWizardContext";
import { endOf, parseWizardTimeSlot, sortPlan } from "@/lib/privatePlan";
import {
  hasOverlap,
  isInstructorAbsent,
  type SchedulerAbsence,
  type SchedulerBooking,
} from "@/lib/scheduler-utils";

export interface IntendedInterval {
  date: string;
  startTime: string;
  endTime: string;
  /**
   * Teacher explicitly fixed for this interval by the plan (per appointment,
   * per block or per day). `undefined` = governed by the item's main teacher.
   * `null` = explicitly without teacher (would not be filled by the main teacher).
   */
  fixedInstructorId: string | null | undefined;
}

export type IntervalPlan =
  | { status: "missing_dates" }
  | { status: "missing_time"; datesWithoutTime: string[] }
  | { status: "ready"; intervals: IntendedInterval[] };

export interface IntervalPlanInput {
  selectedDates: string[];
  timeSlot: string | null;
  appointments: AppointmentSlot[] | null;
  timeSelections?: TimeSelection[] | null;
  dayTimeOverrides?: Record<string, TimeBlock[]> | null;
  dayInstructorOverrides?: Record<string, string | null> | null;
}

export function buildIntendedIntervals(input: IntervalPlanInput): IntervalPlan {
  // Canonical plan: the appointment list IS the plan.
  if (input.appointments && input.appointments.length > 0) {
    return {
      status: "ready",
      intervals: sortPlan(input.appointments).map((a) => ({
        date: a.date,
        startTime: a.startTime.slice(0, 5),
        endTime: endOf(a),
        fixedInstructorId: a.instructorId ? a.instructorId : undefined,
      })),
    };
  }
  if (input.selectedDates.length === 0) return { status: "missing_dates" };

  const base = parseWizardTimeSlot(input.timeSlot);
  const intervals: IntendedInterval[] = [];
  const datesWithoutTime: string[] = [];
  for (const date of [...input.selectedDates].sort()) {
    const blocks = input.dayTimeOverrides?.[date];
    const dayInstr = input.dayInstructorOverrides?.[date];
    if (blocks && blocks.length > 0) {
      for (const b of blocks) {
        intervals.push({
          date,
          startTime: b.startTime.slice(0, 5),
          endTime: b.endTime.slice(0, 5),
          fixedInstructorId: b.instructorId !== undefined ? b.instructorId : dayInstr,
        });
      }
      continue;
    }
    const ts = input.timeSelections?.find((t) => t.date === date);
    const startTime = ts?.startTime ?? base?.startTime;
    const endTime = ts?.endTime ?? base?.endTime;
    if (!startTime || !endTime) {
      datesWithoutTime.push(date);
      continue;
    }
    intervals.push({ date, startTime: startTime.slice(0, 5), endTime: endTime.slice(0, 5), fixedInstructorId: dayInstr });
  }
  if (datesWithoutTime.length > 0) return { status: "missing_time", datesWithoutTime };
  return { status: "ready", intervals };
}

export type BlockReason = "booked" | "absent";

export interface BlockedInterval {
  date: string;
  startTime: string;
  endTime: string;
  reason: BlockReason;
}

export interface TeacherCoverage {
  status: "full" | "partial" | "none";
  blocked: BlockedInterval[];
}

/**
 * Exact-minute interval check against existing scheduler occupancy.
 * Bookings (private, group instances, office blocks) block only on real overlap
 * (`hasOverlap`: start < otherEnd && end > otherStart). Absences keep the
 * existing wizard grid policy: any non-rejected absence/recurring block/missing
 * deployment window on that date blocks the whole date (conservative).
 */
export function evaluateTeacherCoverage(
  instructorId: string,
  intervals: Pick<IntendedInterval, "date" | "startTime" | "endTime">[],
  bookings: SchedulerBooking[],
  absences: SchedulerAbsence[],
): TeacherCoverage {
  const blocked: BlockedInterval[] = [];
  for (const iv of intervals) {
    if (isInstructorAbsent(instructorId, iv.date, absences)) {
      blocked.push({ ...iv, reason: "absent" });
    } else if (hasOverlap(instructorId, iv.date, iv.startTime, iv.endTime, bookings)) {
      blocked.push({ ...iv, reason: "booked" });
    }
  }
  const status = blocked.length === 0 ? "full" : blocked.length === intervals.length ? "none" : "partial";
  return { status, blocked };
}

/** Same eligibility rule the wizard mini scheduler applies (active, sport, language). */
export function filterEligibleInstructors<
  T extends { status: string | null; specialization: string | null; languages: string[] | null },
>(instructors: T[], sport: "ski" | "snowboard" | null, language: string | null | undefined): T[] {
  let filtered = instructors.filter((i) => i.status === "active");
  if (sport) {
    filtered = filtered.filter((i) => i.specialization === sport || i.specialization === "both");
  }
  if (language) {
    filtered = filtered.filter((i) => i.languages?.includes(language) === true);
  }
  return filtered;
}

/**
 * The list may select a teacher for the WHOLE plan only if every interval is
 * free AND no interval is pinned to someone else (selecting a main teacher
 * would not reach a pinned interval, so the plan would silently diverge).
 */
export function canSelectForWholePlan(
  instructorId: string,
  intervals: IntendedInterval[],
  coverage: TeacherCoverage,
): boolean {
  if (coverage.status !== "full") return false;
  return intervals.every((iv) => iv.fixedInstructorId === undefined || iv.fixedInstructorId === instructorId);
}

export function hasPinnedTeachers(intervals: IntendedInterval[]): boolean {
  return intervals.some((iv) => iv.fixedInstructorId !== undefined);
}
