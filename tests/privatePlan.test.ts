import { describe, expect, test } from "bun:test";
import { buildWizardTimeSlot, validatePlan, deriveFromPlan, hasValidPrivateTiming, parseWizardTimeSlot } from "../src/lib/privatePlan";
const a = (date: string, startTime: string, durationMinutes: number, instructorId = "i1") => ({ date, startTime, durationMinutes, instructorId });
describe("privatePlan", () => {
  test("valid multi-block day, different instructors on different dates", () => {
    expect(validatePlan([a("2026-12-01","09:00",60), a("2026-12-01","11:00",120), a("2026-12-02","10:00",60,"i2")])).toBeNull();
  });
  test("rejects overlap regardless of instructor", () => { expect(validatePlan([a("2026-12-01","10:00",120), a("2026-12-01","11:00",60,"i2")])).toMatch(/überschneiden/); });
  test("rejects outside 09-16", () => { expect(validatePlan([a("2026-12-01","15:30",60)])).toMatch(/09:00/); expect(validatePlan([a("2026-12-01","08:00",60)])).not.toBeNull(); });
  test("rejects end <= start", () => { expect(validatePlan([a("2026-12-01","10:00",0)])).toMatch(/Ende/); });
  test("derives dates and per-block instructors", () => {
    const d = deriveFromPlan([a("2026-12-02","10:00",60,"i2"), a("2026-12-01","09:00",60)], "i1");
    expect(d.selectedDates).toEqual(["2026-12-01","2026-12-02"]);
    expect(d.dayInstructorOverrides).toEqual({ "2026-12-02": "i2" });
    expect(d.timeSelections).toHaveLength(2);
  });
  test("parses only complete forward time windows without defaults", () => {
    expect(parseWizardTimeSlot("12:00 - 14:00")).toEqual({ startTime: "12:00", endTime: "14:00", duration: 2 });
    expect(parseWizardTimeSlot(null)).toBeNull();
    expect(parseWizardTimeSlot("12:00 - 12:00")).toBeNull();
    expect(parseWizardTimeSlot("invalid")).toBeNull();
  });
  test("clears an incomplete selection instead of retaining a prior window", () => {
    expect(buildWizardTimeSlot("12:00", "14:00")).toEqual({ startTime: "12:00", endTime: "14:00", duration: 2 });
    expect(buildWizardTimeSlot("14:00", null)).toBeNull();
    expect(buildWizardTimeSlot(null, null)).toBeNull();
  });
  test("accepts a valid canonical variable plan without requiring a shared time slot", () => {
    const variablePlan = [a("2026-12-01", "09:00", 60), a("2026-12-02", "14:00", 120, "i2")];
    expect(hasValidPrivateTiming(null, variablePlan)).toBe(true);
    expect(hasValidPrivateTiming(null, [])).toBe(false);
    expect(hasValidPrivateTiming(null, [a("2026-12-01", "15:30", 60)])).toBe(false);
  });
});
