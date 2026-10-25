// R1 (S2): decides whether a position edit of a canonical private lesson needs the server move transaction.
// The edit card always sends every field, so "a field was sent" is not "a field changed": compare with the
// stored values. Notes-only saves never move. A NULL -> NULL teacher with a real time/date change is sent as
// the explicit "Später zuweisen" intent (server accepts it only for an already unassigned lesson); clearing
// an assigned teacher is refused here and on the server.
export interface StoredSlot { date: string; time_start: string | null; time_end: string | null; instructor_id: string | null }
export interface SlotInput { date?: string; timeStart?: string; timeEnd?: string; instructorId?: string | null }

export type MovePlan =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "move"; body: { date: string; time_start: string; time_end: string } & ({ instructor_id: string } | { assign_later: true }) };

const hm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

export function planCanonicalMove(cur: StoredSlot, input: SlotInput): MovePlan {
  const date = input.date ?? cur.date;
  const start = hm(input.timeStart ?? cur.time_start);
  const end = hm(input.timeEnd ?? cur.time_end);
  const instr = input.instructorId !== undefined ? input.instructorId : cur.instructor_id;
  const slotChanged = date !== cur.date || start !== hm(cur.time_start) || end !== hm(cur.time_end);
  const teacherChanged = (instr ?? null) !== (cur.instructor_id ?? null);
  if (!slotChanged && !teacherChanged) return { kind: "none" };
  if (instr) return { kind: "move", body: { date, time_start: start, time_end: end, instructor_id: instr } };
  if (cur.instructor_id) return { kind: "error", message: "Bitte eine Lehrperson wählen." };
  return { kind: "move", body: { date, time_start: start, time_end: end, assign_later: true } };
}
