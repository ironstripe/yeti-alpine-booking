import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export interface PortalLesson {
  id: string;
  ticketId: string;
  ticketNumber: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  productName: string;
  productType: string;
  meetingPoint: string | null;
  status: string | null;
  instructorConfirmation: string | null;
  instructorNotes: string | null;
  internalNotes: string | null;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string;
    phone: string | null;
    email: string;
  } | null;
  participants: {
    id: string;
    firstName: string;
    lastName: string | null;
    birthDate: string;
    level: string | null;
    notes: string | null;
  }[];
}

export interface DaySummary {
  date: string;
  lessonCount: number;
  totalHours: number;
  participantCount: number;
}

export function useInstructorPortalData() {
  const { instructorId, loading: roleLoading } = useUserRole();

  // Fetch today's lessons
  const todayLessonsQuery = useQuery({
    queryKey: ["instructor-portal-today", instructorId],
    queryFn: async (): Promise<PortalLesson[]> => {
      if (!instructorId) return [];

      const today = format(new Date(), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          meeting_point,
          status,
          instructor_confirmation,
          instructor_notes,
          internal_notes,
          ticket_id,
          participant_id,
          product_id,
          products (id, name, type),
          tickets (
            id,
            ticket_number,
            customer_id,
            notes,
            customers (
              id,
              first_name,
              last_name,
              phone,
              email
            )
          ),
          customer_participants (
            id,
            first_name,
            last_name,
            birth_date,
            level_current_season,
            notes
          )
        `)
        .eq("instructor_id", instructorId)
        .eq("date", today)
        .order("time_start", { ascending: true });

      if (error) throw error;

      // Group by ticket to combine participants
      const lessonMap = new Map<string, PortalLesson>();

      (data || []).forEach((item: any) => {
        const key = `${item.ticket_id}-${item.time_start}-${item.time_end}`;
        
        if (!lessonMap.has(key)) {
          lessonMap.set(key, {
            id: item.id,
            ticketId: item.ticket_id,
            ticketNumber: item.tickets?.ticket_number || "",
            date: item.date,
            timeStart: item.time_start,
            timeEnd: item.time_end,
            productName: item.products?.name || "Buchung",
            productType: item.products?.type || "private",
            meetingPoint: item.meeting_point,
            status: item.status,
            instructorConfirmation: item.instructor_confirmation,
            instructorNotes: item.instructor_notes,
            internalNotes: item.internal_notes,
            customer: item.tickets?.customers ? {
              id: item.tickets.customers.id,
              firstName: item.tickets.customers.first_name,
              lastName: item.tickets.customers.last_name,
              phone: item.tickets.customers.phone,
              email: item.tickets.customers.email,
            } : null,
            participants: [],
          });
        }

        if (item.customer_participants) {
          const lesson = lessonMap.get(key)!;
          const participantExists = lesson.participants.some(
            (p) => p.id === item.customer_participants.id
          );
          if (!participantExists) {
            lesson.participants.push({
              id: item.customer_participants.id,
              firstName: item.customer_participants.first_name,
              lastName: item.customer_participants.last_name,
              birthDate: item.customer_participants.birth_date,
              level: item.customer_participants.level_current_season,
              notes: item.customer_participants.notes,
            });
          }
        }
      });

      return Array.from(lessonMap.values());
    },
    enabled: !!instructorId && !roleLoading,
  });

  // Fetch tomorrow's summary
  const tomorrowQuery = useQuery({
    queryKey: ["instructor-portal-tomorrow", instructorId],
    queryFn: async (): Promise<DaySummary> => {
      if (!instructorId) return { date: "", lessonCount: 0, totalHours: 0, participantCount: 0 };

      const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ticket_items")
        .select("id, time_start, time_end, participant_id")
        .eq("instructor_id", instructorId)
        .eq("date", tomorrow);

      if (error) throw error;

      let totalMinutes = 0;
      const participantIds = new Set<string>();

      (data || []).forEach((item) => {
        if (item.time_start && item.time_end) {
          const [startH, startM] = item.time_start.split(":").map(Number);
          const [endH, endM] = item.time_end.split(":").map(Number);
          totalMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        }
        if (item.participant_id) {
          participantIds.add(item.participant_id);
        }
      });

      return {
        date: tomorrow,
        lessonCount: data?.length || 0,
        totalHours: Math.round(totalMinutes / 60),
        participantCount: participantIds.size,
      };
    },
    enabled: !!instructorId && !roleLoading,
  });

  // Fetch week schedule
  const weekScheduleQuery = useQuery({
    queryKey: ["instructor-portal-week", instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const start = startOfWeek(new Date(), { weekStartsOn: 1 });
      const end = endOfWeek(new Date(), { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          products (name, type)
        `)
        .eq("instructor_id", instructorId)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .order("time_start", { ascending: true });

      if (error) throw error;

      return data || [];
    },
    enabled: !!instructorId && !roleLoading,
  });

  // Today's stats summary
  const todayStats = {
    lessonCount: todayLessonsQuery.data?.length || 0,
    totalHours: (todayLessonsQuery.data || []).reduce((acc, lesson) => {
      if (lesson.timeStart && lesson.timeEnd) {
        const [startH, startM] = lesson.timeStart.split(":").map(Number);
        const [endH, endM] = lesson.timeEnd.split(":").map(Number);
        return acc + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
      }
      return acc;
    }, 0),
    participantCount: (todayLessonsQuery.data || []).reduce(
      (acc, lesson) => acc + lesson.participants.length,
      0
    ),
  };

  return {
    instructorId,
    todayLessons: todayLessonsQuery.data || [],
    todayStats,
    tomorrow: tomorrowQuery.data,
    weekSchedule: weekScheduleQuery.data || [],
    isLoading: roleLoading || todayLessonsQuery.isLoading,
    error: todayLessonsQuery.error,
  };
}
