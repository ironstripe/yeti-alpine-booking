// B10: display-only helpers for wizard summary/notification labels. Mirror the save mapping exactly
// (useCreateBooking: fixedInstructorId !== undefined ? fixedInstructorId : state.instructorId; no
// teacher => assign_later). Never changes assignments, prices or payloads.
import type { IntendedInterval } from "@/lib/teacherShortlist";

export const blockTeacherId = (iv: Pick<IntendedInterval, "fixedInstructorId">, mainInstructorId: string | null | undefined): string | null =>
  (iv.fixedInstructorId !== undefined ? iv.fixedInstructorId : mainInstructorId) ?? null;

export type TeacherSummary =
  | { kind: "none" }                                   // no lessons in plan yet
  | { kind: "single"; id: string }                     // every lesson same teacher
  | { kind: "later" }                                  // every lesson intentionally later
  | { kind: "missing" }                                // no teacher and not marked "later"
  | { kind: "mixed"; ids: string[]; later: number; missing: number };

export function summarizeTeachers(teacherIds: (string | null)[], assignLater: boolean): TeacherSummary {
  if (teacherIds.length === 0) return { kind: "none" };
  const ids = [...new Set(teacherIds.filter((x): x is string => !!x))];
  const open = teacherIds.filter((x) => !x).length;
  const later = assignLater ? open : 0;
  const missing = assignLater ? 0 : open;
  if (ids.length === 1 && open === 0) return { kind: "single", id: ids[0] };
  if (ids.length === 0) return assignLater ? { kind: "later" } : { kind: "missing" };
  return { kind: "mixed", ids, later, missing };
}

/** Name for a teacher id; unknown id stays "assigned" (never shown as later/none, never invented). */
export function teacherLabel(id: string | null, assignLater: boolean, nameOf: (id: string) => string | null): string {
  if (!id) return assignLater ? "Wird später zugewiesen" : "Lehrperson fehlt";
  return nameOf(id) ?? "Lehrperson zugewiesen (Name nicht geladen)";
}

/** Group participant-mode blocks of one date by time, with the stable participant ids attending. */
export function blocksWithPeople<T extends { date: string; startTime: string; endTime: string }>(
  entries: { participantId: string; blocks: T[] }[], date: string,
): { startTime: string; endTime: string; participantIds: string[] }[] {
  const map = new Map<string, { startTime: string; endTime: string; participantIds: string[] }>();
  for (const { participantId, blocks } of entries) {
    for (const b of blocks) {
      if (b.date !== date) continue;
      const k = `${b.startTime}|${b.endTime}`;
      const row = map.get(k) ?? { startTime: b.startTime, endTime: b.endTime, participantIds: [] };
      if (!row.participantIds.includes(participantId)) row.participantIds.push(participantId);
      map.set(k, row);
    }
  }
  return [...map.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
