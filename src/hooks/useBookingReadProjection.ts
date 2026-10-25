import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectBookingLines, type ProjectionLine } from "@/lib/bookingReadProjection";

export async function loadBookingReadProjection(
  client: Pick<typeof supabase, "from">, ticketId: string, lines: ProjectionLine[],
) {
  const ids = [...new Set(lines.map(l => l.appointment_id).filter((id): id is string => !!id))].sort();
  if (!ids.length) return projectBookingLines(lines, [], [], [], []);
  const [appointments, links] = await Promise.all([
    client.from("private_appointments")
      .select("id,date,time_start,time_end,instructor_id,meeting_point").eq("ticket_id", ticketId).in("id", ids),
    client.from("private_appointment_participants").select("appointment_id,participant_id").in("appointment_id", ids),
  ]);
  if (appointments.error || links.error) throw new Error("Unterrichts- und Teilnehmerdaten konnten nicht geladen werden");
  const personIds = [...new Set((links.data ?? []).map(l => l.participant_id))].sort();
  const instructorIds = [...new Set((appointments.data ?? []).map(a => a.instructor_id).filter((id): id is string => !!id))].sort();
  const [people, instructors] = await Promise.all([
    personIds.length ? client.from("customer_participants").select("id,first_name,last_name").in("id", personIds) : Promise.resolve({ data: [], error: null }),
    instructorIds.length ? client.from("instructors").select("id,first_name,last_name").in("id", instructorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (people.error || instructors.error) throw new Error("Teilnehmer- und Lehrernamen konnten nicht geladen werden");
  return projectBookingLines(lines, appointments.data ?? [], links.data ?? [], people.data ?? [], instructors.data ?? []);
}

export function useBookingReadProjection(ticketId: string | undefined, lines: ProjectionLine[] | undefined) {
  return useQuery({
    queryKey: ["booking-read-projection", ticketId, lines],
    enabled: !!ticketId && !!lines,
    queryFn: () => ticketId && lines ? loadBookingReadProjection(supabase, ticketId, lines) : null,
    retry: false,
  });
}