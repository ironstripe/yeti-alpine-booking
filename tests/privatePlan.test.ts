import { describe, expect, test } from "bun:test";
import { validatePlan, deriveFromPlan } from "../src/lib/privatePlan";
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
});
