import { describe, expect, test } from "bun:test";
import { dateSetChanged, showSchedulerPrefillBanner } from "../src/lib/privatePlan";
const plan = [{ date: "2027-01-10", startTime: "10:00", durationMinutes: 60, instructorId: "i1" }];
describe("scheduler prefill provenance", () => {
  test("a plan without provenance never shows the banner", () => {
    expect(showSchedulerPrefillBanner(null, plan)).toBe(false);
    expect(showSchedulerPrefillBanner(undefined, plan)).toBe(false);
  });
  test("provenance with a current plan shows the banner", () => {
    expect(showSchedulerPrefillBanner({ source: "scheduler", plan }, plan)).toBe(true);
  });
  test("provenance without a plan shows nothing", () => {
    expect(showSchedulerPrefillBanner({ source: "scheduler", plan }, null)).toBe(false);
    expect(showSchedulerPrefillBanner({ source: "scheduler", plan }, [])).toBe(false);
  });
  test("same date set (any order/duplicates) is not a change", () => {
    expect(dateSetChanged(["2027-01-10", "2027-01-11"], ["2027-01-11", "2027-01-10"])).toBe(false);
    expect(dateSetChanged(["2027-01-10"], ["2027-01-10", "2027-01-10"])).toBe(false);
  });
  test("added, removed or swapped dates are a change", () => {
    expect(dateSetChanged(["2027-01-10"], ["2027-01-10", "2027-01-11"])).toBe(true);
    expect(dateSetChanged(["2027-01-10", "2027-01-11"], ["2027-01-10"])).toBe(true);
    expect(dateSetChanged(["2027-01-10"], ["2027-01-12"])).toBe(true);
  });
});
