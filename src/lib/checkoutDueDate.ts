import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import { buildEffectivePrivatePlan } from "@/lib/effectivePrivatePlan";

/** Calendar arithmetic on date-only values, never parsing them as local instants. */
export function checkoutDefaultDueDate(firstCourseDate: string | null, today = new Date()): string {
  const day = firstCourseDate ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + (firstCourseDate ? -7 : 7))).toISOString().slice(0, 10);
}

export function checkoutFirstCourseDate(state: BookingWizardState): string | null {
  let dates = state.selectedDates;
  if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
    const active = state.cartItems.find((item) => item.id === state.activeCartItemId);
    dates = (active?.assignedParticipantIds ?? []).flatMap((id) => state.participantBookings[id]?.dates ?? []);
  } else if (state.productType === "private") {
    const plan = buildEffectivePrivatePlan(state);
    if (plan.status === "ready") dates = plan.intervals.map((interval) => interval.date);
  }
  return [...dates].sort()[0] ?? null;
}

export function checkoutPaymentDueDate(state: BookingWizardState, today = new Date()): string | null {
  // Keep paid-now semantics, including any previously selected date, unchanged.
  return state.paymentDueDate || (state.settlement === "pay_later"
    ? checkoutDefaultDueDate(checkoutFirstCourseDate(state), today)
    : null);
}