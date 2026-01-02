import type { Tables } from "@/integrations/supabase/types";

export type SchedulerInstructor = Tables<"instructors"> & {
  color: InstructorColor;
  todayBookingsCount: number;
};

export type InstructorColor = "red" | "yellow" | "light-blue" | "dark-blue";

export interface SchedulerBooking {
  id: string;
  instructorId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  type: "private" | "group";
  isPaid: boolean;
  ticketId: string;
  participantName?: string;
  status: string;
  participantSport?: string | null;
}

export interface SchedulerAbsence {
  id: string;
  instructorId: string;
  startDate: string;
  endDate: string;
  type: "vacation" | "sick" | "organization" | "office_duty" | "other";
  status: "pending" | "confirmed" | "rejected";
  reason?: string;
}

// Operational hours (lift times: 09:00 - 16:00)
export const OPERATIONAL_START = "09:00";
export const OPERATIONAL_END = "16:00";
export const OPERATIONAL_START_MINUTES = 9 * 60; // 540
export const OPERATIONAL_END_MINUTES = 16 * 60; // 960
export const BOOKABLE_HOURS = 7; // 09:00 to 16:00

// Time slots for the scheduler (09:00 - 16:00)
export const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00"
];

export const TIME_SLOT_HEIGHT = 48; // px per hour
export const INSTRUCTOR_ROW_HEIGHT = 64; // px per row

/**
 * Derive instructor color based on current assignments
 * - Dark Blue: Has active group course on this date
 * - Yellow: Snowboard specialization
 * - Light Blue: Assistant level (Hilfslehrer)
 * - Red: Available for private lessons (default)
 */
export function deriveInstructorColor(
  instructor: Tables<"instructors">,
  hasGroupCourse: boolean
): InstructorColor {
  // Has group course assignment = Dark Blue
  if (hasGroupCourse) return "dark-blue";
  
  // Snowboard instructor = Yellow
  if (instructor.specialization === "snowboard") return "yellow";
  
  // Assistant/Hilfslehrer level = Light Blue
  if (instructor.level === "hilfslehrer" || instructor.role === "hilfslehrer") {
    return "light-blue";
  }
  
  // Default: Available for private = Red
  return "red";
}

/**
 * Get CSS color classes for instructor indicator
 */
export function getInstructorColorClasses(color: InstructorColor): {
  bg: string;
  border: string;
  text: string;
} {
  switch (color) {
    case "dark-blue":
      return { bg: "bg-blue-700", border: "border-blue-700", text: "text-blue-700" };
    case "yellow":
      return { bg: "bg-yellow-500", border: "border-yellow-500", text: "text-yellow-600" };
    case "light-blue":
      return { bg: "bg-sky-400", border: "border-sky-400", text: "text-sky-600" };
    case "red":
    default:
      return { bg: "bg-red-500", border: "border-red-500", text: "text-red-600" };
  }
}

/**
 * Get CSS classes for booking bar based on type and payment status
 * Uses more saturated colors for better visibility against grid lines
 */
export function getBookingBarClasses(type: "private" | "group", isPaid: boolean): string {
  if (type === "group") {
    return "bg-blue-600 text-white border-blue-700";
  }
  return isPaid 
    ? "bg-emerald-500 text-white border-emerald-600" 
    : "bg-rose-500 text-white border-rose-600";
}

/**
 * Get CSS classes for absence bar
 */
export function getAbsenceBarClasses(type: "vacation" | "sick" | "other"): string {
  return "bg-gray-800 text-gray-200 border-gray-900 bg-stripes";
}

/**
 * Parse time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Calculate position and width for a booking bar
 */
export function calculateBarPosition(
  timeStart: string,
  timeEnd: string,
  gridStartTime = OPERATIONAL_START,
  slotWidth = 100 // px per hour
): { left: number; width: number } {
  const gridStart = timeToMinutes(gridStartTime);
  const start = timeToMinutes(timeStart);
  const end = timeToMinutes(timeEnd);
  
  const leftMinutes = start - gridStart;
  const durationMinutes = end - start;
  
  return {
    left: (leftMinutes / 60) * slotWidth,
    width: (durationMinutes / 60) * slotWidth,
  };
}

/**
 * Check if a time slot is within operational hours
 */
export function isWithinOperationalHours(timeStart: string, timeEnd: string): boolean {
  const startMinutes = timeToMinutes(timeStart);
  const endMinutes = timeToMinutes(timeEnd);
  return startMinutes >= OPERATIONAL_START_MINUTES && endMinutes <= OPERATIONAL_END_MINUTES;
}

/**
 * Generate an array of dates for a given date range
 */
export function generateDateRange(startDate: Date, days: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

/**
 * Get the number of days based on view mode
 */
export function getDaysForViewMode(viewMode: string): number {
  switch (viewMode) {
    case "weekly":
      return 7;
    case "3days":
      return 3;
    case "daily":
    default:
      return 1;
  }
}

/**
 * Check if an instructor is absent on a given date
 */
export function isInstructorAbsent(
  instructorId: string,
  date: string,
  absences: SchedulerAbsence[]
): SchedulerAbsence | undefined {
  return absences.find(
    (a) => 
      a.instructorId === instructorId &&
      date >= a.startDate &&
      date <= a.endDate
  );
}

/**
 * Check if a time slot overlaps with existing bookings
 */
export function hasOverlap(
  instructorId: string,
  date: string,
  timeStart: string,
  timeEnd: string,
  bookings: SchedulerBooking[]
): boolean {
  const newStart = timeToMinutes(timeStart);
  const newEnd = timeToMinutes(timeEnd);
  
  return bookings.some((b) => {
    if (b.instructorId !== instructorId || b.date !== date) return false;
    
    const existingStart = timeToMinutes(b.timeStart);
    const existingEnd = timeToMinutes(b.timeEnd);
    
    // Check for overlap
    return newStart < existingEnd && newEnd > existingStart;
  });
}

/**
 * Format date for display
 */
export function formatSchedulerDate(date: Date): string {
  return date.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
