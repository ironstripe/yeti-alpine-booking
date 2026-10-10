// Group course creation (issue #46). Course row first, then child rows (schedules /
// Saturday dates). Not atomic: if a child write fails or its answer is lost, the course
// already exists and child completion is UNCONFIRMED. We report that honestly with the
// course identity; no automatic cleanup or retry.
import { format } from 'date-fns';
import type { GroupCourseFormData } from '@/types/group-courses';
import { generateSaturdays } from '@/lib/dates/saturday-generator';

type Res<T = unknown> = { data?: T | null; error: { code?: string; message?: string } | null };
// Minimal client surface (supabase-js compatible) so the real code path is testable.
export interface CourseClient {
  from(table: string): {
    insert(rows: unknown): PromiseLike<Res> & { select(): { single(): PromiseLike<Res<{ id: string; name: string }>> } };
  };
}

export class CourseChildSaveError extends Error {
  constructor(public courseId: string, public courseName: string, public step: string, public cause: unknown) {
    const reason = (cause as { message?: string })?.message || 'Keine Antwort erhalten';
    super(
      `Kurs «${courseName}» (ID ${courseId}) wurde angelegt, aber Schritt «${step}» ist fehlgeschlagen: ${reason}. ` +
      'Der Kurs existiert; ob die Unterrichtszeiten vollständig gespeichert wurden, ist unbestätigt. ' +
      'Bitte den Kurs in der Liste prüfen, bevor Sie es erneut versuchen.',
    );
    this.name = 'CourseChildSaveError';
  }
}

export function buildCourseInsert(formData: GroupCourseFormData): Record<string, unknown> {
  const isOffice = formData.course_type === 'office';
  return {
    name: formData.name,
    description: formData.description || null,
    discipline: formData.discipline,
    // Office keeps its 18–99 range; otherwise blank stays NULL (= no age restriction).
    min_age: isOffice ? 18 : formData.min_age ?? null,
    max_age: isOffice ? 99 : formData.max_age ?? null,
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
    sort_order: formData.sort_order ?? 0,
  };
}

export async function createGroupCourse(client: CourseClient, formData: GroupCourseFormData) {
  const { data: course, error: courseError } = await client
    .from('group_courses').insert(buildCourseInsert(formData)).select().single();
  if (courseError) throw courseError;
  if (!course) throw new Error('Kurs wurde nicht bestätigt.');

  const child = async (step: string, table: string, rows: unknown[]) => {
    if (rows.length === 0) return;
    let res: Res;
    try { res = await client.from(table).insert(rows); }
    catch (e) { throw new CourseChildSaveError(course.id, course.name, step, e); }
    if (res.error) throw new CourseChildSaveError(course.id, course.name, step, res.error);
  };

  if (formData.course_type === 'weekly') {
    await child('Unterrichtszeiten', 'group_course_schedules', formData.schedules.days.flatMap(day =>
      formData.schedules.time_slots.map(slot => ({
        course_id: course.id, day_of_week: day, start_time: slot.start_time, end_time: slot.end_time, is_active: true,
      }))));
  }

  if (formData.course_type === 'saturday_course' && formData.period_start_date && formData.period_end_date) {
    const saturdays = generateSaturdays(new Date(formData.period_start_date), new Date(formData.period_end_date));
    await child('Kursdaten', 'training_course_dates', saturdays.map(date => ({
      training_id: course.id, date: format(date, 'yyyy-MM-dd'), is_cancelled: false,
    })));
    // Persist each authored Saturday teaching block, not an invented 10–14 slot.
    await child('Unterrichtszeiten', 'group_course_schedules', formData.schedules.time_slots.map(slot => ({
      course_id: course.id, day_of_week: 6, start_time: slot.start_time, end_time: slot.end_time, is_active: true,
    })));
  }

  return course;
}
