import { supabase } from "@/integrations/supabase/client";

export type GroupCourseChangeType = 
  | "customer.group_course.changed"
  | "customer.group_course.cancelled"
  | "customer.group_course.enrolled"
  | "customer.group_course.unenrolled"
  | "instructor.group_course.changed"
  | "instructor.group_course.enrollment_changed";

interface InstanceData {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  instructor_id: string | null;
  course: {
    id: string;
    name: string;
    meeting_point: string | null;
    max_participants: number;
  };
  instructor?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  current_participants: number;
}

interface EnrollmentWithDetails {
  id: string;
  participant: {
    id: string;
    first_name: string;
    last_name: string | null;
  } | null;
  ticket_item: {
    ticket: {
      customer: {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string;
      };
    };
  } | null;
}

interface InstanceChangeData {
  old: Partial<InstanceData>;
  new: Partial<InstanceData>;
}

/**
 * Fetches all enrollments for a given group course instance with customer details
 */
export async function getInstanceEnrollments(instanceId: string): Promise<EnrollmentWithDetails[]> {
  const { data, error } = await supabase
    .from("group_course_enrollments")
    .select(`
      id,
      participant:customer_participants(
        id,
        first_name,
        last_name
      ),
      ticket_item:ticket_items(
        ticket:tickets(
          customer:customers(
            id,
            email,
            first_name,
            last_name
          )
        )
      )
    `)
    .eq("instance_id", instanceId);

  if (error) {
    console.error("Failed to fetch enrollments:", error);
    return [];
  }

  return (data || []) as unknown as EnrollmentWithDetails[];
}

/**
 * Fetches instructor details by ID
 */
export async function getInstructorDetails(instructorId: string) {
  const { data, error } = await supabase
    .from("instructors")
    .select("id, first_name, last_name, email")
    .eq("id", instructorId)
    .single();

  if (error) {
    console.error("Failed to fetch instructor:", error);
    return null;
  }

  return data;
}

/**
 * Format date for display (German format)
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format time range for display
 */
function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

/**
 * Notify all customers with enrollments in a group course instance
 * Used for global changes (date, time, instructor, meeting point)
 */
