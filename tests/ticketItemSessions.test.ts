import { describe, it, expect } from "vitest";
import { itemSessions, ENROLLMENT_BLOCKS_SELECT } from "@/lib/ticketItemSchedule";

const line = (instanceIds: string[]) => ({
  item_type: "group", date: "2026-12-14", end_date: "2026-12-14", time_start: "10:00", time_end: "12:00", instructor_id: null,
  enrollments: instanceIds.map((id) => ({ instance: { id, date: "2026-12-14", start_time: "10:00", end_time: "12:00" } })),
});
const count = (items: any[]) => {
  const m = new Map<string, number>();
  items.forEach((i) => itemSessions(i, "2026-12-01", "2026-12-31").forEach((s) => !m.has(s.key) && m.set(s.key, s.minutes)));
  return { n: m.size, minutes: [...m.values()].reduce((a, b) => a + b, 0) };
};

describe("itemSessions group instance identity", () => {
  it("embeds the instance id", () => expect(ENROLLMENT_BLOCKS_SELECT).toContain("group_course_instances(id,"));
  it("two different group courses at the same time stay two sessions", () => {
    expect(count([line(["inst-A"]), line(["inst-B"])])).toEqual({ n: 2, minutes: 240 });
  });
  it("same instance across two participants deduplicates", () => {
    expect(count([line(["inst-A"]), line(["inst-A"])])).toEqual({ n: 1, minutes: 120 });
  });
});
