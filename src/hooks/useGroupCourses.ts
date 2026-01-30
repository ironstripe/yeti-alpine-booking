import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import type { 
  GroupCourseSchedule, 
  GroupCourseInstance, 
  GroupCourseWithSchedules,
  GroupCourseFormData,
  TrainingCourseDate 
} from '@/types/group-courses';
import { generateSaturdays } from '@/lib/dates/saturday-generator';

// Fetch all group courses with their schedules and linked products
export function useGroupCourses(options?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ['group-courses', options?.activeOnly],
    queryFn: async (): Promise<GroupCourseWithSchedules[]> => {
      let query = supabase
        .from('group_courses')
        .select(`
          *,
          product:product_id(id, name, price, type),
          next_training:next_training_id(id, name)
        `)
        .order('sort_order', { ascending: true })
        .order('name');

      if (options?.activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data: courses, error } = await query;
      if (error) throw error;

      // Fetch schedules for all courses
      const { data: schedules, error: schedError } = await supabase
        .from('group_course_schedules')
        .select('*')
        .in('course_id', courses.map(c => c.id))
        .eq('is_active', true);

      if (schedError) throw schedError;

      // Fetch course dates for Saturday courses
      const saturdayCourseIds = courses
        .filter(c => c.course_type === 'saturday_course')
        .map(c => c.id);

      let courseDates: TrainingCourseDate[] = [];
      if (saturdayCourseIds.length > 0) {
        const { data: dates, error: datesError } = await supabase
          .from('training_course_dates')
          .select(`
            *,
            instructor:instructor_id(id, first_name, last_name)
          `)
          .in('training_id', saturdayCourseIds)
          .order('date');

        if (datesError) throw datesError;
        courseDates = dates as unknown as TrainingCourseDate[];
      }

      // Fetch this week's instances for participant counts
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      const { data: instances, error: instError } = await supabase
        .from('group_course_instances')
        .select('course_id, current_participants, instructor_id')
        .in('course_id', courses.map(c => c.id))
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'));

      if (instError) throw instError;

      // Combine data
      return courses.map(course => {
        const courseSchedules = (schedules || []).filter(s => s.course_id === course.id) as GroupCourseSchedule[];
        const courseInstances = (instances || []).filter(i => i.course_id === course.id);
        const courseCourseDates = courseDates.filter(d => d.training_id === course.id);
        
        // Calculate this week's stats
        const uniqueDays = new Set(courseSchedules.map(s => s.day_of_week)).size;
        const slotsPerDay = courseSchedules.length / Math.max(uniqueDays, 1);
        const totalSlotsThisWeek = uniqueDays * slotsPerDay;
        
        const thisWeekParticipants = courseInstances.reduce((sum, i) => sum + (i.current_participants || 0), 0);
        const thisWeekMaxSpots = totalSlotsThisWeek * course.max_participants;

        return {
          ...course,
          course_type: course.course_type || 'weekly',
          product: course.product as any,
          next_training: course.next_training as any,
          schedules: courseSchedules,
          course_dates: courseCourseDates,
          this_week_participants: thisWeekParticipants,
          this_week_max_spots: thisWeekMaxSpots,
          assigned_instructor: null,
        } as GroupCourseWithSchedules;
      });
    },
  });
}

// Fetch single group course
export function useGroupCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: ['group-course', courseId],
    queryFn: async (): Promise<GroupCourseWithSchedules | null> => {
      if (!courseId) return null;

      const { data: course, error } = await supabase
        .from('group_courses')
        .select(`
          *,
          next_training:next_training_id(id, name)
        `)
        .eq('id', courseId)
        .single();

      if (error) throw error;

      const { data: schedules, error: schedError } = await supabase
        .from('group_course_schedules')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (schedError) throw schedError;

      // Fetch course dates if Saturday course
      let courseDates: TrainingCourseDate[] = [];
      if (course.course_type === 'saturday_course') {
        const { data: dates, error: datesError } = await supabase
          .from('training_course_dates')
          .select(`
            *,
            instructor:instructor_id(id, first_name, last_name)
          `)
          .eq('training_id', courseId)
          .order('date');

        if (datesError) throw datesError;
        courseDates = dates as unknown as TrainingCourseDate[];
      }

      return {
        ...course,
        course_type: course.course_type || 'weekly',
        next_training: course.next_training as any,
        schedules: schedules as GroupCourseSchedule[],
        course_dates: courseDates,
      } as GroupCourseWithSchedules;
    },
    enabled: !!courseId,
  });
}

