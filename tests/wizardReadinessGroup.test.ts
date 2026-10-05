import { describe, expect, test } from "bun:test";
import type { CartItem } from "../src/contexts/BookingWizardContext";
import { itemReadinessIssues } from "../src/lib/wizardReadiness";

const readyBase = (): CartItem => ({
  id: "item", productType: "group", productId: null, sport: "ski", dateRange: null,
  selectedDates: ["2026-03-02"], timeSlot: null, duration: null, numberOfPersons: 1,
  includeLunch: false, selectedGroupId: null, groupPlan: null, groupCourseType: null,
  lunchSelections: {}, vegetarianSelections: {}, appointments: null, schedulerPrefill: null,
  useParticipantSpecificBooking: false, participantBookings: {}, dayInstructorOverrides: {},
  dayTimeOverrides: {}, timeSelections: [], miniSchedulerSelections: [], privateGroupProposal: null,
  instructorId: null, instructor: null, assignLater: false, meetingPoint: "Gorfion",
  preferredInstructorId: null, language: "de", assignedParticipantIds: ["p1"],
});

describe("group wizard readiness", () => {
  test("requires an explicit shared course and checked plan", () => {
    expect(itemReadinessIssues(readyBase(), 0).some((issue) => issue.field === "course")).toBe(true);
    const item = { ...readyBase(), selectedGroupId: "course", groupPlan: { courseId: "course", courseName: "Blue", productName: "Day", meetingPoint: "Gorfion", blocks: [{ date: "2026-03-02", startTime: "10:00", endTime: "12:00" }], persistenceBlocker: null } };
    expect(itemReadinessIssues(item, 0)).toEqual([]);
  });
  test("blocks unsupported split blocks", () => {
    const item = { ...readyBase(), selectedGroupId: "course", groupPlan: { courseId: "course", courseName: "Blue", productName: "Day", meetingPoint: "Gorfion", blocks: [], persistenceBlocker: "Mehrere Blöcke" } };
    expect(itemReadinessIssues(item, 0).map((issue) => issue.message)).toContain("Mehrere Blöcke");
  });
  test("requires every linked participant to have an explicit course", () => {
    const item = { ...readyBase(), useParticipantSpecificBooking: true, participantBookings: { p1: { participantId: "p1", productType: "group" as const, productId: null, groupCourseId: null, dates: ["2026-03-02"], startTime: null, endTime: null, lunchDays: [], isVegetarian: false } } };
    expect(itemReadinessIssues(item, 0).some((issue) => issue.message.includes("jeden Teilnehmer"))).toBe(true);
  });
});