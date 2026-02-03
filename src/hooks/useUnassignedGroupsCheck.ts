import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, addWeeks, getISOWeek } from 'date-fns';

export interface UnassignedGroupInfo {
  courseId: string;
  courseName: string;
  weekStart: string;
  weekNumber: number;
  unassignedDays: number;
}

export function useUnassignedGroupsCheck() {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const nextWeekStart = addWeeks(currentWeekStart, 1);
  
  return useQuery({
    queryKey: ['unassigned-groups-check'],
    queryFn: async (): Promise<UnassignedGroupInfo[]> => {
      const currentWeekStr = format(currentWeekStart, 'yyyy-MM-dd');
      const nextWeekEnd = format(endOfWeek(nextWeekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      // Get all instances for current and next week with null instructor
      const { data: unassigned, error } = await supabase
        .from('group_course_instances')
        .select(`
          id,
          date,
          course_id,
          course:course_id(id, name, is_active, course_type)
        `)
        .gte('date', currentWeekStr)
        .lte('date', nextWeekEnd)
        .is('instructor_id', null);
      
      if (error) throw error;
      
      // Group by course and week
      const grouped = new Map<string, UnassignedGroupInfo>();
      
      for (const inst of unassigned || []) {
        const course = inst.course as any;
        if (!course?.is_active || course.course_type !== 'weekly') continue;
        
        const instDate = new Date(inst.date);
        const instWeekStart = startOfWeek(instDate, { weekStartsOn: 1 });
        const weekStr = format(instWeekStart, 'yyyy-MM-dd');
        const key = `${inst.course_id}-${weekStr}`;
        
        if (grouped.has(key)) {
          grouped.get(key)!.unassignedDays++;
        } else {
          grouped.set(key, {
            courseId: inst.course_id,
            courseName: course.name,
            weekStart: weekStr,
            weekNumber: getISOWeek(instWeekStart),
            unassignedDays: 1,
          });
        }
      }
      
      return Array.from(grouped.values());
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
