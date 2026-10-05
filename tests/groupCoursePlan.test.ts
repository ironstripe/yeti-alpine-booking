import { describe, expect, test } from "bun:test";
import { buildBookableGroupCourses, groupCourseEmptyMessage, type GroupCourseFact } from "../src/lib/groupCoursePlan";

const course = (overrides: Partial<GroupCourseFact> = {}): GroupCourseFact => ({
  id: "ski-blue", name: "Blauer Prinz", discipline: "ski", is_active: true, is_internal: false,
  course_type: "weekly", period_start_date: "2025-12-01", period_end_date: "2026-04-06",
  meeting_point: "Gorfion", max_participants: 6, sort_order: 2,
  product: { id: "product", name: "Gruppenkurs 1 Tag", type: "group", is_active: true, season_id: "season", season: { id: "season", name: "Winter 25/26", start_date: "2025-12-01", end_date: "2026-04-06" } },
  schedules: [{ day_of_week: 1, start_time: "10:00:00", end_time: "12:00:00", is_active: true }],
  course_dates: [], ...overrides,
});

describe("group course booking plan", () => {
  test("requires sport and all dates to have active schedule coverage", () => {
    expect(buildBookableGroupCourses([course()], ["2026-03-02"], null)).toHaveLength(0);
    expect(buildBookableGroupCourses([course()], ["2026-03-02", "2026-03-03"], "ski")).toHaveLength(0);
    expect(buildBookableGroupCourses([course()], ["2026-03-02"], "ski")).toHaveLength(1);
  });
  test("excludes inactive, internal, wrong-sport, inactive-product, and out-of-period courses", () => {
    expect(buildBookableGroupCourses([course({ is_active: false })], ["2026-03-02"], "ski")).toHaveLength(0);
    expect(buildBookableGroupCourses([course({ is_internal: true })], ["2026-03-02"], "ski")).toHaveLength(0);
    expect(buildBookableGroupCourses([course({ discipline: "snowboard" })], ["2026-03-02"], "ski")).toHaveLength(0);
    expect(buildBookableGroupCourses([course({ product: { ...course().product!, is_active: false } })], ["2026-03-02"], "ski")).toHaveLength(0);
    expect(buildBookableGroupCourses([course()], ["2026-12-07"], "ski")).toHaveLength(0);
  });
  test("keeps capacity informational and preserves stable catalog order", () => {
    const result = buildBookableGroupCourses([course({ id: "late", sort_order: 9, max_participants: 0 }), course({ id: "early", sort_order: 1 })], ["2026-03-02"], "ski");
    expect(result.map((item) => item.id)).toEqual(["early", "late"]);
  });
  test("returns exact blocks and blocks split-block persistence", () => {
    const result = buildBookableGroupCourses([course({ schedules: [
      { day_of_week: 1, start_time: "10:00:00", end_time: "12:00:00", is_active: true },
      { day_of_week: 1, start_time: "14:00:00", end_time: "16:00:00", is_active: true },
    ] })], ["2026-03-02"], "ski");
    expect(result[0].blocks).toEqual([{ date: "2026-03-02", startTime: "10:00", endTime: "12:00" }, { date: "2026-03-02", startTime: "14:00", endTime: "16:00" }]);
    expect(result[0].persistenceBlocker).toContain("mehrere Zeitblöcke");
  });
  test("explains unreleased 26/27 dates", () => {
    expect(groupCourseEmptyMessage(["2026-12-07"], "ski")).toContain("Winter 26/27");
  });
});