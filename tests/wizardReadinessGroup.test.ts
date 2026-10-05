import { describe, expect, test } from "bun:test";
import { createEmptyCartItem } from "../src/contexts/BookingWizardContext";
import { itemReadinessIssues } from "../src/lib/wizardReadiness";

const readyBase = () => ({ ...createEmptyCartItem(), productType: "group" as const, sport: "ski" as const, selectedDates: ["2026-03-02"], meetingPoint: "Gorfion", assignedParticipantIds: ["p1"] });

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