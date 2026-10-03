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
