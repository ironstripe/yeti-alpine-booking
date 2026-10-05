import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildBookableGroupCourses,
  serverOptionToBookable,
  type BookableGroupOption,
  type GroupCourseFact,
  type ServerCapability,
} from "@/lib/groupCoursePlan";
import { fetchStaffGroupOptions } from "@/lib/staffGroupBookingApi";

export interface BookableGroupCoursesResult {
  courses: BookableGroupOption[];
  /** Only relevant for dates from 2026-12-01 (Winter 26/27 server path). */
  server?: ServerCapability;
}

/**
 * Legacy catalog courses (browser save path) plus 26/27 options from the staff server
 * (exact instances + exact source quote). A missing/broken server never hides legacy courses.
 */
export function useBookableGroupCourses(selectedDates: string[], sport: "ski" | "snowboard" | null) {
  const query = useQuery({
    queryKey: ["bookable-group-courses", selectedDates, sport],
    enabled: selectedDates.length > 0 && !!sport,
    queryFn: async (): Promise<BookableGroupCoursesResult> => {
      const needsServer = selectedDates.some((d) => d >= "2026-12-01") && !!sport;
      const [{ data, error }, { data: sources, error: sourceError }, server] = await Promise.all([
        supabase.from("group_courses").select(`
          id, name, discipline, is_active, is_internal, course_type, period_start_date, period_end_date,
          meeting_point, max_participants, sort_order,
          product:product_id(id, name, type, is_active, season_id, season:season_id(id, name, start_date, end_date)),
          schedules:group_course_schedules(day_of_week, start_time, end_time, is_active),
          course_dates:training_course_dates(date, is_cancelled)
        `).is("archived_at" as never, null),
        supabase.from("bc_product_tariff_sources").select("product_id"),
        needsServer ? fetchStaffGroupOptions([...selectedDates].sort(), sport!) : Promise.resolve(null),
      ]);
      if (error || sourceError) throw error || sourceError;
      const legacy = buildBookableGroupCourses(
        (data ?? []) as unknown as GroupCourseFact[],
        selectedDates,
        sport,
        new Set((sources ?? []).map((source) => source.product_id)),
      );
      const serverCourses = server?.status === "installed" ? server.options.map(serverOptionToBookable) : [];
      return { courses: [...legacy, ...serverCourses], server: server?.status };
    },
  });
  return { ...query, data: query.data?.courses, server: query.data?.server };
}
