import type { GroupCourseBlock, ServerGroupRef } from "@/lib/groupCoursePlan";
export const GROUP_LUNCH_PRICE_CHF = 30;
/** Canonical full-day option and real AM/PM blocks; never names or summed duration. */
export function groupLunchEligible(plan: { server?: ServerGroupRef | null; blocks?: GroupCourseBlock[] } | null | undefined, dates: string[]): boolean {
  if (!plan?.server || plan.server.block !== null || dates.length === 0) return false;
  return dates.every(date => {
    const blocks = plan.blocks?.filter(b => b.date === date) ?? [];
    return blocks.some(b => b.startTime < "12:00" && b.endTime <= "12:00")
      && blocks.some(b => b.startTime >= "12:00" && b.endTime > b.startTime);
  });
}
export function uniqueLunchDates(selected: string[], booked: string[]): string[] {
  return [...new Set(selected)].filter(date => booked.includes(date)).sort();
}
