import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";

export interface LivePlanningParticipant {
  id: string;
  enrollmentId: string;
  firstName: string;
  lastName: string | null;
  birthDate: string;
  skillLevelName: string | null;
  hasPendingTransfer: boolean;
  pendingTransferTargetGroupId?: string;
}

export interface LivePlanningGroup {
  instanceId: string;
  courseId: string;
  courseName: string;
  instructorId: string | null;
  instructorName: string | null;
  startTime: string;
  endTime: string;
  meetingPoint: string | null;
  discipline: string;
  color: string | null;
  currentParticipants: number;
  maxParticipants: number;
  participants: LivePlanningParticipant[];
}

export function useLivePlanningData() {
  const { instructorId, loading: roleLoading } = useUserRole();
  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch instructor's own groups for today
  const myGroupsQuery = useQuery({
    queryKey: ["live-planning-my-groups", instructorId, today],
    queryFn: async (): Promise<LivePlanningGroup[]> => {
      if (!instructorId) return [];

      // Get instances where current user is instructor
      const { data: instances, error: instancesError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          course_id,
          start_time,
          end_time,
          instructor_id,
          current_participants,
          group_courses (
            id,
            name,
            discipline,
            color,
            meeting_point,
            max_participants
          ),
          instructors (
            id,
            first_name,
            last_name
          )
        `)
        .eq("date", today)
        .eq("instructor_id", instructorId)
        .eq("status", "scheduled");

      if (instancesError) throw instancesError;

      // Get enrollments and pending transfers for these instances
      const instanceIds = (instances || []).map((i) => i.id);
      
      if (instanceIds.length === 0) return [];

      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("group_course_enrollments")
        .select(`
          id,
          instance_id,
          participant_id,
          customer_participants (
            id,
            first_name,
            last_name,
            birth_date,
            current_ski_level_id,
            current_snowboard_level_id,
            skill_levels_ski:current_ski_level_id (name),
            skill_levels_snowboard:current_snowboard_level_id (name)
          )
        `)
        .in("instance_id", instanceIds);

      if (enrollmentsError) throw enrollmentsError;

      // Get pending transfer requests for these participants
      const participantIds = (enrollments || [])
        .map((e) => e.customer_participants?.id)
        .filter(Boolean) as string[];

      const { data: pendingTransfers, error: transfersError } = await supabase
        .from("participant_transfer_requests")
        .select("participant_id, target_group_id")
        .in("participant_id", participantIds)
        .eq("status", "pending");

      if (transfersError) throw transfersError;

      const pendingTransferMap = new Map(
        (pendingTransfers || []).map((t) => [t.participant_id, t.target_group_id])
      );

      // Map the data
      return (instances || []).map((instance: any) => {
        const course = instance.group_courses;
        const instructor = instance.instructors;
        const discipline = course?.discipline || "ski";

        const instanceEnrollments = (enrollments || []).filter(
          (e) => e.instance_id === instance.id
        );

        const participants: LivePlanningParticipant[] = instanceEnrollments.map((e: any) => {
          const p = e.customer_participants;
          const skillLevel = discipline === "ski"
            ? p?.skill_levels_ski?.name
            : p?.skill_levels_snowboard?.name;

          return {
            id: p?.id || "",
            enrollmentId: e.id,
            firstName: p?.first_name || "",
            lastName: p?.last_name || null,
            birthDate: p?.birth_date || "",
            skillLevelName: skillLevel || null,
            hasPendingTransfer: pendingTransferMap.has(p?.id),
            pendingTransferTargetGroupId: pendingTransferMap.get(p?.id),
          };
        });

        return {
          instanceId: instance.id,
          courseId: course?.id || "",
          courseName: course?.name || "Unbenannt",
          instructorId: instructor?.id || null,
          instructorName: instructor
            ? `${instructor.first_name} ${instructor.last_name}`
            : null,
          startTime: instance.start_time,
          endTime: instance.end_time,
          meetingPoint: course?.meeting_point || null,
          discipline,
          color: course?.color || null,
          currentParticipants: instance.current_participants || 0,
          maxParticipants: course?.max_participants || 12,
          participants,
        };
      });
    },
    enabled: !!instructorId && !roleLoading,
  });

  // Fetch other groups (potential transfer targets) for today
  const otherGroupsQuery = useQuery({
    queryKey: ["live-planning-other-groups", instructorId, today],
    queryFn: async (): Promise<LivePlanningGroup[]> => {
      if (!instructorId) return [];

      // Get all other instances for today (not led by current instructor)
      const { data: instances, error: instancesError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          course_id,
          start_time,
          end_time,
          instructor_id,
          current_participants,
          group_courses (
            id,
            name,
            discipline,
            color,
            meeting_point,
            max_participants
          ),
          instructors (
            id,
            first_name,
            last_name
          )
        `)
        .eq("date", today)
        .neq("instructor_id", instructorId)
        .not("instructor_id", "is", null)
        .eq("status", "scheduled");

      if (instancesError) throw instancesError;

      // Map the data (we don't need participants for target groups)
      return (instances || []).map((instance: any) => {
        const course = instance.group_courses;
        const instructor = instance.instructors;

        return {
          instanceId: instance.id,
          courseId: course?.id || "",
          courseName: course?.name || "Unbenannt",
          instructorId: instructor?.id || null,
          instructorName: instructor
            ? `${instructor.first_name} ${instructor.last_name}`
            : null,
          startTime: instance.start_time,
          endTime: instance.end_time,
          meetingPoint: course?.meeting_point || null,
          discipline: course?.discipline || "ski",
          color: course?.color || null,
          currentParticipants: instance.current_participants || 0,
          maxParticipants: course?.max_participants || 12,
          participants: [], // Not needed for target groups
        };
      });
    },
    enabled: !!instructorId && !roleLoading,
  });

  return {
    instructorId,
    myGroups: myGroupsQuery.data || [],
    otherGroups: otherGroupsQuery.data || [],
    isLoading: roleLoading || myGroupsQuery.isLoading || otherGroupsQuery.isLoading,
    refetch: () => {
      myGroupsQuery.refetch();
      otherGroupsQuery.refetch();
    },
  };
}
