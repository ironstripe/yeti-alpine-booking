/**
 * Color configuration for scheduler blocks
 * Uses semantic color classes for consistency with design system
 */

export type BlockType = 
  | 'group' 
  | 'private_paid' 
  | 'private_unpaid' 
  | 'camp' 
  | 'office' 
  | 'group_reserve'
  | 'unavailable';

export interface BlockColorConfig {
  bg: string;
  text: string;
  label: string;
}

export const BLOCK_COLORS: Record<BlockType, BlockColorConfig> = {
  group: {
    bg: "bg-slate-200 border border-slate-500 dark:bg-slate-700 dark:border-slate-500",
    text: "text-slate-900 dark:text-slate-50",
    label: "Gruppenkurs",
  },
  private_paid: {
    bg: "bg-emerald-100 border border-emerald-500 dark:bg-emerald-950 dark:border-emerald-600",
    text: "text-emerald-900 dark:text-emerald-100",
    label: "Privat (bezahlt)",
  },
  private_unpaid: {
    bg: "bg-amber-100 border border-amber-500 dark:bg-amber-950 dark:border-amber-600",
    text: "text-amber-950 dark:text-amber-100",
    label: "Privat (offen)",
  },
  camp: {
    bg: "bg-stone-200 border border-stone-500 dark:bg-stone-700 dark:border-stone-500",
    text: "text-stone-900 dark:text-stone-50",
    label: "Skilager",
  },
  office: {
    bg: "bg-zinc-100 border border-zinc-500 dark:bg-zinc-800 dark:border-zinc-500",
    text: "text-zinc-900 dark:text-zinc-50",
    label: "Büro",
  },
  group_reserve: {
    bg: "bg-slate-100 border border-dashed border-slate-500 dark:bg-slate-800 dark:border-slate-500",
    text: "text-slate-800 dark:text-slate-100",
    label: "Gruppenkurs Reserve",
  },
  unavailable: {
    bg: "bg-gray-300 border border-gray-400 dark:bg-gray-700 dark:border-gray-500",
    text: "text-gray-700 dark:text-gray-100",
    label: "Nicht verfügbar",
  },
} as const;

/**
 * Determine block color based on booking and training data
 */
export function getBlockColor(
  booking?: { payment_status?: string; product_type?: string },
  training?: { is_internal?: boolean; training_type?: string }
): BlockColorConfig {
  // Internal trainings (office)
  if (training?.is_internal) {
    return BLOCK_COLORS.office;
  }
  
  // Camp/school groups
  if (training?.training_type === "camp") {
    return BLOCK_COLORS.camp;
  }
  
  // Group courses
  if (training?.training_type === "group" || booking?.product_type === "group") {
    return BLOCK_COLORS.group;
  }
  
  // Private lessons
  if (booking?.payment_status === "paid") {
    return BLOCK_COLORS.private_paid;
  }
  
  return BLOCK_COLORS.private_unpaid;
}

/**
 * Get all block colors for legend display
 */
export function getLegendItems(): BlockColorConfig[] {
  return [
    BLOCK_COLORS.group,
    BLOCK_COLORS.private_paid,
    BLOCK_COLORS.private_unpaid,
    BLOCK_COLORS.camp,
    BLOCK_COLORS.office,
    BLOCK_COLORS.group_reserve,
    BLOCK_COLORS.unavailable,
  ];
}
