/**
 * Maps projected sessions to the exact row shapes useSchedulerData reads, so tests can
 * prove "one scheduler block per real teaching session" with the SAME collapse rule.
 * Fields consumed by the scheduler:
 *  - private: ticket_items{date,time_start,time_end,instructor_id NOT NULL,appointment_id,status,tickets.status}
 *    + private_appointment_participants{appointment_id,participant} for names;
 *  - group/school: group_course_instances{date,start_time,end_time,instructor_id NOT NULL,current_participants}.
 * Rows without instructor_id are not shown by the scheduler (unassigned stays unassigned).
 */
import { collapseAppointmentRows } from "@/lib/schedulerCollapse";
import type { ProjectedSession } from "./evaluate";

export interface ProjectedTicketItemRow { appointment_id: string; date: string; time_start: string; time_end: string; instructor_id: string; participant_id: string | null; status: string }
export interface ProjectedGroupInstanceRow { date: string; start_time: string; end_time: string; instructor_id: string; current_participants: number }

export function toSchedulerRows(sessions: ProjectedSession[]) {
  const ticketItems: ProjectedTicketItemRow[] = [];
  const appointmentParticipants: { appointment_id: string; participant_id: string }[] = [];
  const groupInstances: ProjectedGroupInstanceRow[] = [];
  for (const s of sessions) {
    if (!s.instructor_id) continue;
    if (s.target === "private_appointments") {
      const appt = `proposed:${s.source_session_id}`;
      // Exactly one mirrored billing line per appointment; participants live in the join table.
      ticketItems.push({ appointment_id: appt, date: s.date, time_start: `${s.start}:00`, time_end: `${s.end}:00`, instructor_id: s.instructor_id, participant_id: s.participant_ids[0] ?? null, status: "confirmed" });
      for (const p of s.participant_ids) appointmentParticipants.push({ appointment_id: appt, participant_id: p });
    } else {
      groupInstances.push({ date: s.date, start_time: `${s.start}:00`, end_time: `${s.end}:00`, instructor_id: s.instructor_id, current_participants: s.headcount ?? s.participant_ids.length });
    }
  }
  return { ticketItems, appointmentParticipants, groupInstances };
}

/** Blocks the scheduler would render: collapsed private rows + group instances. */
export function schedulerBlocks(sessions: ProjectedSession[]) {
  const r = toSchedulerRows(sessions);
  return [...collapseAppointmentRows(r.ticketItems).map((t) => ({ kind: "private" as const, date: t.date, start: t.time_start, instructor_id: t.instructor_id, appointment_id: t.appointment_id })),
    ...r.groupInstances.map((g) => ({ kind: "group" as const, date: g.date, start: g.start_time, instructor_id: g.instructor_id, appointment_id: null }))];
}
