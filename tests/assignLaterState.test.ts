import { describe, expect, test } from "bun:test";
import { applyAssignLater, type AssignLaterFields } from "../src/lib/assignLaterState";

const T1 = "teacher-1", T2 = "teacher-2";
type Item = AssignLaterFields & { id: string; selectedDates: string[]; timeSlot: string | null; duration: number | null;
  assignedParticipantIds: string[]; schedulerPrefill: unknown };

// Scheduler-prefilled multi-date plan with a per-day and a per-block teacher
const prefilled = (): Item => {
  const plan = [
    { date: "2026-12-21", startTime: "12:00", durationMinutes: 120, instructorId: T1 },
    { date: "2026-12-22", startTime: "12:00", durationMinutes: 120, instructorId: T2 },
    { date: "2026-12-23", startTime: "09:00", durationMinutes: 60, instructorId: T1 },
    { date: "2026-12-23", startTime: "14:00", durationMinutes: 120, instructorId: T2 },
  ];
  return {
    id: "a", assignLater: false, instructorId: T1, instructor: { id: T1 },
    appointments: plan.map((p) => ({ ...p })),
    schedulerPrefill: { source: "scheduler", plan },
    dayInstructorOverrides: { "2026-12-22": T2 },
    dayTimeOverrides: {
      "2026-12-21": [{ id: "b1", startTime: "12:00", endTime: "14:00" }],
      "2026-12-23": [{ id: "b2", startTime: "09:00", endTime: "10:00" }, { id: "b3", startTime: "14:00", endTime: "16:00", instructorId: T2 }],
    },
    miniSchedulerSelections: [{ id: "m", instructorId: T1, instructorName: "X", date: "2026-12-21", startTime: "12:00", endTime: "14:00" }],
    privateGroupProposal: { groups: [{ id: "g", participantIds: ["p1"], instructorId: T1, instructor: { id: T1 } as never, startTime: "12:00", endTime: "14:00" }], warnings: [] },
    selectedDates: ["2026-12-21", "2026-12-22", "2026-12-23"], timeSlot: "12:00 - 14:00", duration: 2,
    assignedParticipantIds: ["p1", "local-x"],
  };
};

const teacherRefs = (s: Item) => JSON.stringify({ ...s, schedulerPrefill: null }).match(/teacher-\d/g) ?? [];

describe("applyAssignLater", () => {
  test("on: clears every teacher reference, keeps timing and participants", () => {
    const before = prefilled();
    const after = applyAssignLater(before, true);
    expect(after.assignLater).toBe(true);
    expect(teacherRefs(after)).toEqual([]);
    expect(after.miniSchedulerSelections).toEqual([]);
    expect(after.dayInstructorOverrides).toEqual({});
    expect(after.appointments!.map((a) => [a.date, a.startTime, a.durationMinutes]))
      .toEqual(before.appointments!.map((a) => [a.date, a.startTime, a.durationMinutes]));
    expect(after.dayTimeOverrides["2026-12-23"].map((b) => [b.id, b.startTime, b.endTime]))
      .toEqual([["b2", "09:00", "10:00"], ["b3", "14:00", "16:00"]]);
    expect(after.privateGroupProposal!.groups[0]).toMatchObject({ participantIds: ["p1"], startTime: "12:00", endTime: "14:00", instructorId: null, instructor: null });
    expect([after.selectedDates, after.timeSlot, after.duration, after.assignedParticipantIds])
      .toEqual([before.selectedDates, before.timeSlot, before.duration, before.assignedParticipantIds]);
    // provenance is kept as the untouched original scheduler selection
    expect(after.schedulerPrefill).toBe(before.schedulerPrefill);
  });

  test("input is not mutated (a cancelled/ignored transition changes nothing)", () => {
    const before = prefilled();
    const snapshot = JSON.stringify(before);
    applyAssignLater(before, true);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("off after on never resurrects a teacher", () => {
    const off = applyAssignLater(applyAssignLater(prefilled(), true), false);
    expect(off.assignLater).toBe(false);
    expect(off.instructorId).toBeNull();
    expect(teacherRefs(off)).toEqual([]);
  });

  test("off without toggling on leaves the assigned/prefill flow unchanged", () => {
    const before = prefilled();
    expect(applyAssignLater(before, false)).toEqual(before);
  });

  test("cart round-trip and multi-item isolation", () => {
    // Simulates the context: transition only the active item's snapshot, then switch away and back.
    const other = { ...prefilled(), id: "b" };
    let cart: Item[] = [prefilled(), other];
    cart = cart.map((i) => (i.id === "a" ? applyAssignLater(i, true) : i));
    const switchedBack = { ...cart.find((i) => i.id === "a")! };
    expect(switchedBack.assignLater).toBe(true);
    expect(teacherRefs(switchedBack)).toEqual([]);
    expect(cart.find((i) => i.id === "b")).toBe(other);
    expect(teacherRefs(other).length).toBeGreaterThan(0);
  });
});
