// Structured step-1 readiness for the booking wizard (pure).
// Same requirements as before (product+dates, meeting point, linked participants,
// private: valid timing + teacher OR explicit "Später zuweisen"), but each missing
// requirement is named per cart item so the UI can explain and jump to it.
import type { CartItem } from "@/contexts/BookingWizardContext";
import { buildEffectivePrivatePlan } from "@/lib/effectivePrivatePlan";

export type ReadinessField = "product" | "dates" | "time" | "teacher" | "meetingPoint" | "participants";

export interface ReadinessIssue {
  itemId: string;
  itemIndex: number;
  field: ReadinessField;
  message: string;
}

export function itemReadinessIssues(item: CartItem, itemIndex: number): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const add = (field: ReadinessField, message: string) => issues.push({ itemId: item.id, itemIndex, field, message });
  if (item.productType === null) add("product", "Produkt wählen (Privat oder Gruppe)");
  if (item.selectedDates.length === 0) add("dates", "Datum fehlt");
  if (item.productType === "private" && item.selectedDates.length > 0) {
    const plan = buildEffectivePrivatePlan(item);
    if (plan.status === "missing_time") add("time", plan.message);
    else if (plan.status === "invalid") add("time", plan.message);
    if (item.instructorId === null && !item.assignLater) add("teacher", "Lehrperson wählen oder „Später zuweisen“");
  }
  if (item.meetingPoint === null) add("meetingPoint", "Treffpunkt fehlt");
  if (item.assignedParticipantIds.length === 0) add("participants", "Teilnehmer fehlen");
  return issues;
}

export function cartReadinessIssues(items: CartItem[]): ReadinessIssue[] {
  if (items.length === 0) return [{ itemId: "", itemIndex: 0, field: "product", message: "Kein Unterricht im Warenkorb" }];
  return items.flatMap((item, i) => itemReadinessIssues(item, i));
}
