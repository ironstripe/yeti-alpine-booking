import { expect, test } from "bun:test";
import type { BookingWizardState } from "../src/contexts/BookingWizardContext";
import { checkoutDefaultDueDate, checkoutFirstCourseDate, checkoutPaymentDueDate } from "../src/lib/checkoutDueDate";

const base = () => ({ productType: "group", selectedDates: ["2026-12-22", "2026-12-21"],
  paymentDueDate: null, settlement: "pay_later", useParticipantSpecificBooking: false,
  participantBookings: {}, cartItems: [] } as unknown as BookingWizardState);
for (const method of ["cash", "card", "twint", "voucher", "invoice", "hotel"] as const) {
  test(`${method} pay_later uses default or explicit date`, () => {
    const state = { ...base(), paymentMethod: method };
    expect(checkoutPaymentDueDate(state)).toBe("2026-12-14");
    expect(checkoutPaymentDueDate({ ...state, paymentDueDate: "2026-11-30" })).toBe("2026-11-30");
  });
}
for (const method of ["cash", "card", "twint", "voucher"] as const) {
  test(`${method} paid_now does not materialize a default`, () => {
    expect(checkoutPaymentDueDate({ ...base(), paymentMethod: method, settlement: "paid_now" })).toBeNull();
    expect(checkoutPaymentDueDate({ ...base(), paymentMethod: method, settlement: "paid_now", paymentDueDate: "2026-12-01" })).toBe("2026-12-01");
  });
}
test("course change follows default but never explicit selection; input dates not mutated", () => {
  const state = base();
  expect(checkoutPaymentDueDate(state)).toBe("2026-12-14");
  expect(state.selectedDates).toEqual(["2026-12-22", "2026-12-21"]);
  const changed = { ...state, selectedDates: ["2027-01-04"] };
  expect(checkoutPaymentDueDate(changed)).toBe("2026-12-28");
  expect(checkoutPaymentDueDate({ ...changed, paymentDueDate: "2026-12-01" })).toBe("2026-12-01");
});
test("private canonical plan and linked participant dates determine first lesson", () => {
  const state = { ...base(), productType: "private", appointments: [{ date: "2026-12-22", startTime: "10:00", durationMinutes: 60 }] } as BookingWizardState;
  expect(checkoutFirstCourseDate(state)).toBe("2026-12-22");
  expect(checkoutFirstCourseDate({ ...state, useParticipantSpecificBooking: true,
    activeCartItemId: "a", cartItems: [{ id: "a", assignedParticipantIds: ["p"] }],
    participantBookings: { p: { dates: ["2027-01-04"] }, unlinked: { dates: ["2026-01-01"] } },
  } as unknown as BookingWizardState)).toBe("2027-01-04");
});
test("calendar-only boundaries across timezones and fallback today plus seven", () => {
  const old = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Europe/Zurich"]) {
      process.env.TZ = tz;
      expect(checkoutDefaultDueDate("2027-01-04")).toBe("2026-12-28");
      expect(checkoutDefaultDueDate("2026-03-30")).toBe("2026-03-23");
      expect(checkoutDefaultDueDate("2028-03-01")).toBe("2028-02-23");
      expect(checkoutDefaultDueDate(null, new Date(2026, 11, 28, 23, 30))).toBe("2027-01-04");
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});