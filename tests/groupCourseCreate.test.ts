import { describe, expect, test } from "bun:test";
import { createGroupCourse, CourseChildSaveError, buildCourseInsert, type CourseClient } from "../src/lib/groupCourseCreate";
import type { GroupCourseFormData } from "../src/types/group-courses";

const fixture: GroupCourseFormData = {
  name: "TEST – Blauer König – Saison 26/27", description: "", discipline: "ski",
  min_age: null, max_age: null, max_participants: 8, product_id: "prod-1", meeting_point: "",
  color: "#3B82F6", is_active: false, course_type: "weekly", period_start_date: null, period_end_date: null,
  sort_order: 0, schedules: { days: [1, 2, 3, 4, 5], time_slots: [{ start_time: "10:00", end_time: "12:00" }] },
};

function fakeClient(childResult: () => Promise<any>) {
  const calls: { table: string; rows: any }[] = [];
  const client: CourseClient = {
    from: (table) => ({
      insert: (rows: any) => {
        calls.push({ table, rows });
        const p: any = table === "group_courses" ? Promise.resolve({ error: null }) : childResult();
        p.select = () => ({ single: () => Promise.resolve({ data: { id: "c-1", name: rows.name }, error: null }) });
        return p;
      },
    }),
  };
  return { client, calls };
}

describe("#46 createGroupCourse", () => {
  test("blank ages stay null; office keeps 18–99; explicit ages kept", () => {
    expect(buildCourseInsert(fixture)).toMatchObject({ min_age: null, max_age: null, is_active: false, product_id: "prod-1", max_participants: 8 });
    expect(buildCourseInsert({ ...fixture, course_type: "office" })).toMatchObject({ min_age: 18, max_age: 99, product_id: null });
    expect(buildCourseInsert({ ...fixture, min_age: 5, max_age: 16 })).toMatchObject({ min_age: 5, max_age: 16 });
  });
  test("weekly fixture writes five Mon–Fri 10–12 rows", async () => {
    const { client, calls } = fakeClient(() => Promise.resolve({ error: null }));
    await createGroupCourse(client, fixture);
    const rows = calls.find((c) => c.table === "group_course_schedules")!.rows;
    expect(rows.map((r: any) => r.day_of_week)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every((r: any) => r.start_time === "10:00" && r.end_time === "12:00" && r.course_id === "c-1")).toBe(true);
  });
  test("schedule error → course-identity error, no cleanup call", async () => {
    const { client, calls } = fakeClient(() => Promise.resolve({ error: { code: "23514", message: "check violated" } }));
    const err = await createGroupCourse(client, fixture).catch((e) => e);
    expect(err).toBeInstanceOf(CourseChildSaveError);
    expect(err.courseId).toBe("c-1");
    expect(err.message).toContain("unbestätigt");
    expect(calls.map((c) => c.table)).toEqual(["group_courses", "group_course_schedules"]);
  });
  test("lost network answer after course commit is unconfirmed, not 'absent'", async () => {
    const { client } = fakeClient(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await createGroupCourse(client, fixture).catch((e) => e);
    expect(err).toBeInstanceOf(CourseChildSaveError);
    expect(err.message).toContain("Kurs existiert");
  });
});
