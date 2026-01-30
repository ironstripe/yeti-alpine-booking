import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  notifyAllEnrollments,
  notifyCustomerEnrollment,
  notifyInstructorGroupCourse,
  getInstanceEnrollments,
  getInstructorDetails,
  detectInstanceChanges,
} from "@/lib/group-course-notifications";

interface InstanceUpdateParams {
  instanceId: string;
  changes: {
    date?: string;
    start_time?: string;
    end_time?: string;
    instructor_id?: string | null;
    status?: string;
    notes?: string;
  };
  notifyParticipants: boolean;
}

interface EnrollmentChangeParams {
  enrollmentId: string;
  instanceId: string;
  action: 'enroll' | 'unenroll';
  participantName: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
}

/**
 * Hook for updating group course instances with optional notifications
 */
export function useUpdateInstanceWithNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceId, changes, notifyParticipants }: InstanceUpdateParams) => {
      // Get original instance data first
      const { data: originalInstance, error: fetchError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          date,
          start_time,
          end_time,
          instructor_id,
          status,
          current_participants,
          course:group_courses(
            id,
            name,
            meeting_point,
            max_participants
          )
        `)
        .eq("id", instanceId)
        .single();

      // Fetch instructor separately if needed
      let instructorData: { id: string; first_name: string; last_name: string; email: string } | null = null;
      if (originalInstance?.instructor_id) {
        const { data: instructor } = await supabase
          .from("instructors")
          .select("id, first_name, last_name, email")
          .eq("id", originalInstance.instructor_id)
          .single();
        instructorData = instructor;
      }

      if (fetchError) throw fetchError;

      // Detect what changed
      const changeDetection = detectInstanceChanges(
        originalInstance,
        { ...originalInstance, ...changes }
      );

      // Update the instance
      const { error: updateError } = await supabase
        .from("group_course_instances")
        .update(changes)
        .eq("id", instanceId);

      if (updateError) throw updateError;

      // If we should notify and there are global changes
      if (notifyParticipants && changeDetection.isGlobalChange) {
        // Notify all enrolled customers
        const courseData = Array.isArray(originalInstance.course) 
          ? originalInstance.course[0] 
          : originalInstance.course;

        const result = await notifyAllEnrollments(
          instanceId,
          "customer.group_course.changed",
          {
            id: instanceId,
            date: changes.date || originalInstance.date,
            start_time: changes.start_time || originalInstance.start_time,
            end_time: changes.end_time || originalInstance.end_time,
            instructor_id: changes.instructor_id !== undefined 
              ? changes.instructor_id 
              : originalInstance.instructor_id,
            course: {
              id: courseData?.id || '',
              name: courseData?.name || 'Gruppenkurs',
              meeting_point: courseData?.meeting_point || null,
              max_participants: courseData?.max_participants || 8,
            },
            instructor: instructorData ? {
              id: instructorData.id,
              first_name: instructorData.first_name,
              last_name: instructorData.last_name,
              email: instructorData.email || '',
            } : null,
            current_participants: originalInstance.current_participants || 0,
          },
          {
            old: {
              date: originalInstance.date,
              start_time: originalInstance.start_time,
              end_time: originalInstance.end_time,
            },
            new: {
              date: changes.date || originalInstance.date,
              start_time: changes.start_time || originalInstance.start_time,
              end_time: changes.end_time || originalInstance.end_time,
            },
          }
        );

        // Notify instructor(s)
        if (changeDetection.hasInstructorChange) {
          // Notify old instructor about cancellation
          if (changeDetection.oldInstructorId) {
            await notifyInstructorGroupCourse(
              changeDetection.oldInstructorId,
              "instructor.group_course.changed",
              {
                course_name: courseData?.name || 'Gruppenkurs',
                course_date: originalInstance.date,
                course_time: `${originalInstance.start_time.slice(0, 5)} - ${originalInstance.end_time.slice(0, 5)}`,
                participant_count: originalInstance.current_participants || 0,
                max_participants: courseData?.max_participants || 8,
                meeting_point: courseData?.meeting_point || undefined,
              }
            );
          }
          // Notify new instructor about assignment
          if (changeDetection.newInstructorId) {
            await notifyInstructorGroupCourse(
              changeDetection.newInstructorId,
              "instructor.group_course.changed",
              {
                course_name: courseData?.name || 'Gruppenkurs',
                course_date: changes.date || originalInstance.date,
                course_time: `${(changes.start_time || originalInstance.start_time).slice(0, 5)} - ${(changes.end_time || originalInstance.end_time).slice(0, 5)}`,
                participant_count: originalInstance.current_participants || 0,
                max_participants: courseData?.max_participants || 8,
                meeting_point: courseData?.meeting_point || undefined,
              }
            );
          }
        } else if (originalInstance.instructor_id) {
          // Notify same instructor about changes
          await notifyInstructorGroupCourse(
            originalInstance.instructor_id,
            "instructor.group_course.changed",
            {
              course_name: courseData?.name || 'Gruppenkurs',
              course_date: changes.date || originalInstance.date,
              course_time: `${(changes.start_time || originalInstance.start_time).slice(0, 5)} - ${(changes.end_time || originalInstance.end_time).slice(0, 5)}`,
              old_date: originalInstance.date,
              old_time: `${originalInstance.start_time.slice(0, 5)} - ${originalInstance.end_time.slice(0, 5)}`,
              new_date: changes.date || originalInstance.date,
              new_time: `${(changes.start_time || originalInstance.start_time).slice(0, 5)} - ${(changes.end_time || originalInstance.end_time).slice(0, 5)}`,
              participant_count: originalInstance.current_participants || 0,
              max_participants: courseData?.max_participants || 8,
              meeting_point: courseData?.meeting_point || undefined,
            }
          );
        }

        return { 
          updated: true, 
          notified: result.notified,
          errors: result.errors 
        };
      }

      return { updated: true, notified: 0, errors: [] };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group-course-instances"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-data"] });

      if (result.notified > 0) {
        toast.success(`Instanz aktualisiert`, {
          description: `${result.notified} Teilnehmer wurden informiert.`,
        });
      } else {
        toast.success("Instanz aktualisiert");
      }

      if (result.errors.length > 0) {
        console.error("Notification errors:", result.errors);
        toast.warning(`${result.errors.length} Benachrichtigung(en) fehlgeschlagen`);
      }
    },
    onError: (error) => {
      console.error("Failed to update instance:", error);
      toast.error("Fehler beim Aktualisieren", {
        description: "Die Instanz konnte nicht aktualisiert werden.",
      });
    },
  });
}

/**
 * Hook for cancelling a group course instance with notifications
 */
export function useCancelInstanceWithNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      cancellationReason,
      notifyParticipants 
    }: { 
      instanceId: string; 
      cancellationReason: string;
      notifyParticipants: boolean;
    }) => {
      // Get instance data
      const { data: instance, error: fetchError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          date,
          start_time,
          end_time,
          instructor_id,
          current_participants,
          course:group_courses(
            id,
            name,
            meeting_point,
            max_participants
          )
        `)
        .eq("id", instanceId)
        .single();

      if (fetchError) throw fetchError;

      // Fetch instructor separately if needed
      let instructorData: { id: string; first_name: string; last_name: string; email: string } | null = null;
      if (instance?.instructor_id) {
        const { data: instructor } = await supabase
          .from("instructors")
          .select("id, first_name, last_name, email")
          .eq("id", instance.instructor_id)
          .single();
        instructorData = instructor;
      }

      // Update status to cancelled
      const { error: updateError } = await supabase
        .from("group_course_instances")
        .update({ status: 'cancelled', notes: cancellationReason })
        .eq("id", instanceId);

      if (updateError) throw updateError;

      let notifiedCount = 0;

      if (notifyParticipants) {
        const courseData = Array.isArray(instance.course) 
          ? instance.course[0] 
          : instance.course;

        const result = await notifyAllEnrollments(
          instanceId,
          "customer.group_course.cancelled",
          {
            id: instanceId,
            date: instance.date,
            start_time: instance.start_time,
            end_time: instance.end_time,
            instructor_id: instance.instructor_id,
            course: {
              id: courseData?.id || '',
              name: courseData?.name || 'Gruppenkurs',
              meeting_point: courseData?.meeting_point || null,
              max_participants: courseData?.max_participants || 8,
            },
            instructor: instructorData ? {
              id: instructorData.id,
              first_name: instructorData.first_name,
              last_name: instructorData.last_name,
              email: instructorData.email || '',
            } : null,
            current_participants: instance.current_participants || 0,
          },
          undefined,
          cancellationReason
        );

        notifiedCount = result.notified;

        // Notify instructor
        if (instance.instructor_id) {
          await notifyInstructorGroupCourse(
            instance.instructor_id,
            "instructor.group_course.changed",
            {
              course_name: courseData?.name || 'Gruppenkurs',
              course_date: instance.date,
              course_time: `${instance.start_time.slice(0, 5)} - ${instance.end_time.slice(0, 5)}`,
              participant_count: instance.current_participants || 0,
              max_participants: courseData?.max_participants || 8,
            }
          );
        }
      }

      return { cancelled: true, notified: notifiedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["group-course-instances"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-data"] });

      if (result.notified > 0) {
        toast.success(`Kurs abgesagt`, {
          description: `${result.notified} Teilnehmer wurden informiert.`,
        });
      } else {
        toast.success("Kurs abgesagt");
      }
    },
    onError: (error) => {
      console.error("Failed to cancel instance:", error);
      toast.error("Fehler beim Absagen");
    },
  });
}

