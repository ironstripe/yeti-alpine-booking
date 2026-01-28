import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export interface GroupPlanningInstance {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  instructorId: string | null;
  instructorName: string | null;
  assistantId: string | null;
  assistantName: string | null;
  currentParticipants: number;
}

export interface GroupPlanningCourse {
  id: string;
  name: string;
  color: string;
  skillLevelId: string;
  skillLevelName: string;
  discipline: 'ski' | 'snowboard' | 'both';
  maxParticipants: number;
  meetingPoint: string | null;
  schedules: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
  instances: GroupPlanningInstance[];
  // Computed: primary instructor for the week (if all same)
  weeklyInstructorId: string | null;
  weeklyAssistantId: string | null;
  // Assignment status
  isFullyAssigned: boolean;
  totalInstances: number;
  assignedInstances: number;
  totalParticipants: number;
}

export interface GroupPlanningStats {
  totalCourses: number;
  fullyAssigned: number;
  partiallyAssigned: number;
  unassigned: number;
  totalParticipants: number;
}

export interface UseGroupPlanningDataReturn {
  courses: GroupPlanningCourse[];
  isLoading: boolean;
  hasInstances: boolean;
  stats: GroupPlanningStats;
}

export function useGroupPlanningData(weekStart: Date): UseGroupPlanningDataReturn {
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['group-planning', weekStartStr],
    queryFn: async () => {
      // Fetch active weekly courses with skill level
      const { data: courses, error: coursesError } = await supabase
        .from('group_courses')
        .select(`
          id,
          name,
          color,
          skill_level_id,
          discipline,
          max_participants,
          meeting_point,
          linked_skill_level:skill_level_id(id, name)
        `)
        .eq('is_active', true)
        .eq('course_type', 'weekly')
        .order('name');

      if (coursesError) throw coursesError;
      if (!courses || courses.length === 0) {
        return { courses: [], instances: [], schedules: [] };
      }

      const courseIds = courses.map(c => c.id);

      // Fetch schedules for all courses
      const { data: schedules, error: schedulesError } = await supabase
        .from('group_course_schedules')
        .select('id, course_id, day_of_week, start_time, end_time')
        .in('course_id', courseIds)
        .eq('is_active', true);

      if (schedulesError) throw schedulesError;

      // Fetch instances for the week with instructor joins
      const { data: instances, error: instancesError } = await supabase
        .from('group_course_instances')
        .select(`
          id,
          course_id,
          date,
          start_time,
          end_time,
          instructor_id,
          assistant_instructor_id,
          current_participants,
          instructor:instructor_id(id, first_name, last_name),
          assistant_instructor:assistant_instructor_id(id, first_name, last_name)
        `)
        .in('course_id', courseIds)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
        .order('date')
        .order('start_time');

      if (instancesError) throw instancesError;

      return { courses, instances: instances || [], schedules: schedules || [] };
    },
  });

  // Transform data into planning-friendly structure
  const courses: GroupPlanningCourse[] = (data?.courses || []).map(course => {
    const courseSchedules = (data?.schedules || [])
      .filter(s => s.course_id === course.id)
      .map(s => ({
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
      }));

    const courseInstances: GroupPlanningInstance[] = (data?.instances || [])
      .filter(i => i.course_id === course.id)
      .map(i => ({
        id: i.id,
        date: i.date,
        startTime: i.start_time,
        endTime: i.end_time,
        instructorId: i.instructor_id,
        instructorName: i.instructor 
          ? `${(i.instructor as any).first_name} ${(i.instructor as any).last_name}`
          : null,
        assistantId: i.assistant_instructor_id,
        assistantName: i.assistant_instructor
          ? `${(i.assistant_instructor as any).first_name} ${(i.assistant_instructor as any).last_name}`
          : null,
        currentParticipants: i.current_participants || 0,
      }));

    // Calculate weekly instructor (if all instances have the same one)
    const assignedInstances = courseInstances.filter(i => i.instructorId);
    const uniqueInstructors = new Set(courseInstances.map(i => i.instructorId).filter(Boolean));
    const uniqueAssistants = new Set(courseInstances.map(i => i.assistantId).filter(Boolean));
    
    const weeklyInstructorId = uniqueInstructors.size === 1 && assignedInstances.length === courseInstances.length
      ? assignedInstances[0]?.instructorId || null
      : null;
    
    const weeklyAssistantId = uniqueAssistants.size === 1 
      ? courseInstances.find(i => i.assistantId)?.assistantId || null
      : null;

    const totalInstances = courseInstances.length;
    const assignedCount = assignedInstances.length;
    const isFullyAssigned = totalInstances > 0 && assignedCount === totalInstances;

    const totalParticipants = courseInstances.reduce((sum, i) => sum + i.currentParticipants, 0);

    const linkedLevel = course.linked_skill_level as { id: string; name: string } | null;

    return {
      id: course.id,
      name: course.name,
      color: course.color || '#3B82F6',
      skillLevelId: course.skill_level_id,
      skillLevelName: linkedLevel?.name || 'Unbekannt',
      discipline: course.discipline as 'ski' | 'snowboard' | 'both',
      maxParticipants: course.max_participants,
      meetingPoint: course.meeting_point,
      schedules: courseSchedules,
      instances: courseInstances,
      weeklyInstructorId,
      weeklyAssistantId,
      isFullyAssigned,
      totalInstances,
      assignedInstances: assignedCount,
      totalParticipants,
    };
  });

  // Calculate stats
  const stats: GroupPlanningStats = {
    totalCourses: courses.length,
    fullyAssigned: courses.filter(c => c.isFullyAssigned).length,
    partiallyAssigned: courses.filter(c => !c.isFullyAssigned && c.assignedInstances > 0).length,
    unassigned: courses.filter(c => c.assignedInstances === 0 && c.totalInstances > 0).length,
    totalParticipants: courses.reduce((sum, c) => sum + c.totalParticipants, 0),
  };

  const hasInstances = courses.some(c => c.totalInstances > 0);

  return {
    courses,
    isLoading,
    hasInstances,
    stats,
  };
}
