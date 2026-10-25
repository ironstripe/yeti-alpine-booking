import { describe, expect, test } from "bun:test";
import { hiddenAbsentInstructorIds, applyTeacherVisibility } from "../src/lib/schedulerVisibleFilters";
import type { SchedulerAbsence, SchedulerBooking } from "../src/lib/scheduler-utils";

const teacher = { id: "a", real_time_status: "available" };
const week = Array.from({ length: 7 }, (_, i) => `2026-12-${21 + i}`);
const absence = (patch: Partial<SchedulerAbsence> = {}): SchedulerAbsence => ({ id: "absence", instructorId: "a", startDate: week[0], endDate: week[6], status: "confirmed", type: "vacation", isFullDay: true, ...patch });
const hides = (rows: SchedulerAbsence[], dates = week, bookings: SchedulerBooking[] = [], status = "available") => hiddenAbsentInstructorIds([{ ...teacher, real_time_status: status }], dates, bookings, rows).has("a");
const booking = (type: SchedulerBooking["type"], date = week[2]): SchedulerBooking => ({ id: "planned", instructorId: "a", date, timeStart: "10:00", timeEnd: "12:00", type, ticketId: "fixture", status: "scheduled", isPaid: false });

describe("scheduler displayed-range absence", () => {
  test("confirmed entire week without assignments hides", () => expect(hides([absence()])).toBe(true));
  test("partial week remains", () => expect(hides([absence({ endDate: week[5] })])).toBe(false));
  test("seven distinct full days cover week", () => expect(hides(week.map(date => absence({ startDate: date, endDate: date })))).toBe(true));
  test("missing date remains", () => expect(hides(week.filter((_, i) => i !== 3).map(date => absence({ startDate: date, endDate: date })))).toBe(false));
  test("partial day remains", () => expect(hides([absence({ isFullDay: false, timeStart: "09:00", timeEnd: "12:00" })])).toBe(false));
  test("coherent timed coverage merges, including recurring SQL seconds", () => expect(hides([absence({ isFullDay: false, timeStart: "08:00:00", timeEnd: "12:00:00" }), absence({ id: "recurring-b", isFullDay: false, timeStart: "12:00:00", timeEnd: "17:00:00" })])).toBe(true));
  test("one-minute gap stays", () => expect(hides([absence({ isFullDay: false, timeStart: "09:00", timeEnd: "12:00" }), absence({ isFullDay: false, timeStart: "12:01", timeEnd: "16:00" })])).toBe(false));
  for (const status of ["pending", "rejected"] as const) test(`${status} not evidence`, () => expect(hides([absence({ status })])).toBe(false));
  for (const time of [undefined, "", "wrong", "24:00", "09:60", "16:00"]) test(`invalid/reversed start ${time} stays`, () => expect(hides([absence({ isFullDay: false, timeStart: time, timeEnd: "16:00" })])).toBe(false));
  test("invalid date stays", () => expect(hides([absence({ startDate: "2026-02-30" })])).toBe(false));
  for (const type of ["private", "group", "office_shift"] as const) test(`${type} assignment protects regardless of booking display filter`, () => expect(hides([absence()], week, [booking(type)])).toBe(false));
  test("on-call stays even with full absence", () => expect(hides([absence()], week, [], "on_call")).toBe(false));
  test("not_available status alone is not absence", () => expect(hides([], week, [], "unavailable")).toBe(false));
  test("group reserve is not absence", () => expect(hides([absence({ blockKind: "group_reserve" })])).toBe(false));
  test("office duty is not absence", () => expect(hides([absence({ type: "office_duty" })])).toBe(false));
  test("unknown deployment gates do not prove absence", () => expect(hides([absence({ id: "deployment-a-2026-12-21" })])).toBe(false));
  test("inclusive boundaries only; outside assignment does not protect", () => { expect(hides([absence()], [week[0]], [booking("private", "2026-12-20")])).toBe(true); expect(hides([absence()], ["2026-12-28"])).toBe(false); });
  test("mobile actual day hides but hidden week does not", () => { const oneDay = absence({ endDate: week[0] }); expect(hides([oneDay], [week[0]])).toBe(true); expect(hides([oneDay], week)).toBe(false); });
  test("three days require all three", () => expect(hides([absence({ endDate: week[1] })], week.slice(0, 3))).toBe(false));
  test("empty/invalid display range stays", () => { expect(hides([absence()], [])).toBe(false); expect(hides([absence()], ["invalid"])).toBe(false); });
  test("selected absent teacher bypasses compatible filters; reset returns all compatible", () => { const all = [{ id: "a" }, { id: "b" }]; const hidden = new Set(["a"]); expect(applyTeacherVisibility(all, [all[1]], "a", true, hidden)).toEqual([all[0]]); expect(applyTeacherVisibility(all, all, null, false, hidden)).toEqual(all); expect(applyTeacherVisibility(all, all, null, true, hidden)).toEqual([all[1]]); });
  test("inputs unchanged", () => { const rows = [absence()]; const before = JSON.stringify(rows); hides(rows); expect(JSON.stringify(rows)).toBe(before); });
});