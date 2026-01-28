import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { differenceInYears, format, parseISO } from "date-fns";

export interface GroupParticipantAttendance {
  date: string;
  instanceId: string;
  enrollmentId: string;
  status: "registered" | "present" | "absent" | "cancelled";
}

export interface GroupParticipant {
  id: string;
  firstName: string;
  lastName: string | null;
  birthDate: string;
  age: number;
  currentSkiLevelId: string | null;
  currentSnowboardLevelId: string | null;
  notes: string | null;
  attendance: GroupParticipantAttendance[];
}

export interface GroupInstance {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface GroupLeaderData {
  courseId: string;
  courseName: string;
  discipline: string;
  skillLevelId: string | null;
  meetingPoint: string | null;
  periodStart: string;
  periodEnd: string;
  instances: GroupInstance[];
  participants: GroupParticipant[];
}

export function useGroupLeaderData(instanceId: string | undefined) {
  const { instructorId, loading: roleLoading } = useUserRole();

  return useQuery({
    queryKey: ["group-leader-data", instanceId, instructorId],
    queryFn: async (): Promise<GroupLeaderData | null> => {
      if (!instanceId || !instructorId) return null;

      // Step 1: Fetch the instance to get course details
      const { data: instance, error: instanceError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          course_id,
          date,
          start_time,
          end_time,
          instructor_id,
          group_courses (
            id,
            name,
            discipline,
            skill_level_id,
            meeting_point,
            period_start_date,
            period_end_date
          )
        `)
        .eq("id", instanceId)
        .maybeSingle();

      if (instanceError) throw instanceError;
      if (!instance) return null;

      // Verify instructor access
      if (instance.instructor_id !== instructorId) {
        throw new Error("Access denied: You are not assigned to this group");
      }

      const course = instance.group_courses as any;
      if (!course) return null;

      // Step 2: Fetch all instances for this course in the period
      const { data: allInstances, error: instancesError } = await supabase
        .from("group_course_instances")
        .select("id, date, start_time, end_time")
        .eq("course_id", course.id)
        .eq("instructor_id", instructorId)
        .gte("date", course.period_start_date)
        .lte("date", course.period_end_date)
        .order("date", { ascending: true });

      if (instancesError) throw instancesError;

      const instanceIds = (allInstances || []).map((i) => i.id);

      // Step 3: Fetch all enrollments for these instances with participant details
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("group_course_enrollments")
        .select(`
          id,
          instance_id,
          participant_id,
          attendance_status,
          notes,
          customer_participants (
            id,
            first_name,
            last_name,
            birth_date,
            current_ski_level_id,
            current_snowboard_level_id,
            notes
          )
        `)
        .in("instance_id", instanceIds);

      if (enrollmentsError) throw enrollmentsError;

      // Step 4: Aggregate by participant
      const participantMap = new Map<string, GroupParticipant>();

      (enrollments || []).forEach((enrollment: any) => {
        const participant = enrollment.customer_participants;
        if (!participant) return;

        const instanceInfo = allInstances?.find((i) => i.id === enrollment.instance_id);
        if (!instanceInfo) return;

        if (!participantMap.has(participant.id)) {
          const birthDate = participant.birth_date;
          const age = birthDate
            ? differenceInYears(new Date(), parseISO(birthDate))
            : 0;

          participantMap.set(participant.id, {
            id: participant.id,
            firstName: participant.first_name,
            lastName: participant.last_name,
            birthDate: birthDate,
            age,
            currentSkiLevelId: participant.current_ski_level_id,
            currentSnowboardLevelId: participant.current_snowboard_level_id,
            notes: participant.notes,
            attendance: [],
          });
        }

        const p = participantMap.get(participant.id)!;
        p.attendance.push({
          date: instanceInfo.date,
          instanceId: enrollment.instance_id,
          enrollmentId: enrollment.id,
          status: enrollment.attendance_status || "registered",
        });
      });

      // Sort participants by first name
      const participants = Array.from(participantMap.values()).sort((a, b) =>
        a.firstName.localeCompare(b.firstName)
      );

      return {
        courseId: course.id,
        courseName: course.name,
        discipline: course.discipline || "ski",
        skillLevelId: course.skill_level_id,
        meetingPoint: course.meeting_point,
        periodStart: course.period_start_date,
        periodEnd: course.period_end_date,
        instances: (allInstances || []).map((i) => ({
          id: i.id,
          date: i.date,
          startTime: i.start_time,
          endTime: i.end_time,
        })),
        participants,
      };
    },
    enabled: !!instanceId && !!instructorId && !roleLoading,
  });
}