// Fetch instances for a course in a given week
export function useGroupCourseInstances(courseId: string | undefined, weekStart: Date) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  return useQuery({
    queryKey: ['group-course-instances', courseId, format(weekStart, 'yyyy-MM-dd')],
    queryFn: async (): Promise<GroupCourseInstance[]> => {
      if (!courseId) return [];

      const { data, error } = await supabase
        .from('group_course_instances')
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name),
          assistant_instructor:assistant_instructor_id(id, first_name, last_name)
        `)
        .eq('course_id', courseId)
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        .order('date')
        .order('start_time');

      if (error) throw error;
      return data as unknown as GroupCourseInstance[];
    },
    enabled: !!courseId,
  });
}

// Create group course with schedules
export function useCreateGroupCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: GroupCourseFormData) => {
      // Create course - no longer includes skill_level_id
      const isOffice = formData.course_type === 'office';
      const insertData: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        discipline: formData.discipline,
        min_age: isOffice ? 18 : formData.min_age,
        max_age: isOffice ? 99 : formData.max_age,
        max_participants: formData.max_participants,
        product_id: isOffice ? null : formData.product_id,
        meeting_point: formData.meeting_point || null,
        color: isOffice ? '#6B7280' : formData.color,
        is_active: formData.is_active,
        is_internal: isOffice,
        price_per_day: 0, // Legacy field, price now comes from product
        course_type: formData.course_type,
        period_start_date: formData.period_start_date,
        period_end_date: formData.period_end_date,
        next_training_id: isOffice ? null : formData.next_training_id,
      };

      const { data: course, error: courseError } = await supabase
        .from('group_courses')
        .insert(insertData as any)
        .select()
        .single();

      if (courseError) throw courseError;

      // Create schedules (for weekly courses)
      if (formData.course_type === 'weekly') {
        const scheduleInserts = formData.schedules.days.flatMap(dayOfWeek =>
          formData.schedules.time_slots.map(slot => ({
            course_id: course.id,
            day_of_week: dayOfWeek,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: true,
          }))
        );

        if (scheduleInserts.length > 0) {
          const { error: schedError } = await supabase
            .from('group_course_schedules')
            .insert(scheduleInserts);

          if (schedError) throw schedError;
        }
      }

      // Generate course dates for Saturday courses
      if (formData.course_type === 'saturday_course' && formData.period_start_date && formData.period_end_date) {
        const saturdays = generateSaturdays(
          new Date(formData.period_start_date),
          new Date(formData.period_end_date)
        );

        const courseDatesInserts = saturdays.map(date => ({
          training_id: course.id,
          date: format(date, 'yyyy-MM-dd'),
          is_cancelled: false,
        }));

        if (courseDatesInserts.length > 0) {
          const { error: datesError } = await supabase
            .from('training_course_dates')
            .insert(courseDatesInserts);

          if (datesError) throw datesError;
        }

        // Also create a schedule entry for Saturday
        const { error: schedError } = await supabase
          .from('group_course_schedules')
          .insert({
            course_id: course.id,
            day_of_week: 6, // Saturday
            start_time: '10:00',
            end_time: '14:00',
            is_active: true,
          });

        if (schedError) throw schedError;
      }

      return course;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      toast.success('Training erfolgreich erstellt');
    },
    onError: (error) => {
      console.error('Error creating course:', error);
      toast.error('Fehler beim Erstellen des Trainings');
    },
  });
}

// Update group course
export function useUpdateGroupCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GroupCourseFormData> }) => {
      const { schedules, ...courseData } = data;

      // Build update data - no longer includes skill_level_id
      const updateData: Record<string, unknown> = {
        ...courseData,
        updated_at: new Date().toISOString(),
      };

      // Update course
      const { error: courseError } = await supabase
        .from('group_courses')
        .update(updateData)
        .eq('id', id);

      if (courseError) throw courseError;

      // Update schedules if provided and it's a weekly course
      if (schedules && data.course_type === 'weekly') {
        // Delete existing schedules
        await supabase
          .from('group_course_schedules')
          .delete()
          .eq('course_id', id);

        // Insert new schedules
        const scheduleInserts = schedules.days.flatMap(dayOfWeek =>
          schedules.time_slots.map(slot => ({
            course_id: id,
            day_of_week: dayOfWeek,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: true,
          }))
        );

        if (scheduleInserts.length > 0) {
          const { error: schedError } = await supabase
            .from('group_course_schedules')
            .insert(scheduleInserts);

          if (schedError) throw schedError;
        }
      }

      // Regenerate course dates if Saturday course dates changed
      if (data.course_type === 'saturday_course' && data.period_start_date && data.period_end_date) {
        // Delete existing course dates
        await supabase
          .from('training_course_dates')
          .delete()
          .eq('training_id', id);

        // Generate and insert new dates
        const saturdays = generateSaturdays(
          new Date(data.period_start_date),
          new Date(data.period_end_date)
        );

        const courseDatesInserts = saturdays.map(date => ({
          training_id: id,
          date: format(date, 'yyyy-MM-dd'),
          is_cancelled: false,
        }));

        if (courseDatesInserts.length > 0) {
          const { error: datesError } = await supabase
            .from('training_course_dates')
            .insert(courseDatesInserts);

          if (datesError) throw datesError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      queryClient.invalidateQueries({ queryKey: ['group-course'] });
      toast.success('Training erfolgreich aktualisiert');
    },
    onError: (error) => {
      console.error('Error updating course:', error);
      toast.error('Fehler beim Aktualisieren des Trainings');
    },
  });
}

// Delete group course
export function useDeleteGroupCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('group_courses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      toast.success('Training erfolgreich gelöscht');
    },
    onError: (error) => {
      console.error('Error deleting course:', error);
      toast.error('Fehler beim Löschen des Trainings');
    },
  });
}

// RPC response type for group planning functions
interface GroupPlanningRpcResponse {
  status: 'success' | 'error';
  message: string;
  instances_created?: number;
  instances_updated?: number;
  courses_copied?: number;
  week_start?: string;
  week_end?: string;
  source_week?: string;
  target_week?: string;
  course_id?: string;
  instructor_id?: string;
  assistant_instructor_id?: string | null;
}

// Generate instances for a week using RPC
export function useGenerateInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart }: { weekStart: Date }) => {
      const { data, error } = await supabase
        .rpc('generate_group_course_instances_for_week', {
          p_week_start_date: format(weekStart, 'yyyy-MM-dd')
        });

      if (error) throw error;
      const result = data as unknown as GroupPlanningRpcResponse;
      if (result?.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      toast.success(`${data.instances_created || 0} Instanzen generiert`);
    },
    onError: (error) => {
      console.error('Error generating instances:', error);
      toast.error('Fehler beim Generieren der Instanzen');
    },
  });
}

// Assign instructor to instance
export function useAssignInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      instructorId, 
      isAssistant = false 
    }: { 
      instanceId: string; 
      instructorId: string | null;
      isAssistant?: boolean;
    }) => {
      const updateData = isAssistant 
        ? { assistant_instructor_id: instructorId }
        : { instructor_id: instructorId };

      const { error } = await supabase
        .from('group_course_instances')
        .update(updateData)
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success('Lehrer zugewiesen');
    },
    onError: (error) => {
      console.error('Error assigning instructor:', error);
      toast.error('Fehler beim Zuweisen des Lehrers');
    },
  });
}

// Bulk assign instructor to all instances in a week using RPC
export function useBulkAssignInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      courseId, 
      weekStart, 
      instructorId,
      assistantInstructorId
    }: { 
      courseId: string; 
      weekStart: Date;
      instructorId: string;
      assistantInstructorId?: string | null;
    }) => {
      const { data, error } = await supabase
        .rpc('assign_instructor_to_course_week', {
          p_course_id: courseId,
          p_week_start_date: format(weekStart, 'yyyy-MM-dd'),
          p_instructor_id: instructorId,
          p_assistant_instructor_id: assistantInstructorId || null
        });

      if (error) throw error;
      const result = data as unknown as GroupPlanningRpcResponse;
      if (result?.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      toast.success('Lehrer für alle Instanzen zugewiesen');
    },
    onError: (error) => {
      console.error('Error bulk assigning instructor:', error);
      toast.error('Fehler beim Zuweisen des Lehrers');
    },
  });
}

// Copy week assignments
export function useCopyWeekAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      sourceWeekStart, 
      targetWeekStart 
    }: { 
      sourceWeekStart: Date; 
      targetWeekStart: Date;
    }) => {
      const { data, error } = await supabase
        .rpc('copy_instructor_assignments_from_previous_week', {
          p_target_week_start_date: format(targetWeekStart, 'yyyy-MM-dd')
        });

      if (error) throw error;
      const result = data as unknown as GroupPlanningRpcResponse;
      if (result?.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success(`${data.courses_copied || 0} Kurszuweisungen kopiert`);
    },
    onError: (error) => {
      console.error('Error copying week assignments:', error);
      toast.error('Fehler beim Kopieren der Wochenzuweisungen');
    },
  });
}
