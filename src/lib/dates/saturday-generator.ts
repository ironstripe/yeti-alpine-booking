import { format, isSaturday, addDays } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Generate all Saturdays within a date range
 */
export function generateSaturdays(startDate: Date, endDate: Date): Date[] {
  const saturdays: Date[] = [];
  
  // Find the first Saturday on or after startDate
  let current = new Date(startDate);
  while (!isSaturday(current)) {
    current = addDays(current, 1);
  }
  
  // Collect all Saturdays until endDate
  while (current <= endDate) {
    saturdays.push(new Date(current));
    current = addDays(current, 7);
  }
  
  return saturdays;
}

/**
 * Get course period info for display
 */
export function getCoursePeriodInfo(startDate: Date, endDate: Date): {
  saturdays: Date[];
  totalWeeks: number;
  label: string;
} {
  const saturdays = generateSaturdays(startDate, endDate);
  
  return {
    saturdays,
    totalWeeks: saturdays.length,
    label: `${format(startDate, 'dd.MM.')} – ${format(endDate, 'dd.MM.yyyy')} (${saturdays.length} Samstage)`,
  };
}

/**
 * Format Saturday date for display
 */
export function formatSaturdayDate(date: Date): string {
  return format(date, 'dd. MMMM yyyy', { locale: de });
}

/**
 * Calculate end date for a 5-Saturday course period
 */
export function calculatePeriodEndDate(startDate: Date): Date {
  // Start from the first Saturday
  let current = new Date(startDate);
  while (!isSaturday(current)) {
    current = addDays(current, 1);
  }
  
  // Add 4 weeks to get to the 5th Saturday
  return addDays(current, 28);
}
