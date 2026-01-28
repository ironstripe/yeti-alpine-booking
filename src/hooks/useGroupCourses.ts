import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, getDay, addDays } from 'date-fns';
import type { 
  GroupCourse, 
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
          linked_skill_level:skill_level_id(id, name, color, description)
        `)
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
        .select('*')
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
      // Create course with product_id instead of prices
      const insertData: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        skill_level_id: formData.skill_level_id,
        discipline: formData.discipline,
        min_age: formData.min_age,
        max_age: formData.max_age,
        max_participants: formData.max_participants,
        product_id: formData.product_id,
        meeting_point: formData.meeting_point || null,
        color: formData.color,
        is_active: formData.is_active,
        price_per_day: 0, // Legacy field, price now comes from product
        course_type: formData.course_type,
        period_start_date: formData.period_start_date,
        period_end_date: formData.period_end_date,
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

      // Build update data
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

// Generate instances for a week
export function useGenerateInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, weekStart }: { courseId: string; weekStart: Date }) => {
      // Get course schedules
      const { data: schedules, error: schedError } = await supabase
        .from('group_course_schedules')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (schedError) throw schedError;
      if (!schedules?.length) return [];

      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

      const instancesToCreate: Omit<GroupCourseInstance, 'id' | 'created_at' | 'course' | 'instructor' | 'assistant_instructor'>[] = [];

      for (const day of daysInWeek) {
        const dayOfWeek = getDay(day);
        const matchingSchedules = schedules.filter(s => s.day_of_week === dayOfWeek);

        for (const schedule of matchingSchedules) {
          instancesToCreate.push({
            course_id: courseId,
            schedule_id: schedule.id,
            date: format(day, 'yyyy-MM-dd'),
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            instructor_id: null,
            assistant_instructor_id: null,
            status: 'scheduled',
            current_participants: 0,
            notes: null,
          });
        }
      }

      // Upsert instances (don't create duplicates)
      const { data, error } = await supabase
        .from('group_course_instances')
        .upsert(instancesToCreate, {
          onConflict: 'course_id,date,start_time',
          ignoreDuplicates: true,
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
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

// Bulk assign instructor to all instances in a week
export function useBulkAssignInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      courseId, 
      weekStart, 
      instructorId 
    }: { 
      courseId: string; 
      weekStart: Date;
      instructorId: string;
    }) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

      const { error } = await supabase
        .from('group_course_instances')
        .update({ instructor_id: instructorId })
        .eq('course_id', courseId)
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'));

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-course-instances'] });
      toast.success('Lehrer für gesamte Woche zugewiesen');
    },
    onError: (error) => {
      console.error('Error bulk assigning instructor:', error);
      toast.error('Fehler beim Zuweisen des Lehrers');
    },
  });
}

// Fetch training course dates for a Saturday course
export function useTrainingCourseDates(trainingId: string | undefined) {
  return useQuery({
    queryKey: ['training-course-dates', trainingId],
    queryFn: async (): Promise<TrainingCourseDate[]> => {
      if (!trainingId) return [];

      const { data, error } = await supabase
        .from('training_course_dates')
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name)
        `)
        .eq('training_id', trainingId)
        .order('date');

      if (error) throw error;
      return data as unknown as TrainingCourseDate[];
    },
    enabled: !!trainingId,
  });
}

// Assign instructor to a Saturday course date
export function useAssignCourseDateInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      courseDateId, 
      instructorId 
    }: { 
      courseDateId: string; 
      instructorId: string | null;
    }) => {
      const { error } = await supabase
        .from('training_course_dates')
        .update({ instructor_id: instructorId })
        .eq('id', courseDateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-course-dates'] });
      queryClient.invalidateQueries({ queryKey: ['group-courses'] });
      toast.success('Lehrer zugewiesen');
    },
    onError: (error) => {
      console.error('Error assigning instructor to course date:', error);
      toast.error('Fehler beim Zuweisen des Lehrers');
    },
  });
}
