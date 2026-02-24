/**
 * Shared Private Lesson - Proportional Price Splitting
 * 
 * When multiple independent parties share a single instructor slot,
 * the total cost is split proportionally based on participant count.
 * 
 * Rounding rule: Floor to centimes, remainder goes to initiator.
 */

import { 
  calculatePrivateLessonPrice, 
  type TimeSlotRate, 
  type HighSeasonPeriod 
} from "./private-lesson-pricing";

export interface SharedParty {
  ticketId: string;
  participantCount: number;
  isInitiator: boolean;
  customerName?: string;
}

export interface SharedSplitPartyResult {
  ticketId: string;
  participantCount: number;
  isInitiator: boolean;
  share: number; // Amount in CHF this party pays
  customerName?: string;
}

export interface SharedSplitResult {
  totalCost: number;
  totalParticipants: number;
  perParticipantRate: number; // Floored to centimes
  parties: SharedSplitPartyResult[];
  roundingRemainder: number; // Extra centimes assigned to initiator
  durationHours: number;
}

/**
 * Calculate proportional split for a shared private lesson.
 * 
 * Algorithm:
 * 1. Calculate total lesson cost using all participants combined
 * 2. Per-participant rate = floor(totalCost * 100 / totalParticipants) / 100
 * 3. Each party share = perParticipantRate * partyParticipantCount
 * 4. Rounding remainder = totalCost - sum(all shares)
 * 5. Add remainder to initiator's share
 */
export function calculateSharedLessonSplit(
  totalParticipants: number,
  parties: SharedParty[],
  date: Date,
  startTime: string,
  endTime: string,
  rates: TimeSlotRate[] = [],
  highSeasonPeriods: HighSeasonPeriod[] = []
): SharedSplitResult {
  // 1. Calculate total cost with all participants
  const priceResult = calculatePrivateLessonPrice(
    date,
    startTime,
    endTime,
    totalParticipants,
    rates.length > 0 ? rates : undefined,
    highSeasonPeriods
  );

  const totalCost = priceResult.totalPrice;
  const durationHours = priceResult.durationHours;

  // 2. Per-participant rate (floor to centimes)
  const perParticipantRate = Math.floor((totalCost * 100) / totalParticipants) / 100;

  // 3. Calculate each party's share
  const partyResults: SharedSplitPartyResult[] = parties.map(party => ({
    ticketId: party.ticketId,
    participantCount: party.participantCount,
    isInitiator: party.isInitiator,
    share: Math.round(perParticipantRate * party.participantCount * 100) / 100,
    customerName: party.customerName,
  }));

  // 4. Calculate rounding remainder
  const sumOfShares = partyResults.reduce((sum, p) => sum + p.share, 0);
  const roundingRemainder = Math.round((totalCost - sumOfShares) * 100) / 100;

  // 5. Add remainder to initiator
  if (roundingRemainder > 0) {
    const initiator = partyResults.find(p => p.isInitiator);
    if (initiator) {
      initiator.share = Math.round((initiator.share + roundingRemainder) * 100) / 100;
    }
  }

  return {
    totalCost,
    totalParticipants,
    perParticipantRate,
    parties: partyResults,
    roundingRemainder,
    durationHours,
  };
}

/**
 * Format CHF amount for display
 */
export function formatShareAmount(amount: number): string {
  return `CHF ${amount.toFixed(2)}`;
}
