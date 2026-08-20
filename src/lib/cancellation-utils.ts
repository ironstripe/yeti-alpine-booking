export interface CancellationCalculation {
  isWithin24h: boolean;
  hoursBeforeStart: number;
  cancelledAmount: number;
  paidForCancelledPortion: number;
  feeAccordingToAgb: number;
  feeCharged: number;
  creditAmount: number;
}

interface BookingData {
  start_date: string;
  start_time?: string;
  total_amount: number;
  amount_paid: number;
  booking_days: string[];
}

interface CancellationOptions {
  type: "full" | "partial";
  cancelledDays: string[];
  feeOption: "agb" | "waived" | "custom";
  customFee: number;
}

export function calculateCancellation(
  booking: BookingData,
  options: CancellationOptions
): CancellationCalculation {
  const now = new Date();

  // Determine first cancelled day
  let firstCancelledDate: Date;
  if (options.type === "full") {
    firstCancelledDate = new Date(booking.start_date);
  } else {
    const sortedDays = [...options.cancelledDays].sort();
    firstCancelledDate = sortedDays.length > 0 
      ? new Date(sortedDays[0]) 
      : new Date(booking.start_date);
  }

  const hasValidDate = !isNaN(firstCancelledDate.getTime());

  // Add start time if available
  if (hasValidDate && booking.start_time) {
    const [hours, minutes] = booking.start_time.split(":");
    firstCancelledDate.setHours(parseInt(hours), parseInt(minutes));
  }

  // Without a scheduled date there is no deadline to measure against:
  // treat it as outside the 24h window (no automatic AGB fee).
  const hoursBeforeStart = hasValidDate
    ? (firstCancelledDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    : 9999;
  const isWithin24h = hasValidDate && hoursBeforeStart < 24;

  // Calculate cancelled amount
  let cancelledAmount: number;
  if (options.type === "full") {
    cancelledAmount = booking.total_amount;
  } else {
    // Partial: calculate per-day rate
    const totalDays = booking.booking_days.length || 1;
    const perDayRate = booking.total_amount / totalDays;
    cancelledAmount = perDayRate * options.cancelledDays.length;
  }

  // Calculate paid portion for cancelled amount
  const paidRatio = booking.total_amount > 0 
    ? booking.amount_paid / booking.total_amount 
    : 0;
  const paidForCancelledPortion = cancelledAmount * paidRatio;

  // Fee according to AGB: 100% if within 24h, 0 otherwise
  const feeAccordingToAgb = isWithin24h ? cancelledAmount : 0;

  // Actual fee charged based on option
  let feeCharged: number;
  switch (options.feeOption) {
    case "agb":
      feeCharged = feeAccordingToAgb;
      break;
    case "waived":
      feeCharged = 0;
      break;
    case "custom":
      feeCharged = Math.min(options.customFee, cancelledAmount);
      break;
  }

  // Credit = what was paid minus fee
  const creditAmount = Math.max(0, paidForCancelledPortion - feeCharged);

  return {
    isWithin24h,
    hoursBeforeStart: Math.round(hoursBeforeStart * 10) / 10,
    cancelledAmount,
    paidForCancelledPortion,
    feeAccordingToAgb,
    feeCharged,
    creditAmount,
  };
}

// IBAN validation for Swiss/Liechtenstein accounts
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  
  // Swiss IBAN: CH + 2 check digits + 5 bank code + 12 account number = 21 chars
  // Liechtenstein: LI + 2 check digits + 5 bank code + 12 account number = 21 chars
  if (!/^(CH|LI)[0-9]{2}[0-9A-Z]{17}$/.test(cleaned)) {
    return false;
  }

  // Move first 4 chars to end and convert letters to numbers
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (char) =>
    (char.charCodeAt(0) - 55).toString()
  );

  // Mod 97 check
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char)) % 97;
  }

  return remainder === 1;
}

export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return cleaned.match(/.{1,4}/g)?.join(" ") || iban;
}
