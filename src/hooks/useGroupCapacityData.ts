import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format, addDays } from "date-fns";

export interface GroupParticipant {
  id: string; // enrollment id
  participantId: string;
  firstName: string;
  lastName: string | null;
  birthDate: string;
  age: number;
  instanceId: string;
}

export interface GroupCapacityInfo {
  id: string; // training_groups.id
  courseId: string;
  courseName: string;
  courseColor: string;
  groupNumber: number;
  customName: string | null;
  weekStart: string;
  
  participantCount: number;
  minParticipants: number;
  maxParticipants: number;
  
  instructorId: string | null;
  instructorName: string | null;
  allInstructorNames: string[];
  assistantId: string | null;
  assistantName: string | null;
  
  status: 'active' | 'merged' | 'cancelled';
  capacityStatus: 'ok' | 'overbooked' | 'underbooked';
  
  participants: GroupParticipant[];
}

export interface CapacityStats {
  totalGroups: number;
  totalParticipants: number;
  overbookedCount: number;
  underbookedCount: number;
  okCount: number;
}

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function useGroupCapacityData(weekStart: Date) {
  const weekStartStr = format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEndStr = format(addDays(startOfWeek(weekStart, { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['group-capacity-data', weekStartStr],
    queryFn: async (): Promise<{ groups: GroupCapacityInfo[]; stats: CapacityStats }> => {
      // Fetch training groups for this week
      const { data: trainingGroups, error: groupsError } = await supabase
        .from('training_groups')
        .select(`
          id,
          course_id,
          week_start,
          group_number,
          custom_name,
          instructor_id,
          assistant_instructor_id,
          status,
          group_courses (
            id,
            name,
            color,
            min_participants,
            max_participants
          ),
          instructor:instructors!training_groups_instructor_id_fkey (
            id,
            first_name,
            last_name
          ),
          assistant:instructors!training_groups_assistant_instructor_id_fkey (
            id,
            first_name,
            last_name
          )
        `)
        .eq('week_start', weekStartStr)
        .neq('status', 'cancelled');

      if (groupsError) throw groupsError;

      // If no training groups exist yet, try to get courses with instances this week
      if (!trainingGroups || trainingGroups.length === 0) {
        // Get courses that have instances this week (regardless of enrollments)
        const { data: courses, error: coursesError } = await supabase
          .from('group_courses')
          .select(`
            id,
            name,
            color,
            min_participants,
            max_participants,
            group_course_instances!inner (
              id,
              date,
              instructor_id,
              group_course_enrollments (
                id,
                participant_id,
                customer_participants (
                  id,
                  first_name,
                  last_name,
                  birth_date
                )
              )
            )
          `)
          .eq('course_type', 'weekly')
          .eq('is_active', true)
          .gte('group_course_instances.date', weekStartStr)
          .lte('group_course_instances.date', weekEndStr);

        if (coursesError) throw coursesError;

        // Get instructor IDs from instances for name lookup
        const instructorIds = new Set<string>();
        (courses || []).forEach(course => {
          course.group_course_instances?.forEach((inst: any) => {
            if (inst.instructor_id) instructorIds.add(inst.instructor_id);
          });
        });

        // Fetch instructor names if any
        let instructorMap = new Map<string, string>();
        if (instructorIds.size > 0) {
          const { data: instructors } = await supabase
            .from('instructors')
            .select('id, first_name, last_name')
            .in('id', Array.from(instructorIds));
          
          instructors?.forEach(i => {
            instructorMap.set(i.id, `${i.first_name} ${i.last_name}`);
          });
        }

        // Transform to capacity info without training_groups
        const groups: GroupCapacityInfo[] = (courses || []).map(course => {
          const allEnrollments = course.group_course_instances?.flatMap(
            (inst: any) => inst.group_course_enrollments || []
          ) || [];
          
          // Collect all unique instructor IDs from this week's instances
          const weekInstructorIds = new Set<string>();
          const instructorFrequency: Record<string, number> = {};
          course.group_course_instances?.forEach((inst: any) => {
            if (inst.instructor_id) {
              weekInstructorIds.add(inst.instructor_id);
              instructorFrequency[inst.instructor_id] = (instructorFrequency[inst.instructor_id] || 0) + 1;
            }
          });
          const primaryInstructorId = Object.entries(instructorFrequency)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || null;
          
          const allInstructorNames = Array.from(weekInstructorIds)
            .map(id => instructorMap.get(id))
            .filter(Boolean) as string[];
          
          // Deduplicate by participant_id
          const uniqueParticipants = new Map<string, GroupParticipant>();
          allEnrollments.forEach((enrollment: any) => {
            if (enrollment.participant_id && enrollment.customer_participants && !uniqueParticipants.has(enrollment.participant_id)) {
              const p = enrollment.customer_participants;
              uniqueParticipants.set(enrollment.participant_id, {
                id: enrollment.id,
                participantId: enrollment.participant_id,
                firstName: p.first_name,
                lastName: p.last_name,
                birthDate: p.birth_date,
                age: calculateAge(p.birth_date),
                instanceId: enrollment.instance_id,
              });
            }
          });

          const participants = Array.from(uniqueParticipants.values());
          const participantCount = participants.length;
          const minParticipants = course.min_participants || 4;
          const maxParticipants = course.max_participants;

          // Determine capacity status - empty groups are underbooked
          let capacityStatus: 'ok' | 'overbooked' | 'underbooked' = 'ok';
          if (participantCount > maxParticipants) {
            capacityStatus = 'overbooked';
          } else if (participantCount < minParticipants) {
            capacityStatus = 'underbooked';
          }

          return {
            id: '', // No training_group yet
            courseId: course.id,
            courseName: course.name,
            courseColor: course.color || '#3B82F6',
            groupNumber: 1,
            customName: null,
            weekStart: weekStartStr,
            participantCount,
            minParticipants,
            maxParticipants,
            instructorId: primaryInstructorId,
            instructorName: primaryInstructorId ? instructorMap.get(primaryInstructorId) || null : null,
            allInstructorNames,
            assistantId: null,
            assistantName: null,
            status: 'active' as const,
            capacityStatus,
            participants,
          };
        }); // Show all courses with instances, even without enrollments

        const stats: CapacityStats = {
          totalGroups: groups.length,
          totalParticipants: groups.reduce((sum, g) => sum + g.participantCount, 0),
          overbookedCount: groups.filter(g => g.capacityStatus === 'overbooked').length,
          underbookedCount: groups.filter(g => g.capacityStatus === 'underbooked').length,
          okCount: groups.filter(g => g.capacityStatus === 'ok').length,
        };

        return { groups, stats };
      }

      // Get enrollments for each training group
      const groupIds = trainingGroups.map(g => g.id);
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('group_course_enrollments')
        .select(`
          id,
          training_group_id,
          participant_id,
          instance_id,
          customer_participants (
            id,
            first_name,
            last_name,
            birth_date
          )
        `)
        .in('training_group_id', groupIds);

      if (enrollmentsError) throw enrollmentsError;

      // Group enrollments by training_group_id
      const enrollmentsByGroup = new Map<string, GroupParticipant[]>();
      (enrollments || []).forEach((enrollment: any) => {
        if (!enrollment.training_group_id || !enrollment.customer_participants) return;
        
        const p = enrollment.customer_participants;
        const participant: GroupParticipant = {
          id: enrollment.id,
          participantId: enrollment.participant_id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          age: calculateAge(p.birth_date),
          instanceId: enrollment.instance_id,
        };

        if (!enrollmentsByGroup.has(enrollment.training_group_id)) {
          enrollmentsByGroup.set(enrollment.training_group_id, []);
        }
        enrollmentsByGroup.get(enrollment.training_group_id)!.push(participant);
      });

      // Transform to capacity info
      const groups: GroupCapacityInfo[] = trainingGroups.map((tg: any) => {
        const course = tg.group_courses;
        const participants = enrollmentsByGroup.get(tg.id) || [];
        const participantCount = participants.length;
        const minParticipants = course?.min_participants || 4;
        const maxParticipants = course?.max_participants || 12;

        let capacityStatus: 'ok' | 'overbooked' | 'underbooked' = 'ok';
        if (participantCount > maxParticipants) {
          capacityStatus = 'overbooked';
        } else if (participantCount < minParticipants && participantCount > 0) {
          capacityStatus = 'underbooked';
        }

        const instructor = tg.instructor;
        const assistant = tg.assistant;

        return {
          id: tg.id,
          courseId: course?.id || '',
          courseName: course?.name || 'Unbekannt',
          courseColor: course?.color || '#3B82F6',
          groupNumber: tg.group_number,
          customName: tg.custom_name,
          weekStart: tg.week_start,
          participantCount,
          minParticipants,
          maxParticipants,
          instructorId: tg.instructor_id,
          instructorName: instructor ? `${instructor.first_name} ${instructor.last_name}` : null,
          allInstructorNames: instructor ? [`${instructor.first_name} ${instructor.last_name}`] : [],
          assistantId: tg.assistant_instructor_id,
          assistantName: assistant ? `${assistant.first_name} ${assistant.last_name}` : null,
          status: tg.status as 'active' | 'merged' | 'cancelled',
          capacityStatus,
          participants,
        };
      });

      const stats: CapacityStats = {
        totalGroups: groups.length,
        totalParticipants: groups.reduce((sum, g) => sum + g.participantCount, 0),
        overbookedCount: groups.filter(g => g.capacityStatus === 'overbooked').length,
        underbookedCount: groups.filter(g => g.capacityStatus === 'underbooked').length,
        okCount: groups.filter(g => g.capacityStatus === 'ok').length,
      };

      return { groups, stats };
    },
    staleTime: 30000,
  });
}

export function useGenerateTrainingGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (weekStart: Date) => {
      const weekStartStr = format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .rpc('generate_training_groups_for_week', { p_week_start: weekStartStr });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, weekStart) => {
      const weekStartStr = format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      queryClient.invalidateQueries({ queryKey: ['group-capacity-data', weekStartStr] });
    },
  });
}

