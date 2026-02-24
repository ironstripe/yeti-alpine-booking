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

  // Realtime subscription for office hour blocks
  useRealtimeSubscription({
    table: "office_hour_blocks",
    queryKey: ["scheduler-office-blocks", startDateStr, endDateStr],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks", startDateStr, endDateStr] });
      toast.info("Neuer Bürodienst eingetragen");
    },
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks", startDateStr, endDateStr] });
    },
    onDelete: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduler-office-blocks", startDateStr, endDateStr] });
    },
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
          period_group_id,
          is_period_override,
          tickets!inner (
            status,
            paid_amount,
            total_amount,
            master_booking_id,
            is_initiator,
            customer_id,
            customer:customers(last_name)
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

  // Fetch period metadata for any period bookings in the date range
  const periodMetadataQuery = useQuery({
    queryKey: ["period-metadata", startDateStr, endDateStr],
    queryFn: async () => {
      // Get unique period_group_ids from bookings
      const periodGroupIds = (bookingsQuery.data || [])
        .map(b => b.period_group_id)
        .filter((id): id is string => !!id);

      if (periodGroupIds.length === 0) return [];

      const uniqueIds = [...new Set(periodGroupIds)];
      
      const { data, error } = await supabase
        .from("ticket_item_period_metadata")
        .select("*")
        .in("period_group_id", uniqueIds);

      if (error) throw error;
      return data;
    },
    enabled: bookingsQuery.isSuccess,
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

  // Fetch office hour blocks for the date range
  const officeBlocksQuery = useQuery({
    queryKey: ["scheduler-office-blocks", startDateStr, endDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("office_hour_blocks")
        .select("*")
        .gte("date", startDateStr)
        .lte("date", endDateStr);

      if (error) throw error;
      return data as {
        id: string;
        instructor_id: string;
        date: string;
        time_start: string;
        time_end: string;
        note: string | null;
      }[];
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

  // Transform bookings with period metadata and shared lesson deduplication
  const rawBookings = (bookingsQuery.data || [])
    .filter((b) => !instructorId || b.instructor_id === instructorId);

  // Group by master_booking_id for deduplication of shared lessons
  const masterBookingGroups = new Map<string, typeof rawBookings>();
  const standaloneBookings: typeof rawBookings = [];

  for (const b of rawBookings) {
    const ticket = b.tickets as unknown as { status: string; paid_amount: number; total_amount: number; master_booking_id: string | null; is_initiator: boolean; customer_id: string; customer: { last_name: string } | null };
    if (ticket?.master_booking_id) {
      const key = `${ticket.master_booking_id}-${b.date}`;
      if (!masterBookingGroups.has(key)) {
        masterBookingGroups.set(key, []);
      }
      masterBookingGroups.get(key)!.push(b);
    } else {
      standaloneBookings.push(b);
    }
  }

  // Process standalone bookings normally
  const bookings: SchedulerBooking[] = standaloneBookings.map((b) => {
    const ticket = b.tickets as unknown as { status: string; paid_amount: number; total_amount: number; master_booking_id: string | null };
    const participant = b.customer_participants as unknown as { first_name: string; last_name: string; sport: string | null } | null;
    
    const periodMeta = b.period_group_id 
      ? (periodMetadataQuery.data || []).find(pm => pm.period_group_id === b.period_group_id)
      : null;
    
    let periodTotalDays: number | undefined;
    if (periodMeta) {
      const startDate = new Date(periodMeta.start_date);
      const endDate = new Date(periodMeta.end_date);
      periodTotalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    const isOverride = b.is_period_override || (
      periodMeta && (
        b.instructor_id !== periodMeta.base_instructor_id ||
        b.time_start !== periodMeta.base_time_start ||
        b.time_end !== periodMeta.base_time_end
      )
    );

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
      isPartOfPeriod: !!b.period_group_id,
      periodGroupId: b.period_group_id || undefined,
      periodStartDate: periodMeta?.start_date || undefined,
      periodEndDate: periodMeta?.end_date || undefined,
      periodTotalDays,
      isOverride: isOverride || undefined,
      baseInstructorId: periodMeta?.base_instructor_id || undefined,
      baseTimeStart: periodMeta?.base_time_start || undefined,
      baseTimeEnd: periodMeta?.base_time_end || undefined,
    };
  });

  // Process shared lesson groups - deduplicate into single bars
  for (const [key, groupBookings] of masterBookingGroups) {
    if (groupBookings.length === 0) continue;
    const first = groupBookings[0];
    
    // Collect unique customer last names across all tickets in this group
    const customerNames = new Set<string>();
    for (const b of groupBookings) {
      const ticket = b.tickets as unknown as { customer: { last_name: string } | null };
      if (ticket?.customer?.last_name) {
        customerNames.add(ticket.customer.last_name);
      }
    }

    const ticket = first.tickets as unknown as { status: string; paid_amount: number; total_amount: number; master_booking_id: string };

    bookings.push({
      id: first.id,
      instructorId: first.instructor_id!,
      date: first.date,
      timeStart: first.time_start || "09:00",
      timeEnd: first.time_end || "10:00",
      type: "private" as const,
      isPaid: true, // Shared lessons show as "paid" in scheduler
      ticketId: first.ticket_id,
      participantName: [...customerNames].join(" / "),
      status: first.status || "booked",
      participantSport: null,
      isSharedLesson: true,
      sharedCustomerNames: [...customerNames],
      masterBookingId: ticket.master_booking_id,
    });
  }

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

  // Transform office hour blocks as bookings with type "office_shift"
  const officeBlockBookings: SchedulerBooking[] = (officeBlocksQuery.data || [])
    .filter((o) => !instructorId || o.instructor_id === instructorId)
    .map((o) => ({
      id: `office-block-${o.id}`,
      instructorId: o.instructor_id,
      date: o.date,
      timeStart: o.time_start,
      timeEnd: o.time_end,
      type: "office_shift" as const,
      isPaid: true,
      ticketId: o.id,
      participantName: o.note || "Bürodienst",
      status: "scheduled",
    }));

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
    bookings: [...bookings, ...groupBookings, ...officeBlockBookings],
    absences,
    isLoading: 
      instructorsQuery.isLoading || 
      bookingsQuery.isLoading || 
      groupInstancesQuery.isLoading ||
      absencesQuery.isLoading ||
      recurringBlocksQuery.isLoading ||
      officeBlocksQuery.isLoading ||
      periodMetadataQuery.isLoading,
    error: 
      instructorsQuery.error || 
      bookingsQuery.error || 
      groupInstancesQuery.error ||
      absencesQuery.error ||
      recurringBlocksQuery.error ||
      officeBlocksQuery.error ||
      periodMetadataQuery.error,
    refetch: () => {
      instructorsQuery.refetch();
      bookingsQuery.refetch();
      groupInstancesQuery.refetch();
      absencesQuery.refetch();
      recurringBlocksQuery.refetch();
      officeBlocksQuery.refetch();
      periodMetadataQuery.refetch();
    },
  };
}