export async function notifyAllEnrollments(
  instanceId: string,
  changeType: "customer.group_course.changed" | "customer.group_course.cancelled",
  instanceData: InstanceData,
  changeData?: InstanceChangeData,
  cancellationReason?: string
): Promise<{ success: boolean; notified: number; errors: string[] }> {
  const enrollments = await getInstanceEnrollments(instanceId);
  const errors: string[] = [];
  let notified = 0;

  // Get instructor name
  let instructorName = "Nicht zugewiesen";
  if (instanceData.instructor) {
    instructorName = `${instanceData.instructor.first_name} ${instanceData.instructor.last_name}`;
  } else if (instanceData.instructor_id) {
    const instructor = await getInstructorDetails(instanceData.instructor_id);
    if (instructor) {
      instructorName = `${instructor.first_name} ${instructor.last_name}`;
    }
  }

  // Group enrollments by customer to avoid duplicate emails
  const customerEnrollments = new Map<string, { customer: EnrollmentWithDetails['ticket_item'], participants: string[] }>();

  for (const enrollment of enrollments) {
    const customer = enrollment.ticket_item?.ticket?.customer;
    if (!customer) continue;

    const participantName = enrollment.participant 
      ? `${enrollment.participant.first_name} ${enrollment.participant.last_name || ''}`.trim()
      : 'Teilnehmer';

    const existing = customerEnrollments.get(customer.id);
    if (existing) {
      existing.participants.push(participantName);
    } else {
      customerEnrollments.set(customer.id, {
        customer: enrollment.ticket_item,
        participants: [participantName]
      });
    }
  }

  // Send notifications to each unique customer
  for (const [customerId, { customer, participants }] of customerEnrollments) {
    if (!customer?.ticket?.customer?.email) continue;

    const customerData = customer.ticket.customer;
    const customerName = customerData.first_name 
      ? `${customerData.first_name} ${customerData.last_name}`
      : customerData.last_name;

    try {
      const templateData: Record<string, unknown> = {
        customer_name: customerName,
        course_name: instanceData.course.name,
        instructor_name: instructorName,
        meeting_point: instanceData.course.meeting_point || 'Wird noch bekannt gegeben',
      };

      if (changeType === "customer.group_course.changed" && changeData) {
        templateData.old_date = formatDate(changeData.old.date || instanceData.date);
        templateData.old_time = formatTimeRange(
          changeData.old.start_time || instanceData.start_time,
          changeData.old.end_time || instanceData.end_time
        );
        templateData.new_date = formatDate(changeData.new.date || instanceData.date);
        templateData.new_time = formatTimeRange(
          changeData.new.start_time || instanceData.start_time,
          changeData.new.end_time || instanceData.end_time
        );
      } else if (changeType === "customer.group_course.cancelled") {
        templateData.course_date = formatDate(instanceData.date);
        templateData.course_time = formatTimeRange(instanceData.start_time, instanceData.end_time);
        templateData.participant_name = participants.join(', ');
        templateData.cancellation_reason = cancellationReason || 'Nicht angegeben';
      }

      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: changeType,
          recipientEmail: customerData.email,
          recipientName: customerName,
          data: templateData,
        },
      });

      if (error) {
        errors.push(`Failed to notify ${customerData.email}: ${error.message}`);
      } else {
        notified++;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Failed to notify customer ${customerId}: ${errorMessage}`);
    }
  }

  return { success: errors.length === 0, notified, errors };
}

/**
 * Notify a single customer about their enrollment change
 * Used for individual changes (enrollment, unenrollment)
 */
export async function notifyCustomerEnrollment(
  customerEmail: string,
  customerName: string,
  changeType: "customer.group_course.enrolled" | "customer.group_course.unenrolled",
  data: {
    participant_name: string;
    course_name: string;
    course_date: string;
    course_time: string;
    instructor_name?: string;
    meeting_point?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke("send-notification", {
      body: {
        type: changeType,
        recipientEmail: customerEmail,
        recipientName: customerName,
        data: {
          customer_name: customerName,
          participant_name: data.participant_name,
          course_name: data.course_name,
          course_date: formatDate(data.course_date),
          course_time: data.course_time,
          instructor_name: data.instructor_name || 'Wird noch bekannt gegeben',
          meeting_point: data.meeting_point || 'Wird noch bekannt gegeben',
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Notify instructor about group course changes
 */
export async function notifyInstructorGroupCourse(
  instructorId: string,
  changeType: "instructor.group_course.changed" | "instructor.group_course.enrollment_changed",
  data: {
    course_name: string;
    course_date: string;
    course_time: string;
    old_date?: string;
    old_time?: string;
    new_date?: string;
    new_time?: string;
    meeting_point?: string;
    participant_count: number;
    max_participants: number;
    change_type?: string;
    participant_name?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const instructor = await getInstructorDetails(instructorId);
  if (!instructor || !instructor.email) {
    return { success: false, error: "Instructor not found or has no email" };
  }

  const instructorName = `${instructor.first_name} ${instructor.last_name}`;

  try {
    const { error } = await supabase.functions.invoke("send-notification", {
      body: {
        type: changeType,
        recipientEmail: instructor.email,
        recipientName: instructorName,
        data: {
          instructor_name: instructorName,
          course_name: data.course_name,
          course_date: formatDate(data.course_date),
          course_time: data.course_time,
          old_date: data.old_date ? formatDate(data.old_date) : undefined,
          old_time: data.old_time,
          new_date: data.new_date ? formatDate(data.new_date) : undefined,
          new_time: data.new_time,
          meeting_point: data.meeting_point || 'Nicht angegeben',
          participant_count: data.participant_count,
          max_participants: data.max_participants,
          change_type: data.change_type,
          participant_name: data.participant_name,
          portal_url: 'https://yeti-alpine-booking.lovable.app/instructor/schedule',
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Detect what changed between old and new instance data
 */
export function detectInstanceChanges(
  oldInstance: Partial<InstanceData>,
  newInstance: Partial<InstanceData>
): {
  hasDateChange: boolean;
  hasTimeChange: boolean;
  hasInstructorChange: boolean;
  hasMeetingPointChange: boolean;
  isGlobalChange: boolean;
  oldInstructorId?: string | null;
  newInstructorId?: string | null;
} {
  const hasDateChange = oldInstance.date !== newInstance.date;
  const hasTimeChange = 
    oldInstance.start_time !== newInstance.start_time ||
    oldInstance.end_time !== newInstance.end_time;
  const hasInstructorChange = oldInstance.instructor_id !== newInstance.instructor_id;
  const hasMeetingPointChange = oldInstance.course?.meeting_point !== newInstance.course?.meeting_point;

  return {
    hasDateChange,
    hasTimeChange,
    hasInstructorChange,
    hasMeetingPointChange,
    isGlobalChange: hasDateChange || hasTimeChange || hasInstructorChange || hasMeetingPointChange,
    oldInstructorId: oldInstance.instructor_id,
    newInstructorId: newInstance.instructor_id,
  };
}
