/**
 * Private Lesson Pricing Calculator
 * 
 * Calculates prices based on time slots with different hourly rates:
 * - Off-peak (Randzeit): CHF 75/hour (09:00-10:00, 12:00-14:00)
 * - Peak (Hauptzeit): CHF 85/hour (10:00-12:00, 14:00-16:00)
 * 
 * Additional persons: +CHF 20/person/hour (max 4 persons total)
 * 
 * High season restriction: Single-hour bookings in peak time show soft warning
 */

export interface TimeSlotRate {
  id?: string;
  start_time: string;  // "09:00"
  end_time: string;    // "10:00"
  rate_per_hour: number;
  is_peak: boolean;
  additional_person_rate?: number;
}

export interface HighSeasonPeriod {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface PriceBreakdownItem {
  hour: number;
  timeSlot: string;
  rate: number;
  isPeak: boolean;
}

export interface PrivateLessonPriceResult {
  basePrice: number;
  additionalPersonsPrice: number;
  totalPrice: number;
  breakdown: PriceBreakdownItem[];
  warnings: string[];
  isHighSeason: boolean;
  durationHours: number;
}

// Default rates (fallback if DB not available)
const DEFAULT_RATES: TimeSlotRate[] = [
  { start_time: '09:00', end_time: '10:00', rate_per_hour: 75, is_peak: false },
  { start_time: '10:00', end_time: '12:00', rate_per_hour: 85, is_peak: true },
  { start_time: '12:00', end_time: '14:00', rate_per_hour: 75, is_peak: false },
  { start_time: '14:00', end_time: '16:00', rate_per_hour: 85, is_peak: true },
];

export const ADDITIONAL_PERSON_RATE = 20; // CHF per person per hour
export const MAX_PERSONS = 4;

/**
 * Check if a date falls within high season
 */
export function isHighSeason(date: Date, highSeasonPeriods: HighSeasonPeriod[]): boolean {
  const dateStr = date.toISOString().split('T')[0];
  
  return highSeasonPeriods.some(period => 
    dateStr >= period.start_date &&
    dateStr <= period.end_date
  );
}

/**
 * Get the hourly rate for a specific hour
 */
function getRateForHour(hour: number, rates: TimeSlotRate[]): TimeSlotRate | null {
  const timeMinutes = hour * 60;
  
  for (const rate of rates) {
    const [startH, startM] = rate.start_time.split(':').map(Number);
    const [endH, endM] = rate.end_time.split(':').map(Number);
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);
    
    if (timeMinutes >= startMinutes && timeMinutes < endMinutes) {
      return rate;
    }
  }
  return null;
}

/**
 * Calculate private lesson price based on time slot
 */
export function calculatePrivateLessonPrice(
  date: Date | null,
  startTime: string,        // "09:00"
  endTime: string,          // "11:00"
  numberOfPersons: number = 1,
  rates: TimeSlotRate[] = DEFAULT_RATES,
  highSeasonPeriods: HighSeasonPeriod[] = []
): PrivateLessonPriceResult {
  const warnings: string[] = [];
  const breakdown: PriceBreakdownItem[] = [];
  
  if (!date || !startTime || !endTime) {
    return {
      basePrice: 0,
      additionalPersonsPrice: 0,
      totalPrice: 0,
      breakdown: [],
      warnings: [],
      isHighSeason: false,
      durationHours: 0,
    };
  }
  
  // Parse times
  const [startH] = startTime.split(':').map(Number);
  const [endH] = endTime.split(':').map(Number);
  
  const durationHours = endH - startH;
  
  // Validate
  if (durationHours <= 0) {
    return {
      basePrice: 0,
      additionalPersonsPrice: 0,
      totalPrice: 0,
      breakdown: [],
      warnings: ['Ungültige Zeitangabe'],
      isHighSeason: false,
      durationHours: 0,
    };
  }
  
  const validPersons = Math.min(Math.max(numberOfPersons, 1), MAX_PERSONS);
  const additionalPersons = validPersons - 1;
  
  // Check season
  const highSeason = isHighSeason(date, highSeasonPeriods);
  
  // Calculate price hour by hour
  let basePrice = 0;
  let hasPeakHour = false;
  
  for (let hour = 0; hour < durationHours; hour++) {
    const currentHour = startH + hour;
    const currentTime = `${currentHour.toString().padStart(2, '0')}:00`;
    const nextTime = `${(currentHour + 1).toString().padStart(2, '0')}:00`;
    
    const rate = getRateForHour(currentHour, rates);
    
    if (rate) {
      basePrice += rate.rate_per_hour;
      
      breakdown.push({
        hour: hour + 1,
        timeSlot: `${currentTime}-${nextTime}`,
        rate: rate.rate_per_hour,
        isPeak: rate.is_peak,
      });
      
      if (rate.is_peak) {
        hasPeakHour = true;
      }
    }
  }
  
  // High season warning: single hour in peak time
  if (highSeason && durationHours === 1 && hasPeakHour) {
    warnings.push(
      'Hochsaison: Einzelstunden in der Hauptzeit (10-12, 14-16 Uhr) sind normalerweise nicht verfügbar. Bitte prüfen Sie die Verfügbarkeit.'
    );
  }
  
  // Calculate additional persons price
  const additionalPersonsPrice = additionalPersons * durationHours * ADDITIONAL_PERSON_RATE;
  
  // Validate max persons
  if (numberOfPersons > MAX_PERSONS) {
    warnings.push(`Maximal ${MAX_PERSONS} Personen pro Privatstunde erlaubt.`);
  }
  
  return {
    basePrice,
    additionalPersonsPrice,
    totalPrice: basePrice + additionalPersonsPrice,
    breakdown,
    warnings,
    isHighSeason: highSeason,
    durationHours,
  };
}

/**
 * Format price breakdown for display
 */
export function formatPriceBreakdown(result: PrivateLessonPriceResult, numberOfPersons: number): string[] {
  const lines: string[] = [];
  
  if (result.breakdown.length === 0) return lines;
  
  // Group consecutive hours with same rate
  let currentRate = 0;
  let currentHours = 0;
  let currentSlotStart = '';
  let currentSlotEnd = '';
  
  result.breakdown.forEach((item, index) => {
    if (item.rate === currentRate && currentHours > 0) {
      currentHours++;
      currentSlotEnd = item.timeSlot.split('-')[1];
    } else {
      if (currentHours > 0) {
        lines.push(`${currentSlotStart}-${currentSlotEnd}: ${currentHours}h × CHF ${currentRate} = CHF ${currentHours * currentRate}`);
      }
      currentRate = item.rate;
      currentHours = 1;
      currentSlotStart = item.timeSlot.split('-')[0];
      currentSlotEnd = item.timeSlot.split('-')[1];
    }
    
    if (index === result.breakdown.length - 1) {
      lines.push(`${currentSlotStart}-${currentSlotEnd}: ${currentHours}h × CHF ${currentRate} = CHF ${currentHours * currentRate}`);
    }
  });
  
  if (numberOfPersons > 1) {
    const hours = result.breakdown.length;
    const extra = numberOfPersons - 1;
    lines.push(`Zusatzpersonen: ${extra} × ${hours}h × CHF ${ADDITIONAL_PERSON_RATE} = CHF ${result.additionalPersonsPrice}`);
  }
  
  return lines;
}

/**
 * Format currency for display (Swiss format)
 */
export function formatCHF(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
