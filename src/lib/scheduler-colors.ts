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
  | 'unavailable';

export interface BlockColorConfig {
  bg: string;
  text: string;
  label: string;
}

export const BLOCK_COLORS: Record<BlockType, BlockColorConfig> = {
  group: {
    bg: "bg-blue-500",
    text: "text-white",
    label: "Gruppenkurs",
  },
  private_paid: {
    bg: "bg-green-500",
    text: "text-white",
    label: "Privat (bezahlt)",
  },
  private_unpaid: {
    bg: "bg-orange-500",
    text: "text-white",
    label: "Privat (offen)",
  },
  camp: {
    bg: "bg-purple-500",
    text: "text-white",
    label: "Skilager",
  },
  office: {
    bg: "bg-gray-400",
    text: "text-gray-800",
    label: "Büro",
  },
  unavailable: {
    bg: "bg-gray-200",
    text: "text-gray-500",
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
    BLOCK_COLORS.unavailable,
  ];
}
