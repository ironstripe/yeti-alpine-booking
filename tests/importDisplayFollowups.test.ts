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
