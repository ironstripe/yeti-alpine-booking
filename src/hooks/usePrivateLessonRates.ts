import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TimeSlotRate, HighSeasonPeriod } from "@/lib/pricing/private-lesson-pricing";

/**
 * Fetch private lesson time-slot rates from database
 */
export function usePrivateLessonRates() {
  return useQuery({
    queryKey: ['private-lesson-rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('private_lesson_rates')
        .select('*')
        .order('start_time');
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
        rate_per_hour: Number(row.rate_per_hour),
        is_peak: row.is_peak,
        additional_person_rate: row.additional_person_rate ? Number(row.additional_person_rate) : 20,
      })) as TimeSlotRate[];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Fetch high season periods from database
 */
export function useHighSeasonPeriods() {
  return useQuery({
    queryKey: ['high-season-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('high_season_periods')
        .select('*')
        .order('start_date');
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        id: row.id,
        name: row.name,
        start_date: row.start_date,
        end_date: row.end_date,
      })) as HighSeasonPeriod[];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
