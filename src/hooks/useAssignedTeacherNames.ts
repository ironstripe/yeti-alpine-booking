// B10 display-only: names of the teachers actually assigned per lesson in the effective private plan.
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { useInstructors } from "@/hooks/useInstructors";
import { buildEffectivePrivatePlan } from "@/lib/effectivePrivatePlan";
import { assignedTeacherIds, teacherLabel } from "@/lib/summaryAssignments";

export function useAssignedTeacherNames(): string[] {
  const { state } = useBookingWizard();
  const { data: instructors = [] } = useInstructors();
  if (state.productType !== "private") return [];
  const ids = assignedTeacherIds(buildEffectivePrivatePlan(state), state.instructorId);
  const nameOf = (id: string) => {
    const i = instructors.find((x) => x.id === id) ?? (state.instructor?.id === id ? state.instructor : null);
    return i ? `${i.first_name} ${i.last_name}` : null;
  };
  return ids.map((id) => teacherLabel(id, state.assignLater, nameOf));
}
