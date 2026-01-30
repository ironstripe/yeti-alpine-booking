import { startOfDay, isAfter, isEqual, parseISO } from "date-fns";

/**
 * Check if a booking can be edited based on its date.
 * Bookings can only be edited if they are today or in the future.
 */
export function isBookingEditable(date: string | Date): boolean {
  const bookingDate = typeof date === "string" ? parseISO(date) : date;
  const today = startOfDay(new Date());
  const bookingDay = startOfDay(bookingDate);
  
  return isEqual(bookingDay, today) || isAfter(bookingDay, today);
}

/**
 * Check if a date is valid for new bookings (today or future).
 * Alias for isBookingEditable but with clearer naming intent for new bookings.
 */
export function isDateBookable(date: string | Date): boolean {
  return isBookingEditable(date);
}

/**
 * Filter an array of dates to only include bookable dates (today or future).
 */
export function filterBookableDates(dates: string[]): string[] {
  return dates.filter(isDateBookable);
}

/**
 * Get the editable status with a reason message.
 */
export function getEditableStatus(date: string | Date): { 
  editable: boolean; 
  reason?: string 
} {
  const editable = isBookingEditable(date);
  
  if (editable) {
    return { editable: true };
  }
  
  return {
    editable: false,
    reason: "Diese Buchung liegt in der Vergangenheit und kann nicht mehr bearbeitet werden.",
  };
}

/**
 * Generate time slots for start time selection (09:00 - 15:00)
 */
export const START_TIMES = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00"
];

/**
 * Generate time slots for end time selection (10:00 - 16:00)
 */
export const END_TIMES = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"
];

/**
 * Calculate duration in hours between two time strings
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return (endMinutes - startMinutes) / 60;
}

/**
 * Validate that end time is after start time
 */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  return calculateDuration(startTime, endTime) > 0;
}