export function useSplitGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sourceGroupId: string;
      newGroups: Array<{
        group_number: number;
        custom_name: string | null;
        instructor_id: string | null;
        participant_ids: string[];
      }>;
    }) => {
      const { data, error } = await supabase
        .rpc('split_training_group', {
          p_source_group_id: params.sourceGroupId,
          p_new_groups: params.newGroups,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-capacity-data'] });
    },
  });
}

export function useMergeGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sourceGroupIds: string[];
      targetGroupId: string;
      newGroupName?: string;
      instructorId?: string;
    }) => {
      const { data, error } = await supabase
        .rpc('merge_training_groups', {
          p_source_group_ids: params.sourceGroupIds,
          p_target_group_id: params.targetGroupId,
          p_new_group_name: params.newGroupName || null,
          p_instructor_id: params.instructorId || null,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-capacity-data'] });
    },
  });
}

export function useMoveParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      enrollmentId: string;
      targetGroupId: string;
    }) => {
      const { data, error } = await supabase
        .rpc('move_participant_to_group', {
          p_enrollment_id: params.enrollmentId,
          p_target_group_id: params.targetGroupId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-capacity-data'] });
    },
  });
}

export function useAssignAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      groupId: string;
      assistantInstructorId: string | null;
    }) => {
      const { error } = await supabase
        .from('training_groups')
        .update({ assistant_instructor_id: params.assistantInstructorId })
        .eq('id', params.groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-capacity-data'] });
    },
  });
}
