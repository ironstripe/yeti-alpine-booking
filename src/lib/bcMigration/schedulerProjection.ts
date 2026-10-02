/**
 * PRIVATE-APPOINTMENT scheduler acceptance only.
 * Maps projected private sessions to the ticket_items row shape useSchedulerData reads and applies the
 * SAME shared collapse rule (src/lib/schedulerCollapse.ts) → one scheduler block per private lesson.
 * Scheduler fields consumed for private lessons:
 *   ticket_items{date,time_start,time_end,instructor_id NOT NULL,appointment_id,status,tickets.status}
 *   + private_appointment_participants{appointment_id,participant} for names.
 *
 * NOT covered (deliberately emits nothing):
 *  - group/saturday: requires mapping to an existing target group_course_instance + enrollment; unmapped → blocked.
 *  - school_camp/school_group: the live SchoolCampBooking writes tickets.ticket_type='school_camp',
 *    ticket_items.item_type='school_group' with group_name/headcount and custom_start_time/custom_end_time,
 *    while useSchedulerData selects time_start/time_end (defaults 09:00/10:00). That mismatch is documented,
 *    not changed here; school scheduler verification is UNSUPPORTED in this milestone.
 * Rows without instructor_id are not shown by the scheduler (unassigned stays unassigned).
 */
import { collapseAppointmentRows } from "@/lib/schedulerCollapse";
import type { ProjectedSession } from "./evaluate";

export interface ProjectedTicketItemRow { appointment_id: string; date: string; time_start: string; time_end: string; instructor_id: string; participant_id: string | null; status: string }

export function toPrivateSchedulerRows(sessions: ProjectedSession[]) {
  const ticketItems: ProjectedTicketItemRow[] = [];
  const appointmentParticipants: { appointment_id: string; participant_id: string }[] = [];
  for (const s of sessions) {
    if (!s.instructor_id || s.target !== "private_appointments") continue;
    const appt = `proposed:${s.source_session_id}`;
    ticketItems.push({ appointment_id: appt, date: s.date, time_start: `${s.start}:00`, time_end: `${s.end}:00`, instructor_id: s.instructor_id, participant_id: s.participant_ids[0] ?? null, status: "confirmed" });
    for (const p of s.participant_ids) appointmentParticipants.push({ appointment_id: appt, participant_id: p });
  }
  return { ticketItems, appointmentParticipants };
}

/** Private blocks the scheduler would render (shared collapse rule). Group/school are never emitted. */
export function privateSchedulerBlocks(sessions: ProjectedSession[]) {
  return collapseAppointmentRows(toPrivateSchedulerRows(sessions).ticketItems)
    .map((t) => ({ kind: "private" as const, date: t.date, start: t.time_start, instructor_id: t.instructor_id, appointment_id: t.appointment_id }));
}