/**
 * Hook to get enrollment count for an instance
 */
export function useInstanceEnrollmentCount(instanceId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!instanceId) return 0;
      
      const enrollments = await getInstanceEnrollments(instanceId);
      return enrollments.length;
    },
  });
}

/**
 * Hook for enrollment changes (individual notifications)
 */
export function useEnrollmentNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: EnrollmentChangeParams) => {
      // Get instance data for the notification
      const { data: instance, error: fetchError } = await supabase
        .from("group_course_instances")
        .select(`
          id,
          date,
          start_time,
          end_time,
          instructor_id,
          current_participants,
          course:group_courses(
            id,
            name,
            meeting_point,
            max_participants
          )
        `)
        .eq("id", params.instanceId)
        .single();

      if (fetchError) throw fetchError;

      const courseData = Array.isArray(instance.course) 
        ? instance.course[0] 
        : instance.course;
      
      // Fetch instructor separately if needed
      let instructorName = 'Noch nicht zugewiesen';
      if (instance?.instructor_id) {
        const { data: instructor } = await supabase
          .from("instructors")
          .select("id, first_name, last_name")
          .eq("id", instance.instructor_id)
          .single();
        if (instructor) {
          instructorName = `${instructor.first_name} ${instructor.last_name}`;
        }
      }

      // Notify the customer (only the affected one!)
      const customerResult = await notifyCustomerEnrollment(
        params.customerEmail,
        params.customerName,
        params.action === 'enroll' 
          ? "customer.group_course.enrolled" 
          : "customer.group_course.unenrolled",
        {
          participant_name: params.participantName,
          course_name: courseData?.name || 'Gruppenkurs',
          course_date: instance.date,
          course_time: `${instance.start_time.slice(0, 5)} - ${instance.end_time.slice(0, 5)}`,
          instructor_name: instructorName,
          meeting_point: courseData?.meeting_point || undefined,
        }
      );

      // Notify instructor about participant count change
      if (instance.instructor_id) {
        const newCount = params.action === 'enroll' 
          ? (instance.current_participants || 0) + 1
          : Math.max(0, (instance.current_participants || 0) - 1);

        await notifyInstructorGroupCourse(
          instance.instructor_id,
          "instructor.group_course.enrollment_changed",
          {
            course_name: courseData?.name || 'Gruppenkurs',
            course_date: instance.date,
            course_time: `${instance.start_time.slice(0, 5)} - ${instance.end_time.slice(0, 5)}`,
            participant_count: newCount,
            max_participants: courseData?.max_participants || 8,
            change_type: params.action === 'enroll' ? 'Anmeldung' : 'Abmeldung',
            participant_name: params.participantName,
          }
        );
      }

      return { success: customerResult.success, error: customerResult.error };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group-course-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["group-course-instances"] });

      const action = variables.action === 'enroll' ? 'Anmeldung' : 'Abmeldung';
      toast.success(`${action} bestätigt`, {
        description: `${variables.participantName} wurde benachrichtigt.`,
      });
    },
    onError: (error) => {
      console.error("Failed to send enrollment notification:", error);
      toast.error("Benachrichtigung fehlgeschlagen");
    },
  });
}
