import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, parseISO } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { 
  deriveInstructorColor, 
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";
import { useRealtimeSubscription } from "./useRealtimeSubscription";
import { toast } from "sonner";

interface UseSchedulerDataOptions {
  startDate: Date;
  endDate: Date;
  instructorId?: string | null; // Filter to specific instructor
}

export function useSchedulerData({ startDate, endDate, instructorId }: UseSchedulerDataOptions) {
  const queryClient = useQueryClient();
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  // Realtime subscription for ticket_items (schedule changes)
  useRealtimeSubscription<Tables<"ticket_items">>({
    table: "ticket_items",
    queryKey: ["scheduler-bookings", startDateStr, endDateStr],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings", startDateStr, endDateStr] });
      toast.info("Neue Buchung im Stundenplan");
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings", startDateStr, endDateStr] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-bookings", startDateStr, endDateStr] });
    },
  });

  // Realtime subscription for instructor_absences
  useRealtimeSubscription<Tables<"instructor_absences">>({
    table: "instructor_absences",
    queryKey: ["scheduler-absences", startDateStr, endDateStr],
    onInsert: (absence) => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences", startDateStr, endDateStr] });
      if (absence.status === "pending") {
        toast.info("Neue Abwesenheitsanfrage");
      }
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences", startDateStr, endDateStr] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-absences", startDateStr, endDateStr] });
    },
  });

  // Realtime subscription for recurring blocks
  useRealtimeSubscription<Tables<"instructor_recurring_blocks">>({
    table: "instructor_recurring_blocks",
    queryKey: ["scheduler-recurring-blocks", startDateStr, endDateStr],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-recurring-blocks", startDateStr, endDateStr] });
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-recurring-blocks", startDateStr, endDateStr] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-recurring-blocks", startDateStr, endDateStr] });
    },
  });

  // Realtime subscription for group course instances
  useRealtimeSubscription<Tables<"group_course_instances">>({
    table: "group_course_instances",
    queryKey: ["scheduler-group-instances", startDateStr, endDateStr],
  });

  // Fetch instructors (filter out office staff)
  const instructorsQuery = useQuery({
    queryKey: ["scheduler-instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructors")
        .select("*")
        .eq("status", "active")
        .order("last_name", { ascending: true });

      if (error) throw error;
      return data as Tables<"instructors">[];
    },
  });

  // Fetch ticket items (private lessons) for the date range
  const bookingsQuery = useQuery({
    queryKey: ["scheduler-bookings", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          ticket_id,
          instructor_id,
          date,
          time_start,
          time_end,
          status,
          product_id,
          participant_id,
          tickets!inner (
            status,
            paid_amount,
            total_amount
          ),
          customer_participants (
            first_name,
            last_name,
            sport
          )
        `)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .not("instructor_id", "is", null);

      if (error) throw error;
      return data;
    },
  });

  // Fetch group course instances for the date range
  const groupInstancesQuery = useQuery({
    queryKey: ["scheduler-group-instances", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          course_id,
          date,
          start_time,
          end_time,
          instructor_id,
          current_participants,
          status,
          group_courses!inner (
            name,
            color,
            max_participants,
            meeting_point
          )
        `)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .not("instructor_id", "is", null);

      if (error) throw error;
      return data;
    },
  });

  // Fetch absences for the date range
  const absencesQuery = useQuery({
    queryKey: ["scheduler-absences", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .select("*")
        .lte("start_date", endDateStr)
        .gte("end_date", startDateStr);

      if (error) throw error;
      return data;
    },
  });

  // Fetch recurring blocks for the date range
  const recurringBlocksQuery = useQuery({
    queryKey: ["scheduler-recurring-blocks", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_recurring_blocks")
        .select("*")
        .eq("status", "approved")
        .eq("is_active", true)
        .lte("valid_from", endDateStr)
        .or(`valid_until.is.null,valid_until.gte.${startDateStr}`);

      if (error) throw error;
      return data;
    },
  });

  // Helper function to expand recurring blocks into daily absences
  const expandRecurringBlocks = (): SchedulerAbsence[] => {
    const blocks = recurringBlocksQuery.data || [];
    const expanded: SchedulerAbsence[] = [];

    for (const block of blocks) {
      if (instructorId && block.instructor_id !== instructorId) continue;

      // Iterate through each day in the date range
      let currentDate = startDate;
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const blockValidFrom = parseISO(block.valid_from);
        const blockValidUntil = block.valid_until ? parseISO(block.valid_until) : null;

        // Check if this day matches the recurring pattern
        if (
          block.weekdays.includes(dayOfWeek) &&
          currentDate >= blockValidFrom &&
          (!blockValidUntil || currentDate <= blockValidUntil)
        ) {
          expanded.push({
            id: `recurring-${block.id}-${dateStr}`,
            instructorId: block.instructor_id,
            startDate: dateStr,
            endDate: dateStr,
            type: "other" as const,
            status: "confirmed" as const,
            reason: block.reason || "Wiederkehrender Block",
            isFullDay: false,
            timeStart: block.start_time,
            timeEnd: block.end_time,
          });
        }

        currentDate = addDays(currentDate, 1);
      }
    }

    return expanded;
  };

  // Derive enhanced instructors with colors and role type
  const instructors: SchedulerInstructor[] = (instructorsQuery.data || [])
    .filter((i) => !instructorId || i.id === instructorId)
    .map((instructor) => {
      // Check if instructor has a group course on this date
      const hasGroupCourse = (groupInstancesQuery.data || []).some(
        (g) => g.instructor_id === instructor.id
      );

      // Count today's bookings
      const todayBookingsCount = (bookingsQuery.data || []).filter(
        (b) => b.instructor_id === instructor.id
      ).length;

      // Derive role type from roles array for filtering
      const hasTeachingRole = instructor.roles?.some(r => r === 'ski' || r === 'snowboard');
      const roleType: 'instructor' | 'office_staff' = hasTeachingRole ? 'instructor' : 'office_staff';

      return {
        ...instructor,
        color: deriveInstructorColor(instructor, hasGroupCourse),
        todayBookingsCount,
        roleType,
      };
    });

  // Transform bookings
  const bookings: SchedulerBooking[] = (bookingsQuery.data || [])
    .filter((b) => !instructorId || b.instructor_id === instructorId)
    .map((b) => {
      const ticket = b.tickets as unknown as { status: string; paid_amount: number; total_amount: number };
      const participant = b.customer_participants as unknown as { first_name: string; last_name: string; sport: string | null } | null;
      
      return {
        id: b.id,
        instructorId: b.instructor_id!,
        date: b.date,
        timeStart: b.time_start || "09:00",
        timeEnd: b.time_end || "10:00",
        type: "private" as const,
        isPaid: (ticket?.total_amount || 0) > 0 && (ticket?.paid_amount || 0) >= (ticket?.total_amount || 0),
        ticketId: b.ticket_id,
        participantName: participant 
          ? `${participant.first_name} ${participant.last_name || ""}`.trim()
          : undefined,
        status: b.status || "booked",
        participantSport: participant?.sport || null,
      };
    });

  // Add group course instances as bookings
  const groupBookings: SchedulerBooking[] = (groupInstancesQuery.data || [])
    .filter((g) => !instructorId || g.instructor_id === instructorId)
    .map((g) => {
      const course = g.group_courses as unknown as {
        name: string;
        color: string;
        max_participants: number;
        meeting_point: string | null;
      };
      
      return {
        id: `group-instance-${g.id}`,
        instructorId: g.instructor_id!,
        date: g.date,
        timeStart: g.start_time,
        timeEnd: g.end_time,
        type: "group" as const,
        isPaid: true,
        ticketId: g.course_id,
        participantName: course.name,
        status: g.status || "scheduled",
        currentParticipants: g.current_participants || 0,
        maxParticipants: course.max_participants || undefined,
        meetingPoint: course.meeting_point || undefined,
      };
    });

  // Transform absences
  const oneTimeAbsences: SchedulerAbsence[] = (absencesQuery.data || [])
    .filter((a) => !instructorId || a.instructor_id === instructorId)
    .filter((a) => a.status !== "rejected") // Don't show rejected absences
    .map((a) => ({
      id: a.id,
      instructorId: a.instructor_id,
      startDate: a.start_date,
      endDate: a.end_date,
      type: a.type as "vacation" | "sick" | "organization" | "office_duty" | "other",
      status: (a.status || "confirmed") as "pending" | "confirmed" | "rejected",
      reason: a.reason || undefined,
      isFullDay: a.is_full_day ?? true,
      timeStart: a.time_start || undefined,
      timeEnd: a.time_end || undefined,
    }));

  // Combine one-time absences with expanded recurring blocks
  const absences: SchedulerAbsence[] = [...oneTimeAbsences, ...expandRecurringBlocks()];

  return {
    instructors,
    bookings: [...bookings, ...groupBookings],
    absences,
    isLoading: 
      instructorsQuery.isLoading || 
      bookingsQuery.isLoading || 
      groupInstancesQuery.isLoading ||
      absencesQuery.isLoading ||
      recurringBlocksQuery.isLoading,
    error: 
      instructorsQuery.error || 
      bookingsQuery.error || 
      groupInstancesQuery.error ||
      absencesQuery.error ||
      recurringBlocksQuery.error,
    refetch: () => {
      instructorsQuery.refetch();
      bookingsQuery.refetch();
      groupInstancesQuery.refetch();
      absencesQuery.refetch();
      recurringBlocksQuery.refetch();
    },
  };
}
