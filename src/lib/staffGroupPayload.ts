// Pure mapping: wizard state -> staff 26/27 group booking lines (server re-validates everything).
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import type { StaffGroupLine } from "@/lib/staffGroupBookingApi";
import { GROUP_LUNCH_PRICE_CHF, groupLunchEligible, uniqueLunchDates } from "@/lib/groupLunch";

export type StaffGroupPlanResult =
  | { kind: "none" }
  | { kind: "server"; lines: StaffGroupLine[] }
  | { kind: "error"; message: string };

/** Effective group meeting point: authoritative course value, else the explicit office choice. */
export const effectiveGroupMeetingPoint = (coursePoint: string | null | undefined, choice: string | null | undefined) =>
  coursePoint ?? choice ?? null;

/** True when any assigned participant has lunch days selected (shared or per-participant mode). */
export function staffGroupHasLunch(state: BookingWizardState): boolean {
  const participantMode = state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0;
  return participantMode
    ? Object.values(state.participantBookings).some((b) => (b?.lunchDays?.length ?? 0) > 0)
    : Object.values(state.lunchSelections).some((days) => (days?.length ?? 0) > 0);
}

/** Season-aware lunch lookup for a booked product + dates (B09); a bare number is the legacy unit-price check. */
export type LunchLookup = (productId: string, dates: string[]) => { id: string; price: number } | null;

export function buildStaffGroupLines(state: BookingWizardState, lunch: number | null | LunchLookup = null): StaffGroupPlanResult {
  const lunchUnitPrice = typeof lunch === "function" ? GROUP_LUNCH_PRICE_CHF : lunch;
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
  if (staffGroupHasLunch(state) && lunchUnitPrice !== GROUP_LUNCH_PRICE_CHF) {
    return { kind: "error", message: "Für Mittagessen und Betreuung muss genau ein aktives Produkt zu CHF 30 pro Person und Tag hinterlegt sein." };
  }
  if (!state.sport) return { kind: "error", message: "Sportart wählen." };
  if (ids.length === 0) return { kind: "error", message: "Teilnehmer fehlen." };

  const lines: StaffGroupLine[] = [];
  for (const { id, ref, dates } of refs) {
    if (!ref) return { kind: "error", message: "Kurs neu wählen." };
    const person = state.selectedParticipants.find((p) => p.id === id);
    if (!person) return { kind: "error", message: "Ein zugewiesener Teilnehmer ist nicht mehr vorhanden. Bitte Teilnehmer neu zuweisen." };
    const pb = participantMode ? state.participantBookings[id] : null;
    const meetingPoint = participantMode
      ? effectiveGroupMeetingPoint(pb?.groupMeetingPoint, pb?.groupMeetingPointChoice)
      : effectiveGroupMeetingPoint(state.groupPlan?.meetingPoint, state.meetingPoint);
    if (!meetingPoint) return { kind: "error", message: `Treffpunkt für ${person.first_name} wählen.` };
    const selectedLunch = participantMode ? pb?.lunchDays ?? [] : state.lunchSelections[id] ?? [];
    const lunchDates = uniqueLunchDates(selectedLunch, dates);
    const plan = participantMode ? { server: pb?.groupServer, blocks: pb?.groupBlocks } : state.groupPlan;
    if (selectedLunch.length > 0 && !groupLunchEligible(plan, dates)) {
      return { kind: "error", message: `Mittagessen und Betreuung für ${person.first_name} sind nur bei einem Ganztages-Gruppenkurs möglich. Bitte Mittagsauswahl entfernen oder Ganztageskurs wählen.` };
    }
    let lunchProductId: string | undefined;
    if (lunchDates.length > 0 && typeof lunch === "function") {
      const resolved = lunch(ref.productId, dates);
      if (!resolved || resolved.price !== GROUP_LUNCH_PRICE_CHF) {
        return { kind: "error", message: `Für Mittagessen und Betreuung von ${person.first_name} ist in der Saison des gebuchten Kurses nicht genau ein aktives Produkt zu CHF 30 pro Person und Tag hinterlegt (oder die Daten liegen ausserhalb der Saison).` };
      }
      lunchProductId = resolved.id;
    }
    const vegetarian = participantMode ? !!pb?.isVegetarian : !!state.vegetarianSelections?.[id];
    const base = {
      course_id: ref.courseId,
      product_id: ref.productId,
      dates: [...dates].sort(),
      block: ref.block,
      sport: state.sport,
      expected_unit_price: ref.unitPrice,
      meeting_point: meetingPoint,
      ...(lunchDates.length > 0 ? { lunch_dates: lunchDates, vegetarian, expected_lunch_unit_price: GROUP_LUNCH_PRICE_CHF, ...(lunchProductId ? { lunch_product_id: lunchProductId } : {}) } : {}),
    };
    if (id.startsWith("guest-") || person.isGuest) {
      if (!person.birth_date) return { kind: "error", message: `Geburtsdatum für ${person.first_name} fehlt.` };
      lines.push({ ...base, guest: { guest_key: id, first_name: person.first_name, ...(person.last_name ? { last_name: person.last_name } : {}), birth_date: person.birth_date, ...(person.sport ? { sport: person.sport } : {}), ...(person.level_current_season ? { level: person.level_current_season } : {}) } });
    } else {
      lines.push({ ...base, participant_id: id });
    }
  }
  return { kind: "server", lines };
}

export const staffGroupTotal = (lines: StaffGroupLine[]) => {
  const charged = new Set<string>();
  return lines.reduce((sum, line) => {
    let lunch = 0;
    for (const date of new Set(line.lunch_dates ?? [])) {
      const key = `${line.participant_id ?? line.guest?.guest_key}:${date}`;
      if (charged.has(key)) continue;
      charged.add(key);
      lunch += line.expected_lunch_unit_price ?? 0;
    }
    return sum + line.expected_unit_price + lunch;
  }, 0);
};
