// One effective, validated private-lesson plan for the wizard.
// Teacher list, summary, step readiness and the save mapping all read THIS result,
// so a plan that is shown as bookable is exactly the plan that is submitted.
// Derivation = buildIntendedIntervals (canonical appointments, per-day blocks,
// per-day selections, shared window; never a default time). Validation = validatePlan
// (09:00–16:00, positive duration, no overlap) plus "every lesson on a chosen date".
import type { AppointmentSlot } from "@/contexts/BookingWizardContext";
import { toMin, validatePlan } from "@/lib/privatePlan";
import { buildIntendedIntervals, type IntendedInterval, type IntervalPlanInput } from "@/lib/teacherShortlist";

export type EffectivePrivatePlan =
  | { status: "missing_dates"; message: string }
  | { status: "missing_time"; message: string; datesWithoutTime: string[] }
  | { status: "invalid"; message: string }
  | { status: "ready"; intervals: IntendedInterval[] };

export function buildEffectivePrivatePlan(input: IntervalPlanInput): EffectivePrivatePlan {
  const plan = buildIntendedIntervals(input);
  if (plan.status === "missing_dates") return { status: "missing_dates", message: "Datum fehlt" };
  if (plan.status === "missing_time")
    return { status: "missing_time", message: "Zeit fehlt", datesWithoutTime: plan.datesWithoutTime };
  if (plan.intervals.length === 0) return { status: "missing_time", message: "Zeit fehlt", datesWithoutTime: [] };
  const outside = plan.intervals.find((i) => !input.selectedDates.includes(i.date));
  if (outside) return { status: "invalid", message: `Termin am ${outside.date} gehört zu keinem gewählten Datum.` };
  const slots: AppointmentSlot[] = plan.intervals.map((i) => ({
    date: i.date,
    startTime: i.startTime,
    durationMinutes: toMin(i.endTime) - toMin(i.startTime),
  }));
  const error = validatePlan(slots);
  if (error) return { status: "invalid", message: error };
  return { status: "ready", intervals: plan.intervals };
}
