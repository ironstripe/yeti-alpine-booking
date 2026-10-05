// Renders the real BookingSummaryCards with a stubbed wizard context and checks
// that the shown private intervals/participants equal what the save path uses.
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildEffectivePrivatePlan } from "../src/lib/effectivePrivatePlan";

let state: Record<string, unknown> = {};
mock.module("@/contexts/BookingWizardContext", () => ({ useBookingWizard: () => ({ state }) }));
mock.module("@/hooks/useInstructors", () => ({
  useInstructors: () => ({ data: [{ id: "t1", first_name: "Tina", last_name: "Synth" }] }),
}));
mock.module("@/components/bookings/wizard/PriceBreakdown", () => ({ PriceBreakdown: () => null }));

const { BookingSummaryCards } = await import("../src/components/bookings/wizard/BookingSummaryCards");

const D1 = "2026-12-21", D2 = "2026-12-22";
const base = () => ({
  productType: "private", sport: "ski", duration: 1, isEditMode: false,
  selectedDates: [D2, D1], timeSlot: "10:00 - 11:00",
  timeSelections: [{ date: D1, startTime: "10:00", endTime: "11:00" }, { date: D2, startTime: "13:00", endTime: "14:00" }],
  appointments: null, dayTimeOverrides: {}, dayInstructorOverrides: {},
  instructorId: null, instructor: null, assignLater: true, privateGroupProposal: null,
  meetingPoint: "sammelplatz_gorfion", language: "de", customer: { id: "c", first_name: "Synth", last_name: "Payer" },
  activeCartItemId: "a", cartItems: [{ id: "a", assignedParticipantIds: ["p2"] }],
  selectedParticipants: [
    { id: "p1", first_name: "Deselected", last_name: "One", birth_date: "2015-01-01" },
    { id: "p2", first_name: "Kept", last_name: "Two", birth_date: "2015-01-01" },
  ],
  localParticipants: [], participantBookings: {}, lunchSelections: {},
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("BookingSummaryCards uses the effective private plan", () => {
  for (const presentation of ["step-one", "final-review"] as const) {
    test(`${presentation}: per-day selections shown exactly as submitted, linked participants only`, () => {
      state = base();
      const before = JSON.stringify(state.selectedDates);
      const out = text(renderToStaticMarkup(<BookingSummaryCards presentation={presentation} />));
      const plan = buildEffectivePrivatePlan(state as never);
      expect(plan.status).toBe("ready");
      const shown = [...out.matchAll(/(\d{2}:\d{2})–(\d{2}:\d{2})/g)].map((m) => `${m[1]}-${m[2]}`);
      if (plan.status === "ready") expect(shown).toEqual(plan.intervals.map((i) => `${i.startTime}-${i.endTime}`));
      expect(shown).toEqual(["10:00-11:00", "13:00-14:00"]);
      expect(out).toContain("Wird später zugewiesen");
      expect(out).not.toContain("Deselected");
      expect(out).toContain("Kept");
      expect(JSON.stringify(state.selectedDates)).toBe(before); // no in-place sort
    });
  }

  test("missing time shows no invented interval", () => {
    state = { ...base(), timeSlot: null, timeSelections: [] };
    const out = text(renderToStaticMarkup(<BookingSummaryCards presentation="final-review" />));
    expect(out).not.toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);
    expect(out).toContain("Zeit noch offen");
  });

  test("teacher selected: block shows that teacher", () => {
    state = { ...base(), assignLater: false, instructorId: "t1" };
    const out = text(renderToStaticMarkup(<BookingSummaryCards presentation="final-review" />));
    expect(out).toContain("Tina Synth");
  });
});
