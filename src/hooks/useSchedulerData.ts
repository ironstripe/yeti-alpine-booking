import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { 
  deriveInstructorColor, 
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";

interface UseSchedulerDataOptions {
  date: Date;
  instructorId?: string | null; // Filter to specific instructor
}

export function useSchedulerData({ date, instructorId }: UseSchedulerDataOptions) {
  const dateStr = format(date, "yyyy-MM-dd");

  // Fetch instructors
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

  // Fetch ticket items (private lessons) for the date
  const bookingsQuery = useQuery({
    queryKey: ["scheduler-bookings", dateStr],
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
            last_name
          )
        `)
        .eq("date", dateStr)
        .not("instructor_id", "is", null);

      if (error) throw error;
      return data;
    },
  });

  // Fetch groups (group courses) for the date
  const groupsQuery = useQuery({
    queryKey: ["scheduler-groups", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .not("instructor_id", "is", null);

      if (error) throw error;
      return data as Tables<"groups">[];
    },
  });

  // Fetch absences
  const absencesQuery = useQuery({
    queryKey: ["scheduler-absences", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_absences")
        .select("*")
        .lte("start_date", dateStr)
        .gte("end_date", dateStr);

      if (error) throw error;
      return data;
    },
  });

  // Derive enhanced instructors with colors
  const instructors: SchedulerInstructor[] = (instructorsQuery.data || [])
    .filter((i) => !instructorId || i.id === instructorId)
    .map((instructor) => {
      // Check if instructor has a group course on this date
      const hasGroupCourse = (groupsQuery.data || []).some(
        (g) => g.instructor_id === instructor.id
      );

      // Count today's bookings
      const todayBookingsCount = (bookingsQuery.data || []).filter(
        (b) => b.instructor_id === instructor.id
      ).length;

      return {
        ...instructor,
        color: deriveInstructorColor(instructor, hasGroupCourse),
        todayBookingsCount,
      };
    });

  // Transform bookings
  const bookings: SchedulerBooking[] = (bookingsQuery.data || [])
    .filter((b) => !instructorId || b.instructor_id === instructorId)
    .map((b) => {
      const ticket = b.tickets as unknown as { status: string; paid_amount: number; total_amount: number };
      const participant = b.customer_participants as unknown as { first_name: string; last_name: string } | null;
      
      return {
        id: b.id,
        instructorId: b.instructor_id!,
        date: b.date,
        timeStart: b.time_start || "09:00",
        timeEnd: b.time_end || "10:00",
        type: "private" as const,
        isPaid: (ticket?.paid_amount || 0) >= (ticket?.total_amount || 0),
        ticketId: b.ticket_id,
        participantName: participant 
          ? `${participant.first_name} ${participant.last_name || ""}`.trim()
          : undefined,
        status: b.status || "booked",
      };
    });

  // Add group courses as bookings
  const groupBookings: SchedulerBooking[] = (groupsQuery.data || [])
    .filter((g) => !instructorId || g.instructor_id === instructorId)
    .flatMap((g) => {
      const morningSlot: SchedulerBooking | null = g.time_morning_start && g.time_morning_end
        ? {
            id: `group-${g.id}-morning`,
            instructorId: g.instructor_id!,
            date: dateStr,
            timeStart: g.time_morning_start,
            timeEnd: g.time_morning_end,
            type: "group",
            isPaid: true,
            ticketId: g.id,
            participantName: g.name,
            status: g.status || "active",
          }
        : null;

      const afternoonSlot: SchedulerBooking | null = g.time_afternoon_start && g.time_afternoon_end
        ? {
            id: `group-${g.id}-afternoon`,
            instructorId: g.instructor_id!,
            date: dateStr,
            timeStart: g.time_afternoon_start,
            timeEnd: g.time_afternoon_end,
            type: "group",
            isPaid: true,
            ticketId: g.id,
            participantName: g.name,
            status: g.status || "active",
          }
        : null;

      return [morningSlot, afternoonSlot].filter(Boolean) as SchedulerBooking[];
    });

  // Transform absences
  const absences: SchedulerAbsence[] = (absencesQuery.data || [])
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
    }));

  return {
    instructors,
    bookings: [...bookings, ...groupBookings],
    absences,
    isLoading: 
      instructorsQuery.isLoading || 
      bookingsQuery.isLoading || 
      groupsQuery.isLoading ||
      absencesQuery.isLoading,
    error: 
      instructorsQuery.error || 
      bookingsQuery.error || 
      groupsQuery.error ||
      absencesQuery.error,
    refetch: () => {
      instructorsQuery.refetch();
      bookingsQuery.refetch();
      groupsQuery.refetch();
      absencesQuery.refetch();
    },
  };
}
