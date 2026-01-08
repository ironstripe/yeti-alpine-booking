import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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

  // Realtime subscription for groups
  useRealtimeSubscription<Tables<"groups">>({
    table: "groups",
    queryKey: ["scheduler-groups", startDateStr, endDateStr],
  });

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

  // Fetch groups (group courses) for the date range
  const groupsQuery = useQuery({
    queryKey: ["scheduler-groups", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .lte("start_date", endDateStr)
        .gte("end_date", startDateStr)
        .not("instructor_id", "is", null);

      if (error) throw error;
      return data as Tables<"groups">[];
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
      const participant = b.customer_participants as unknown as { first_name: string; last_name: string; sport: string | null } | null;
      
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
        participantSport: participant?.sport || null,
      };
    });

  // Add group courses as bookings - expand for each day in the range
  const groupBookings: SchedulerBooking[] = (groupsQuery.data || [])
    .filter((g) => !instructorId || g.instructor_id === instructorId)
    .flatMap((g) => {
      const slots: SchedulerBooking[] = [];
      // Generate bookings for each day the group is active within our date range
      let current = new Date(Math.max(new Date(g.start_date).getTime(), startDate.getTime()));
      const groupEnd = new Date(Math.min(new Date(g.end_date).getTime(), endDate.getTime()));
      
      while (current <= groupEnd) {
        const currentDateStr = format(current, "yyyy-MM-dd");
        
        if (g.time_morning_start && g.time_morning_end) {
          slots.push({
            id: `group-${g.id}-morning-${currentDateStr}`,
            instructorId: g.instructor_id!,
            date: currentDateStr,
            timeStart: g.time_morning_start,
            timeEnd: g.time_morning_end,
            type: "group",
            isPaid: true,
            ticketId: g.id,
            participantName: g.name,
            status: g.status || "active",
          });
        }

        if (g.time_afternoon_start && g.time_afternoon_end) {
          slots.push({
            id: `group-${g.id}-afternoon-${currentDateStr}`,
            instructorId: g.instructor_id!,
            date: currentDateStr,
            timeStart: g.time_afternoon_start,
            timeEnd: g.time_afternoon_end,
            type: "group",
            isPaid: true,
            ticketId: g.id,
            participantName: g.name,
            status: g.status || "active",
          });
        }
        
        current.setDate(current.getDate() + 1);
      }
      
      return slots;
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
      isFullDay: a.is_full_day ?? true,
      timeStart: a.time_start || undefined,
      timeEnd: a.time_end || undefined,
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
