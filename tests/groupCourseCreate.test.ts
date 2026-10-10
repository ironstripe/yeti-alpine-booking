import { describe, expect, test } from "bun:test";
import { normalizeCourseAges, describeCourseSaveError } from "../src/lib/groupCourseCreate";

describe("#46 group course ages", () => {
  test("blank ages become the widest DB-valid range 1–99", () => {
    expect(normalizeCourseAges(null, null)).toEqual({ min_age: 1, max_age: 99 });
  });
  test("entered ages are kept exactly", () => {
    expect(normalizeCourseAges(5, 16)).toEqual({ min_age: 5, max_age: 16 });
  });
  test("failure message reports cleanup, never success", () => {
    expect(describeCourseSaveError({ code: "23502" }, "removed")).toContain("wieder entfernt");
    expect(describeCourseSaveError({ code: "42501" }, "failed")).toContain("nicht automatisch entfernt");
  });
});
