// "Später zuweisen" state transition for the private booking wizard.
// Pure: removes every teacher reference from ONE item's state while keeping
// dates, times, durations, participants and the original scheduler provenance.
import type {
  AppointmentSlot,
  MiniSchedulerSlot,
  PrivateGroupProposal,
  TimeBlock,
} from "@/contexts/BookingWizardContext";

export interface AssignLaterFields {
  assignLater: boolean;
  instructorId: string | null;
  instructor: unknown | null;
  appointments: AppointmentSlot[] | null;
  dayInstructorOverrides: Record<string, string | null>;
  dayTimeOverrides: Record<string, TimeBlock[]>;
  miniSchedulerSelections: MiniSchedulerSlot[];
  privateGroupProposal: PrivateGroupProposal | null;
}

/**
 * assignLater=true clears the teacher everywhere it can live; assignLater=false
 * only flips the flag (it never restores a previously cleared teacher).
 * `schedulerPrefill` is intentionally untouched: it is provenance of the original
 * scheduler selection, and the banner then truthfully reports the plan as adjusted.
 */
export function applyAssignLater<T extends AssignLaterFields>(s: T, assignLater: boolean): T {
  if (!assignLater) return { ...s, assignLater: false };
  return {
    ...s,
    assignLater: true,
    instructorId: null,
    instructor: null,
    appointments: s.appointments
      ? s.appointments.map(({ instructorId: _drop, ...a }) => a)
      : s.appointments,
    dayInstructorOverrides: {},
    dayTimeOverrides: Object.fromEntries(
      Object.entries(s.dayTimeOverrides).map(([d, blocks]) => [
        d,
        blocks.map((b) => ({ ...b, instructorId: undefined })),
      ]),
    ),
    miniSchedulerSelections: [],
    privateGroupProposal: s.privateGroupProposal
      ? {
          ...s.privateGroupProposal,
          groups: s.privateGroupProposal.groups.map((g) => ({ ...g, instructorId: null, instructor: null })),
        }
      : null,
  };
}
