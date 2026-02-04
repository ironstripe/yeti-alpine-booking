import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { eachDayOfInterval, parseISO, format } from "date-fns";
import { de } from "date-fns/locale";

export interface AvailabilityCheckParams {
  instructorId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export interface ConflictResult {
  date: string;
  conflictType: "private" | "group" | "absence";
  description: string;
}

// Helper to check if two time ranges overlap
function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && end1 > start2;
}

export function useInstructorAvailabilityCheck() {
  return useMutation({
    mutationFn: async (params: AvailabilityCheckParams): Promise<ConflictResult[]> => {
      const { instructorId, startDate, endDate, startTime, endTime } = params;
      
      if (!instructorId || !startDate || !endDate) {
        return [];
      }

      const conflicts: ConflictResult[] = [];

      // Generate all dates in the range
      const dates = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate),
      });

      const dateStrings = dates.map((d) => format(d, "yyyy-MM-dd"));

      // 1. Check private lessons (ticket_items)
      const { data: privateBookings, error: privateError } = await supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          tickets!inner(
            ticket_number,
            customers(first_name, last_name)
          )
        `)
        .eq("instructor_id", instructorId)
        .in("date", dateStrings)
        .neq("status", "cancelled");

      if (privateError) {
        console.error("Error checking private bookings:", privateError);
      }

      if (privateBookings) {
        for (const booking of privateBookings) {
          const bookingStart = booking.time_start || "00:00";
          const bookingEnd = booking.time_end || "23:59";

          if (timesOverlap(startTime, endTime, bookingStart, bookingEnd)) {
            const customerName = booking.tickets?.customers
              ? `${booking.tickets.customers.first_name || ""} ${booking.tickets.customers.last_name || ""}`.trim()
              : "Kunde";
            
            conflicts.push({
              date: booking.date,
              conflictType: "private",
              description: `Privatstunde mit ${customerName} (${bookingStart} - ${bookingEnd})`,
            });
          }
        }
      }

      // 2. Check group course instances
      const { data: groupInstances, error: groupError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          date,
          start_time,
          end_time,
          group_courses!inner(name)
        `)
        .eq("instructor_id", instructorId)
        .in("date", dateStrings)
        .neq("status", "cancelled");

      if (groupError) {
        console.error("Error checking group instances:", groupError);
      }

      if (groupInstances) {
        for (const instance of groupInstances) {
          const instanceStart = instance.start_time || "00:00";
          const instanceEnd = instance.end_time || "23:59";

          if (timesOverlap(startTime, endTime, instanceStart, instanceEnd)) {
            conflicts.push({
              date: instance.date,
              conflictType: "group",
              description: `Gruppenkurs "${instance.group_courses?.name}" (${instanceStart} - ${instanceEnd})`,
            });
          }
        }
      }

      // 3. Check absences
      const { data: absences, error: absenceError } = await supabase
        .from("instructor_absences")
        .select("*")
        .eq("instructor_id", instructorId)
        .eq("status", "confirmed")
        .lte("start_date", endDate)
        .gte("end_date", startDate);

      if (absenceError) {
        console.error("Error checking absences:", absenceError);
      }

      if (absences) {
        for (const absence of absences) {
          // Check each date in range against absence
          for (const dateStr of dateStrings) {
            if (dateStr >= absence.start_date && dateStr <= absence.end_date) {
              // Check time overlap for partial-day absences
              if (absence.is_full_day === false && absence.time_start && absence.time_end) {
                if (!timesOverlap(startTime, endTime, absence.time_start, absence.time_end)) {
                  continue; // No overlap
                }
              }

              // Don't add duplicate conflicts for the same date
              const existingConflict = conflicts.find(
                (c) => c.date === dateStr && c.conflictType === "absence"
              );
              if (!existingConflict) {
                const typeLabels: Record<string, string> = {
                  vacation: "Ferien",
                  sick: "Krank",
                  organization: "Organisation",
                  office_duty: "Bürodienst",
                  other: "Abwesend",
                };
                
                conflicts.push({
                  date: dateStr,
                  conflictType: "absence",
                  description: typeLabels[absence.type] || "Abwesend",
                });
              }
            }
          }
        }
      }

      // Sort conflicts by date
      conflicts.sort((a, b) => a.date.localeCompare(b.date));

      return conflicts;
    },
  });
}
