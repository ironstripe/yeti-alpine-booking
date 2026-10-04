import { describe, expect, test } from "bun:test";
import {
  buildIntendedIntervals,
  canSelectForWholePlan,
  evaluateTeacherCoverage,
  filterEligibleInstructors,
} from "../src/lib/teacherShortlist";
import type { SchedulerAbsence, SchedulerBooking } from "../src/lib/scheduler-utils";

const bk = (instructorId: string, date: string, timeStart: string, timeEnd: string): SchedulerBooking => ({
  id: `${instructorId}-${date}-${timeStart}`, instructorId, date, timeStart, timeEnd,
  type: "private", isPaid: false, ticketId: "t", status: "booked",
});
const ab = (instructorId: string, date: string, extra: Partial<SchedulerAbsence> = {}): SchedulerAbsence => ({
  id: `a-${instructorId}-${date}`, instructorId, startDate: date, endDate: date,
  type: "vacation", status: "confirmed", isFullDay: true, ...extra,
});
const base = { selectedDates: ["2026-12-02", "2026-12-01"], timeSlot: "10:00 - 12:00", appointments: null };

describe("buildIntendedIntervals", () => {
  test("no dates -> missing_dates", () => {
    expect(buildIntendedIntervals({ ...base, selectedDates: [] }).status).toBe("missing_dates");
  });
  test("incomplete time never falls back to a default", () => {
    const r = buildIntendedIntervals({ ...base, timeSlot: null });
    expect(r).toEqual({ status: "missing_time", datesWithoutTime: ["2026-12-01", "2026-12-02"] });
  });
  test("every selected date gets the exact shared interval, sorted", () => {
    const r = buildIntendedIntervals(base);
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.intervals.map((i) => `${i.date} ${i.startTime}-${i.endTime}`)).toEqual([
      "2026-12-01 10:00-12:00", "2026-12-02 10:00-12:00",
    ]);
  });
  test("per-day multi-block overrides are preserved", () => {
    const r = buildIntendedIntervals({
      ...base,
      dayTimeOverrides: { "2026-12-02": [
        { id: "a", startTime: "09:00", endTime: "10:00" },
        { id: "b", startTime: "13:00", endTime: "15:30" },
      ] },
    });
    if (r.status !== "ready") throw new Error("expected ready");
    expect(r.intervals.map((i) => `${i.date} ${i.startTime}-${i.endTime}`)).toEqual([
      "2026-12-01 10:00-12:00", "2026-12-02 09:00-10:00", "2026-12-02 13:00-15:30",
    ]);
  });
  test("canonical variable appointments are the plan (minute precision, pinned teacher kept)", () => {
    const r = buildIntendedIntervals({
      selectedDates: ["2026-12-01", "2026-12-02"], timeSlot: null,
      appointments: [
        { date: "2026-12-02", startTime: "13:30", durationMinutes: 90, instructorId: "t1" },
        { date: "2026-12-01", startTime: "09:00", durationMinutes: 60 },
      ],
    });
    if (r.status !== "ready") throw new Error("expected ready");
    expect(r.intervals).toEqual([
      { date: "2026-12-01", startTime: "09:00", endTime: "10:00", fixedInstructorId: undefined },
      { date: "2026-12-02", startTime: "13:30", endTime: "15:00", fixedInstructorId: "t1" },
    ]);
  });
});

describe("evaluateTeacherCoverage (exact interval)", () => {
  const ivs = [
    { date: "2026-12-01", startTime: "10:00", endTime: "12:00" },
    { date: "2026-12-02", startTime: "10:00", endTime: "12:00" },
  ];
  test("free on all intervals -> full", () => {
    expect(evaluateTeacherCoverage("t1", ivs, [bk("t1", "2026-12-01", "12:00", "13:00")], []).status).toBe("full");
  });
  test("overlap in the middle of the interval on one date -> partial", () => {
    const c = evaluateTeacherCoverage("t1", ivs, [bk("t1", "2026-12-02", "10:30", "11:00")], []);
    expect(c.status).toBe("partial");
    expect(c.blocked).toEqual([{ date: "2026-12-02", startTime: "10:00", endTime: "12:00", reason: "booked" }]);
  });
  test("overlap at the end only (11:30-12:30) is detected, not missed by start-hour checks", () => {
    const c = evaluateTeacherCoverage("t1", [ivs[0]], [bk("t1", "2026-12-01", "11:30", "12:30")], []);
    expect(c.status).toBe("none");
  });
  test("touching boundaries do not block", () => {
    const c = evaluateTeacherCoverage("t1", [ivs[0]], [bk("t1", "2026-12-01", "09:00", "10:00"), bk("t1", "2026-12-01", "12:00", "13:00")], []);
    expect(c.status).toBe("full");
  });
  test("absence on a date blocks that date", () => {
    const c = evaluateTeacherCoverage("t1", ivs, [], [ab("t1", "2026-12-01")]);
    expect(c.status).toBe("partial");
    expect(c.blocked[0].reason).toBe("absent");
  });
  test("other teachers' bookings are ignored", () => {
    expect(evaluateTeacherCoverage("t1", ivs, [bk("t2", "2026-12-01", "10:00", "12:00")], []).status).toBe("full");
  });
});

describe("whole-plan selection", () => {
  const free = { status: "full" as const, blocked: [] };
  const iv = (fixed: string | null | undefined) => ({ date: "2026-12-01", startTime: "10:00", endTime: "11:00", fixedInstructorId: fixed });
  test("partial coverage is never selectable", () => {
    expect(canSelectForWholePlan("t1", [iv(undefined)], { status: "partial", blocked: [] })).toBe(false);
  });
  test("interval pinned to another teacher blocks whole-plan selection", () => {
    expect(canSelectForWholePlan("t1", [iv(undefined), iv("t2")], free)).toBe(false);
    expect(canSelectForWholePlan("t1", [iv(null)], free)).toBe(false);
  });
  test("pinned to the same teacher (scheduler prefill) stays selectable", () => {
    expect(canSelectForWholePlan("t1", [iv("t1"), iv(undefined)], free)).toBe(true);
  });
});

describe("filterEligibleInstructors", () => {
  const i = (id: string, specialization: string, languages: string[], status = "active") => ({ id, status, specialization, languages });
  test("keeps the existing active/sport/language rule", () => {
    const list = [i("a", "ski", ["de"]), i("b", "snowboard", ["de"]), i("c", "both", ["en"]), i("d", "ski", ["fr"], "inactive"), i("e", "ski", ["it"])];
    expect(filterEligibleInstructors(list, "ski", "en").map((x) => x.id)).toEqual(["a", "c"]);
    expect(filterEligibleInstructors(list, "ski", "de").map((x) => x.id)).toEqual(["a", "c", "e"]);
  });
});
