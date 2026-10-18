/**
 * Internal (staff) visibility of group courses in planning/capacity views.
 * Active weekly courses are shown as before. Inactive courses (e.g. booked 26/27 courses)
 * and Saturday courses are shown only when a real enrollment exists in the selected range.
 * Public/active flags are never changed by this.
 */
export function isCourseVisibleInternally(
  course: { is_active: boolean | null; course_type?: string | null },
  hasEnrollmentsInRange: boolean
): boolean {
  if (hasEnrollmentsInRange) return true;
  return course.is_active === true && (course.course_type ?? "weekly") === "weekly";
}

/**
 * Combine training-group cards with course-level cards without double counting:
 * a course-level card is added only for courses without any training group and only
 * when it has participants.
 */
export function mergeCapacityGroups<T extends { courseId: string; participantCount: number }>(
  trainingGroupCards: T[],
  trainingGroupCourseIds: Array<string | null | undefined>,
  courseLevelCards: T[]
): T[] {
  const covered = new Set(trainingGroupCourseIds.filter(Boolean));
  return [
    ...trainingGroupCards,
    ...courseLevelCards.filter((g) => !covered.has(g.courseId) && g.participantCount > 0),
  ];
}

/**
 * Planning relevance for a selected week: the course's own period, else its product's season.
 * A course with no known period is relevant only when it has an instance in the week.
 * Enrollments in the week always keep a course visible (historic data stays reachable).
 */
export function isCourseRelevantForWeek(
  period: { start: string | null; end: string | null },
  weekStart: string,
  weekEnd: string,
  hasInstancesInWeek: boolean,
  hasEnrollmentsInWeek: boolean
): boolean {
  if (hasEnrollmentsInWeek) return true;
  if (!period.start && !period.end) return hasInstancesInWeek;
  return (!period.start || period.start <= weekEnd) && (!period.end || period.end >= weekStart);
}
