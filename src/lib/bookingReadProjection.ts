// Read-only B03b projection. One projection per existing billing line, never repricing.
export interface ProjectionPerson { id: string; first_name?: string | null; last_name?: string | null }
export interface ProjectionAppointment {
  id: string; date: string; time_start: string | null; time_end: string | null;
  instructor_id: string | null; meeting_point: string | null;
}
export interface ProjectionLink { appointment_id: string; participant_id: string }
export interface ProjectionLine {
  id: string; appointment_id?: string | null; participant?: ProjectionPerson | null;
  line_total?: number | null; unit_price?: number | null;
}
export interface LessonReadProjection {
  people: Array<{ id: string; name: string }>;
  appointment: ProjectionAppointment | null;
  instructorName: string | null;
  amount: number;
  problem: string | null;
}
export const storedLineAmount = (line: ProjectionLine) => line.line_total ?? line.unit_price ?? 0;
export const projectionPersonName = (person?: ProjectionPerson | null) =>
  [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "Name nicht hinterlegt";

export function projectBookingLines(
  lines: ProjectionLine[], appointments: ProjectionAppointment[], links: ProjectionLink[],
  people: ProjectionPerson[], instructors: ProjectionPerson[],
): Record<string, LessonReadProjection> {
  const appts = new Map(appointments.map(a => [a.id, a]));
  const persons = new Map(people.map(p => [p.id, p]));
  const teachers = new Map(instructors.map(p => [p.id, p]));
  const linked = new Map<string, Set<string>>();
  for (const l of links) {
    const ids = linked.get(l.appointment_id) ?? new Set<string>();
    ids.add(l.participant_id); linked.set(l.appointment_id, ids);
  }
  return Object.fromEntries(lines.map(line => {
    const appointment = line.appointment_id ? appts.get(line.appointment_id) ?? null : null;
    const ids = line.appointment_id ? [...(linked.get(line.appointment_id) ?? [])].sort() : [];
    // An appointment link NEVER falls back to unrelated legacy/customer people.
    const names = line.appointment_id
      ? ids.map(id => ({ id, name: projectionPersonName(persons.get(id)) }))
      : line.participant ? [{ id: line.participant.id, name: projectionPersonName(line.participant) }] : [];
    return [line.id, {
      people: names, appointment, amount: storedLineAmount(line),
      instructorName: appointment?.instructor_id ? projectionPersonName(teachers.get(appointment.instructor_id)) : null,
      problem: line.appointment_id && !appointment ? "Termindaten konnten nicht geladen werden" : null,
    }];
  }));
}