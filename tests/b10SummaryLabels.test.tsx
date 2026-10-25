// B10: real BookingSummaryCards / ConfirmationOptions / BookingSuccessModal texts follow per-lesson
// teacher ids and assigned people; save payload mapping (blockTeacherId) identical to useCreateBooking.
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as realWizardContext from "../src/contexts/BookingWizardContext";
import { blockTeacherId, summarizeTeachers, blocksWithPeople } from "../src/lib/summaryAssignments";
import { buildEffectivePrivatePlan } from "../src/lib/effectivePrivatePlan";

let state: Record<string, unknown> = {};
mock.module("@/contexts/BookingWizardContext", () => ({ ...realWizardContext, useBookingWizard: () => ({ state }) }));
mock.module("@/hooks/useInstructors", () => ({
  useInstructors: () => ({ data: [{ id: "t1", first_name: "Tina", last_name: "Synth" }, { id: "t2", first_name: "Toni", last_name: "Synth" }] }),
  getSpecializationLabel: (x: string) => x,
}));
mock.module("@/components/bookings/wizard/PriceBreakdown", () => ({ PriceBreakdown: () => null }));
const { BookingSummaryCards } = await import("../src/components/bookings/wizard/BookingSummaryCards");
const { ConfirmationOptions } = await import("../src/components/bookings/wizard/ConfirmationOptions");

const D1 = "2026-12-21", D2 = "2026-12-22";
const base = (o: Record<string, unknown> = {}) => ({
  productType: "private", sport: "ski", duration: 1, isEditMode: false, selectedDates: [D1, D2], timeSlot: "10:00 - 11:00",
  timeSelections: [{ date: D1, startTime: "10:00", endTime: "11:00" }, { date: D2, startTime: "13:00", endTime: "14:00" }],
  appointments: null, dayTimeOverrides: {}, dayInstructorOverrides: {}, instructorId: null, instructor: null, assignLater: false,
  privateGroupProposal: null, meetingPoint: "x", language: "de", customer: { id: "c", first_name: "S", last_name: "P", phone: null, email: null },
  activeCartItemId: "a", cartItems: [{ id: "a", assignedParticipantIds: ["p2"] }],
  selectedParticipants: [{ id: "p1", first_name: "Other", birth_date: "2015-01-01" }, { id: "p2", first_name: "Kept", birth_date: "2015-01-01" }],
  localParticipants: [], participantBookings: {}, lunchSelections: {}, ...o,
});
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const summary = () => text(renderToStaticMarkup(<BookingSummaryCards presentation="final-review" />));
const payloadTeachers = () => { const p = buildEffectivePrivatePlan(state as never); return p.status === "ready" ? p.intervals.map((iv) => blockTeacherId(iv, state.instructorId as string | null)) : []; };

describe("B10 private teacher summary", () => {
  test("2 days, 2 teachers: per-day names + 'Mehrere Lehrpersonen', no global 'Kein Skilehrer'", () => {
    state = base({ dayInstructorOverrides: { [D1]: "t1", [D2]: "t2" } });
    const out = summary();
    expect(payloadTeachers()).toEqual(["t1", "t2"]);
    expect(out).toContain("10:00–11:00 · Tina Synth"); expect(out).toContain("13:00–14:00 · Toni Synth");
    expect(out).toContain("Mehrere Lehrpersonen: Tina Synth, Toni Synth");
    expect(out).not.toContain("Kein Skilehrer ausgewählt"); expect(out).not.toContain("Wird später zugewiesen");
  });
  test("assigned + later: one named, one later, counted", () => {
    state = base({ assignLater: true, dayInstructorOverrides: { [D1]: "t1" } });
    const out = summary();
    expect(payloadTeachers()).toEqual(["t1", null]);
    expect(out).toContain("10:00–11:00 · Tina Synth"); expect(out).toContain("13:00–14:00 · Wird später zugewiesen");
    expect(out).toContain("1 Lektion wird später zugewiesen"); expect(out).not.toContain("Kein Skilehrer");
  });
  test("all later", () => {
    state = base({ assignLater: true });
    const out = summary();
    expect(out.match(/Wird später zugewiesen/g)?.length).toBe(3); expect(out).not.toContain("Mehrere");
  });
  test("old single teacher keeps the previous display", () => {
    state = base({ instructorId: "t1", instructor: { id: "t1", first_name: "Tina", last_name: "Synth", level: null, languages: ["de"] } });
    const out = summary();
    expect(payloadTeachers()).toEqual(["t1", "t1"]); expect(out).toContain("Tina Synth"); expect(out).not.toContain("Mehrere");
  });
  test("missing teacher (not later) is shown as missing, unknown id never shown as later or invented", () => {
    state = base({ dayInstructorOverrides: { [D1]: "t-unknown" } });
    const out = summary();
    expect(out).toContain("Lehrperson zugewiesen (Name nicht geladen)"); expect(out).toContain("13:00–14:00 · Lehrperson fehlt");
    expect(out).toContain("1 Lektion ohne Lehrperson");
  });
  test("summarizeTeachers never counts repeats as different teachers", () => {
    expect(summarizeTeachers(["t1", "t1", "t1"], false)).toEqual({ kind: "single", id: "t1" });
  });
});

describe("B10 group per-lesson people", () => {
  test("participant mode: each block lists the stable assigned people once; one person on several days", () => {
    const b = (dates: string[]) => dates.flatMap((date) => [{ date, startTime: "10:00", endTime: "12:00" }, { date, startTime: "14:00", endTime: "16:00" }]);
    expect(blocksWithPeople([{ participantId: "a", blocks: b([D1, D2]) }, { participantId: "b", blocks: [{ date: D1, startTime: "10:00", endTime: "12:00" }] }], D1))
      .toEqual([{ startTime: "10:00", endTime: "12:00", participantIds: ["a", "b"] }, { startTime: "14:00", endTime: "16:00", participantIds: ["a"] }]);
    state = base({ productType: "group", useParticipantSpecificBooking: true, cartItems: [{ id: "a", assignedParticipantIds: ["p1", "p2"] }],
      participantBookings: { p1: { dates: [D1, D2], groupBlocks: b([D1, D2]) }, p2: { dates: [D1], groupBlocks: [{ date: D1, startTime: "10:00", endTime: "12:00" }] } } });
    const out = summary();
    expect(out).toContain("10:00–12:00 · Other, Kept"); expect(out).toContain("14:00–16:00 · Other");
  });
});

describe("B10 intention labels", () => {
  test("instructor notification lists per-lesson teachers and promises no automatic send", () => {
    state = base({ dayInstructorOverrides: { [D1]: "t1", [D2]: "t2" } });
    const out = text(renderToStaticMarkup(<ConfirmationOptions sendCustomerEmail={false} onSendCustomerEmailChange={() => {}} sendCustomerWhatsApp={false} onSendCustomerWhatsAppChange={() => {}} notifyInstructor onNotifyInstructorChange={() => {}} />));
    expect(out).toContain("Tina Synth, Toni Synth"); expect(out).toContain("kein automatischer WhatsApp-Versand");
  });
});
