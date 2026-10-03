/**
 * Pure roster builder for the capacity view (per course/week).
 * - Training-group cards hold only this week's enrollments, one entry per person.
 * - Enrollments without a (known, this-week) training group form a residual course card,
 *   shown next to non-empty training groups of the same course - never dropped, never duplicated.
 * - Empty training-group cards of a course are replaced by its residual card.
 */
export interface RosterEnrollment {
  id: string;
  participantId: string | null;
  instanceId: string;
  trainingGroupId: string | null;
}

export interface CardBase<P> {
  id: string; // training group id, '' for the course-level/residual card
  courseId: string;
  participantCount: number;
  participants: P[];
}

/** One entry per participant (first enrollment wins). */
export function dedupeByParticipant<T extends { participantId: string | null }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (!item.participantId || seen.has(item.participantId)) continue;
    seen.add(item.participantId);
    out.push(item);
  }
  return out;
}

export function buildCapacityRoster<P extends { participantId: string | null; instanceId: string }, C extends CardBase<P>>(params: {
  /** Training-group cards for the week (participants ignored, rebuilt here). */
  trainingGroupCards: C[];
  /** Course-level cards for the week (participants ignored, rebuilt here). */
  courseCards: C[];
  /** All enrollments of the courses on instances in the selected week. */
  enrollments: Array<RosterEnrollment & { courseId: string; participant: P }>;
  /** Builds a status-updated card copy with new participants. */
  withParticipants: (card: C, participants: P[]) => C;
}): C[] {
  const { trainingGroupCards, courseCards, enrollments, withParticipants } = params;
  const tgIds = new Set(trainingGroupCards.map((g) => g.id));
  const byGroup = new Map<string, P[]>();
  const residualByCourse = new Map<string, P[]>();

  for (const e of enrollments) {
    if (e.trainingGroupId && tgIds.has(e.trainingGroupId)) {
      if (!byGroup.has(e.trainingGroupId)) byGroup.set(e.trainingGroupId, []);
      byGroup.get(e.trainingGroupId)!.push(e.participant);
    } else {
      if (!residualByCourse.has(e.courseId)) residualByCourse.set(e.courseId, []);
      residualByCourse.get(e.courseId)!.push(e.participant);
    }
  }

  const tgBuilt = trainingGroupCards.map((g) => withParticipants(g, dedupeByParticipant(byGroup.get(g.id) || [])));
  const residualBuilt = courseCards
    .map((c) => withParticipants(c, dedupeByParticipant(residualByCourse.get(c.courseId) || [])))
    .filter((c) => c.participantCount > 0);
  const residualCourses = new Set(residualBuilt.map((c) => c.courseId));

  return [
    ...tgBuilt.filter((g) => g.participantCount > 0 || !residualCourses.has(g.courseId)),
    ...residualBuilt,
  ];
}
