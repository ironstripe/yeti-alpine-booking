import { describe, test as it, expect } from "bun:test";
import { derivePaymentStatus, PAYMENT_STATUS_LABELS, isPaymentUnknown } from "../src/lib/finance";
import { calculateAge, getAgeDisplay, resolveBirthDateForSave } from "../src/lib/participant-utils";
import { getAge, getGroupRecommendationForParticipants } from "../src/lib/group-course-utils";
import { isCourseVisibleInternally, mergeCapacityGroups } from "../src/lib/internalCourseVisibility";

describe("payment unknown (paid_amount NULL)", () => {
  it("NULL is unknown, never unpaid or paid", () => {
    expect(derivePaymentStatus({ totalAmount: 980, paidAmount: null })).toBe("unknown");
    expect(derivePaymentStatus({ totalAmount: 0, paidAmount: null })).toBe("unknown");
    expect(derivePaymentStatus({ totalAmount: 980, paidAmount: null, dueDate: "2020-01-01" })).toBe("unknown");
    expect(PAYMENT_STATUS_LABELS.unknown).toBe("Zahlungsstatus unbekannt");
    expect(isPaymentUnknown(null)).toBe(true);
    expect(isPaymentUnknown(0)).toBe(false);
  });
  it("known amounts keep normal behaviour", () => {
    expect(derivePaymentStatus({ totalAmount: 100, paidAmount: 0 })).toBe("unpaid");
    expect(derivePaymentStatus({ totalAmount: 100, paidAmount: 40 })).toBe("partial");
    expect(derivePaymentStatus({ totalAmount: 100, paidAmount: 100 })).toBe("paid");
    expect(derivePaymentStatus({ totalAmount: 100, paidAmount: 0, dueDate: "2020-01-01" })).toBe("overdue");
  });
});

describe("unknown birth date", () => {
  it("never invents an age", () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge(undefined)).toBeNull();
    expect(calculateAge("not-a-date")).toBeNull();
    expect(getAge(null)).toBeNull();
    expect(getAgeDisplay(null)).toBe("Alter unbekannt");
    expect(getAgeDisplay(7)).toBe("7 Jahre");
  });
  it("editing other fields keeps NULL and never erases a known date", () => {
    expect(resolveBirthDateForSave(undefined, null)).toBeNull();
    expect(resolveBirthDateForSave(undefined, "2016-03-04")).toBe("2016-03-04");
    expect(resolveBirthDateForSave(new Date(2017, 0, 9), null)).toBe("2017-01-09");
    expect(resolveBirthDateForSave(new Date(2017, 0, 9), "2016-03-04")).toBe("2017-01-09");
  });
  it("group recommendation skips unknown ages instead of treating them as adults", () => {
    const r = getGroupRecommendationForParticipants([{ birth_date: null, level_current_season: null }]);
    expect(r.hasAdults).toBe(false);
    expect(r.hasToddlers).toBe(false);
  });
});

describe("internal course visibility", () => {
  it("keeps active weekly courses and adds inactive/Saturday only with enrollments", () => {
    expect(isCourseVisibleInternally({ is_active: true, course_type: "weekly" }, false)).toBe(true);
    expect(isCourseVisibleInternally({ is_active: false, course_type: "weekly" }, false)).toBe(false);
    expect(isCourseVisibleInternally({ is_active: null, course_type: "weekly" }, false)).toBe(false);
    expect(isCourseVisibleInternally({ is_active: false, course_type: "weekly" }, true)).toBe(true);
    expect(isCourseVisibleInternally({ is_active: false, course_type: "saturday_course" }, true)).toBe(true);
    expect(isCourseVisibleInternally({ is_active: true, course_type: "saturday_course" }, false)).toBe(false);
  });
  it("never counts a course twice when training groups exist", () => {
    const tg = [{ courseId: "A", participantCount: 5 }, { courseId: "A", participantCount: 4 }];
    const courseLevel = [
      { courseId: "A", participantCount: 9 },
      { courseId: "B", participantCount: 3 },
      { courseId: "C", participantCount: 0 },
    ];
    const merged = mergeCapacityGroups(tg, ["A", "A"], courseLevel);
    expect(merged.map((g) => g.courseId)).toEqual(["A", "A", "B"]);
    expect(merged.reduce((s, g) => s + g.participantCount, 0)).toBe(12);
  });
});

