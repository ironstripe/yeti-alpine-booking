// Types for Group Courses (Trainings) module

export interface GroupCourse {
  id: string;
  name: string;
  description: string | null;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  discipline: 'ski' | 'snowboard' | 'both';
  min_age: number | null;
  max_age: number | null;
  max_participants: number;
  price_per_day: number;
  price_full_week: number | null;
  meeting_point: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupCourseSchedule {
  id: string;
  course_id: string;
  day_of_week: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface GroupCourseInstance {
  id: string;
  course_id: string;
  schedule_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  instructor_id: string | null;
  assistant_instructor_id: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  current_participants: number;
  notes: string | null;
  created_at: string;
  // Joined data
  course?: GroupCourse;
  instructor?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  assistant_instructor?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface GroupCourseEnrollment {
  id: string;
  instance_id: string;
  ticket_item_id: string | null;
  participant_id: string | null;
  attendance_status: 'registered' | 'present' | 'absent' | 'cancelled';
  checked_in_at: string | null;
  notes: string | null;
  created_at: string;
  // Joined data
  participant?: {
    id: string;
    first_name: string;
    last_name: string | null;
    birth_date: string;
  };
}

export interface GroupCourseWithSchedules extends GroupCourse {
  schedules: GroupCourseSchedule[];
  this_week_participants?: number;
  this_week_max_spots?: number;
  assigned_instructor?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface GroupCourseFormData {
  name: string;
  description: string;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  discipline: 'ski' | 'snowboard' | 'both';
  min_age: number | null;
  max_age: number | null;
  max_participants: number;
  price_per_day: number;
  price_full_week: number | null;
  meeting_point: string;
  color: string;
  is_active: boolean;
  schedules: {
    days: number[];
    time_slots: { start_time: string; end_time: string }[];
  };
}

// Helper constants
export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Anfänger' },
  { value: 'intermediate', label: 'Fortgeschritten' },
  { value: 'advanced', label: 'Experte' },
] as const;

export const DISCIPLINES = [
  { value: 'ski', label: 'Ski' },
  { value: 'snowboard', label: 'Snowboard' },
  { value: 'both', label: 'Ski & Snowboard' },
] as const;

export const DAYS_OF_WEEK = [
  { value: 0, label: 'So', fullLabel: 'Sonntag' },
  { value: 1, label: 'Mo', fullLabel: 'Montag' },
  { value: 2, label: 'Di', fullLabel: 'Dienstag' },
  { value: 3, label: 'Mi', fullLabel: 'Mittwoch' },
  { value: 4, label: 'Do', fullLabel: 'Donnerstag' },
  { value: 5, label: 'Fr', fullLabel: 'Freitag' },
  { value: 6, label: 'Sa', fullLabel: 'Samstag' },
] as const;

export const COURSE_COLORS = [
  { value: '#3B82F6', label: 'Blau' },
  { value: '#EF4444', label: 'Rot' },
  { value: '#22C55E', label: 'Grün' },
  { value: '#F59E0B', label: 'Orange' },
  { value: '#8B5CF6', label: 'Violett' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#06B6D4', label: 'Türkis' },
  { value: '#6B7280', label: 'Grau' },
] as const;
