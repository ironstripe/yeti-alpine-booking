import { describe, it, expect } from "bun:test";
import { buildCoursePlanningLink, resolvePlanningWeek } from "@/lib/schedulerCourseLink";

describe("scheduler course deep link", () => {
  it("links to the exact week, date, course and instance", () => {
    const url = buildCoursePlanningLink({ id: "group-instance-abc", ticketId: "course-1", date: "2026-12-23" });
    const q = new URL(url, "http://x").searchParams;
    expect(url.startsWith("/trainings/planning?")).toBe(true);
    expect(q.get("week")).toBe("2026-12-21");
    expect(q.get("date")).toBe("2026-12-23");
    expect(q.get("course")).toBe("course-1");
    expect(q.get("instance")).toBe("abc");
  });
  it("never falls back to the current week for a link date", () => {
    expect(resolvePlanningWeek(null, "2026-12-19")?.toISOString().slice(0, 10)).toBe("2026-12-14");
    expect(resolvePlanningWeek("nonsense", null)).toBeNull();
  });
});
