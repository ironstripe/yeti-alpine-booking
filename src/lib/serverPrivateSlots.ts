// Builds the exact appointment list the canonical server private create receives.
// Shared by the create mutation and the pre-save server quote, so the preview prices the same slots.
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import { buildEffectivePrivatePlan } from "@/lib/effectivePrivatePlan";
import { endOf, sortPlan, validatePlan } from "@/lib/privatePlan";
import type { PaSlot } from "@/lib/privateAppointmentsApi";

/** Throws a German, user-facing Error when the plan is not complete. */
export function buildServerPrivateSlots(state: BookingWizardState): PaSlot[] {
  const appointments: PaSlot[] = [];
  if (state.appointments) {
    // Canonical plan: payload is built 1:1 from the real lessons, nothing reconstructed.
    if (state.appointments.length === 0) throw new Error("Bitte mindestens einen Termin planen.");
    const planError = validatePlan(state.appointments);
    if (planError) throw new Error(planError);
    for (const a of sortPlan(state.appointments)) {
      if (!state.selectedDates.includes(a.date)) throw new Error(`Termin am ${a.date} gehört zu keinem gewählten Datum.`);
      const instr = a.instructorId || state.instructorId;
      // Only this item's explicit "Später zuweisen" may omit the teacher.
      if (!instr && !state.assignLater) throw new Error(`Bitte für ${a.date} ${a.startTime} eine Lehrperson wählen.`);
      appointments.push({
        date: a.date,
        time_start: a.startTime.slice(0, 5),
        time_end: endOf(a),
        ...(instr ? { instructor_id: instr } : { assign_later: true as const }),
        ...(state.meetingPoint ? { meeting_point: state.meetingPoint } : {}),
      });
    }
  } else {
    // Same effective plan the wizard showed and validated; no default times.
    const effective = buildEffectivePrivatePlan(state);
    if (effective.status !== "ready") throw new Error(effective.message);
    for (const iv of effective.intervals) {
      const instr = iv.fixedInstructorId !== undefined ? iv.fixedInstructorId : state.instructorId;
      if (!instr && !state.assignLater) throw new Error(`Bitte für ${iv.date} eine Lehrperson wählen.`);
      appointments.push({
        date: iv.date,
        time_start: iv.startTime,
        time_end: iv.endTime,
        ...(instr ? { instructor_id: instr } : { assign_later: true as const }),
        ...(state.meetingPoint ? { meeting_point: state.meetingPoint } : {}),
      });
    }
  }
  return appointments;
}

/**
 * B07-P2 discount intent sent to the server. Only an explicit office choice is an override (it
 * REPLACES the automatic same-day discount, explicit 0 included); untouched default 0 => automatic.
 */
export function discountOverrideFor(state: Pick<BookingWizardState, "discountExplicit" | "discountPercent" | "discountReason">):
  { percent: number; reason?: string } | undefined {
  if (!state.discountExplicit) return undefined;
  const reason = (state.discountReason || "").trim();
  return { percent: Number(state.discountPercent) || 0, ...(reason ? { reason } : {}) };
}
