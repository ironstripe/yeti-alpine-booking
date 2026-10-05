import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildBookableGroupCourses, type GroupCourseFact } from "@/lib/groupCoursePlan";

export function useBookableGroupCourses(selectedDates: string[], sport: "ski" | "snowboard" | null) {
  return useQuery({
    queryKey: ["bookable-group-courses", selectedDates, sport],
    enabled: selectedDates.length > 0 && !!sport,
    queryFn: async () => {
      const [{ data, error }, { data: sources, error: sourceError }] = await Promise.all([
        supabase.from("group_courses").select(`
          id, name, discipline, is_active, is_internal, course_type, period_start_date, period_end_date,
          meeting_point, max_participants, sort_order,
          product:product_id(id, name, type, is_active, season_id, season:season_id(id, name, start_date, end_date)),
          schedules:group_course_schedules(day_of_week, start_time, end_time, is_active),
          course_dates:training_course_dates(date, is_cancelled)
        `),
        supabase.from("bc_product_tariff_sources").select("product_id"),
      ]);
      if (error || sourceError) throw error || sourceError;
      return buildBookableGroupCourses(
        (data ?? []) as unknown as GroupCourseFact[],
        selectedDates,
        sport,
        new Set((sources ?? []).map((source) => source.product_id)),
      );
    },
  });
}