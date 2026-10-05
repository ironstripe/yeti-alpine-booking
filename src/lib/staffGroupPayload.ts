// Pure mapping: wizard state -> staff 26/27 group booking lines (server re-validates everything).
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import type { StaffGroupLine } from "@/lib/staffGroupBookingApi";

export type StaffGroupPlanResult =
  | { kind: "none" }
  | { kind: "server"; lines: StaffGroupLine[] }
  | { kind: "error"; message: string };

export function buildStaffGroupLines(state: BookingWizardState): StaffGroupPlanResult {
  if (state.productType !== "group") return { kind: "none" };
  const active = state.cartItems.find((item) => item.id === state.activeCartItemId);
  const ids = active?.assignedParticipantIds ?? [];
  const participantMode = state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0;

  const refs = participantMode
    ? ids.map((id) => ({ id, ref: state.participantBookings[id]?.groupServer ?? null, dates: state.participantBookings[id]?.dates ?? [] }))
    : ids.map((id) => ({ id, ref: state.groupPlan?.server ?? null, dates: state.selectedDates }));
  const withServer = refs.filter((r) => r.ref);
  if (withServer.length === 0) return { kind: "none" };
  if (withServer.length !== refs.length) {
    return { kind: "error", message: "Winter-26/27-Kurse und andere Kurse können nicht in derselben Buchung gespeichert werden. Bitte getrennt buchen." };
  }
  if (state.cartItems.length > 1) {
    return { kind: "error", message: "Winter-26/27-Gruppenkurse können nur als einzelnes Produkt gespeichert werden. Bitte weitere Produkte separat buchen." };
  }
  if (Object.values(state.lunchSelections).some((days) => days && days.length > 0)) {
    return { kind: "error", message: "Mittagsbetreuung kann bei Winter-26/27-Gruppenkursen noch nicht mitgebucht werden." };
  }
  if (!state.sport) return { kind: "error", message: "Sportart wählen." };
  if (ids.length === 0) return { kind: "error", message: "Teilnehmer fehlen." };

  const lines: StaffGroupLine[] = [];
  for (const { id, ref, dates } of refs) {
    const person = state.selectedParticipants.find((p) => p.id === id);
    if (!person) return { kind: "error", message: "Ein zugewiesener Teilnehmer ist nicht mehr vorhanden. Bitte Teilnehmer neu zuweisen." };
    const base = {
      course_id: ref!.courseId,
      product_id: ref!.productId,
      dates: [...dates].sort(),
      block: ref!.block,
      sport: state.sport,
      expected_unit_price: ref!.unitPrice,
    };
    if (id.startsWith("guest-") || person.isGuest) {
      if (!person.birth_date) return { kind: "error", message: `Geburtsdatum für ${person.first_name} fehlt.` };
      lines.push({ ...base, guest: { guest_key: id, first_name: person.first_name, ...(person.last_name ? { last_name: person.last_name } : {}), birth_date: person.birth_date, ...(person.sport ? { sport: person.sport } : {}) } });
    } else {
      lines.push({ ...base, participant_id: id });
    }
  }
  return { kind: "server", lines };
}

export const staffGroupTotal = (lines: StaffGroupLine[]) => lines.reduce((sum, line) => sum + line.expected_unit_price, 0);