import { checkAgeRange, getBirthYear } from "../src/lib/participant-utils";
import { getBirthYearFromDate } from "../src/hooks/useParticipantSearch";

describe("age checks with unknown birth date", () => {
  it("returns explicit unknown/manual-check, never pass or fail", () => {
    expect(checkAgeRange(null, 6, 12)).toBe("unknown");
    expect(checkAgeRange(undefined, null, 12)).toBe("unknown");
  });
  it("known ages keep normal min/max rules", () => {
    expect(checkAgeRange(5, 6, 12)).toBe("too_young");
    expect(checkAgeRange(13, 6, 12)).toBe("too_old");
    expect(checkAgeRange(8, 6, 12)).toBe("ok");
    expect(checkAgeRange(40, null, null)).toBe("ok");
  });
  it("never shows 1970 as birth year", () => {
    expect(getBirthYear(null)).toBeNull();
    expect(getBirthYearFromDate(null)).toBe("unbekannt");
    expect(getBirthYearFromDate("2015-03-04")).toBe(2015);
  });
});

import { buildCapacityRoster } from "../src/lib/groupCapacityBuild";

describe("capacity roster builder", () => {
  type P = { participantId: string; instanceId: string; name: string };
  type C = { id: string; courseId: string; participantCount: number; participants: P[] };
  const card = (id: string, courseId: string): C => ({ id, courseId, participantCount: 0, participants: [] });
  const withParticipants = (c: C, participants: P[]): C => ({ ...c, participants, participantCount: participants.length });
  const enr = (id: string, pid: string, inst: string, tg: string | null, courseId: string) => ({
    id, participantId: pid, instanceId: inst, trainingGroupId: tg, courseId,
    participant: { participantId: pid, instanceId: inst, name: pid },
  });

  it("one assigned + two unassigned in same course -> 3 visible, no duplicates", () => {
    const enrollments = [enr("e1", "A", "i1", "tg1", "c1"), enr("e2", "B", "i1", null, "c1"), enr("e3", "C", "i1", null, "c1")];
    const before = JSON.stringify(enrollments);
    const out = buildCapacityRoster({ trainingGroupCards: [card("tg1", "c1"), card("tg2", "c1")], courseCards: [card("", "c1")], enrollments, withParticipants });
    const all = out.flatMap((g) => g.participants.map((p) => p.participantId));
    expect(all.sort()).toEqual(["A", "B", "C"]);
    expect(out.map((g) => g.id).sort()).toEqual(["", "tg1"]); // empty tg2 replaced by residual card
    expect(JSON.stringify(enrollments)).toBe(before); // inputs not mutated
  });

  it("one participant over 5 days counts once in the group", () => {
    const enrollments = ["d1", "d2", "d3", "d4", "d5"].map((d, i) => enr(`e${i}`, "A", d, "tg1", "c1"));
    const out = buildCapacityRoster({ trainingGroupCards: [card("tg1", "c1")], courseCards: [card("", "c1")], enrollments, withParticipants });
    expect(out).toHaveLength(1);
    expect(out[0].participantCount).toBe(1);
  });

  it("residual card keeps a defined instanceId", () => {
    const out = buildCapacityRoster({ trainingGroupCards: [], courseCards: [card("", "c1")], enrollments: [enr("e1", "A", "i9", null, "c1")], withParticipants });
    expect(out[0].participants[0].instanceId).toBe("i9");
  });

  it("mixed courses and Saturday course stay separate", () => {
    const enrollments = [enr("e1", "A", "i1", "tg1", "c1"), enr("e2", "B", "s1", null, "sat"), enr("e3", "B", "s1", null, "sat"), enr("e4", "C", "i2", null, "c2")];
    const out = buildCapacityRoster({
      trainingGroupCards: [card("tg1", "c1")],
      courseCards: [card("", "c1"), card("", "sat"), card("", "c2"), card("", "empty")],
      enrollments, withParticipants,
    });
    const byCourse = Object.fromEntries(out.map((g) => [g.courseId + ":" + g.id, g.participantCount]));
    expect(byCourse).toEqual({ "c1:tg1": 1, "sat:": 1, "c2:": 1 });
  });

  it("empty training groups remain when the course has no residual enrollments", () => {
    const out = buildCapacityRoster({ trainingGroupCards: [card("tg1", "c1")], courseCards: [card("", "c1")], enrollments: [], withParticipants });
    expect(out.map((g) => g.id)).toEqual(["tg1"]);
  });
});
