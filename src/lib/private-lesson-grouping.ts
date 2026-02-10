/**
 * Private Lesson Grouping Algorithm
 * 
 * Groups participants into compatible instructor groups based on skill level.
 * Rules:
 *   0 - Max 5 per group
 *   A - Beginners (sort_order=1) only with other beginners
 *   B - Advanced children (sort_order>=5): allow diff up to 2
 *   C - Standard: max diff of 1
 *   D - Adult/child mix: map adult colors to child tiers, warn if mixed
 */

import { differenceInYears } from "date-fns";
import type { SelectedParticipant } from "@/contexts/BookingWizardContext";

// ── Types ──────────────────────────────────────────────────────────

export interface GroupedParticipant {
  participant: SelectedParticipant;
  sortOrder: number;
  isAdult: boolean;
  levelLabel: string;
  /** For adults, the child-equivalent tier range [min, max] */
  childTierRange?: [number, number];
}

export interface ParticipantGroup {
  id: string;
  members: GroupedParticipant[];
  sortOrderMin: number;
  sortOrderMax: number;
  warning?: string;
}

export interface GroupingResult {
  groups: ParticipantGroup[];
  warnings: string[];
  needsMultipleGroups: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_GROUP_SIZE = 5;

/** Map legacy level_current_season strings to sort_order for children */
const CHILD_LEVEL_SORT_ORDER: Record<string, number> = {
  // Ski children
  windel_wedel: 1,
  anfaenger: 1,
  snow_kids_village: 2,
  snow_kids: 2,
  blue_prince: 3,
  blauer_prinz: 3,
  blue_king: 4,
  blauer_koenig: 4,
  blue_star: 5,
  blauer_star: 5,
  red_prince: 6,
  roter_prinz: 6,
  red_king: 7,
  roter_koenig: 7,
  red_star: 8,
  roter_star: 8,
  black_prince: 9,
  schwarzer_prinz: 9,
  black_king: 10,
  academy: 10,
};

/** Map adult color levels to sort_order */
const ADULT_COLOR_SORT_ORDER: Record<string, number> = {
  green: 1,
  anfaenger: 1,
  blue: 2,
  fortgeschritten: 2,
  red: 3,
  geuebt: 3,
  black: 4,
  experte: 4,
};

/** Map adult sort_order to equivalent child tier ranges for Rule D */
const ADULT_TO_CHILD_TIER: Record<number, [number, number]> = {
  1: [1, 2],   // Green → child tiers 1-2
  2: [3, 4],   // Blue → child tiers 3-4
  3: [5, 6],   // Red → child tiers 5-6
  4: [7, 10],  // Black → child tiers 7+
};

/** Labels for display */
const LEVEL_LABELS: Record<string, string> = {
  green: "🟢 Anfänger",
  anfaenger: "🟢 Anfänger",
  blue: "🔵 Fortgeschritten",
  fortgeschritten: "🔵 Fortgeschritten",
  red: "🔴 Geübt",
  geuebt: "🔴 Geübt",
  black: "⚫ Experte",
  experte: "⚫ Experte",
  windel_wedel: "Windel Wedel",
  snow_kids_village: "Snow Kids",
  snow_kids: "Snow Kids",
  blue_prince: "Blauer Prinz",
  blauer_prinz: "Blauer Prinz",
  blue_king: "Blauer König",
  blauer_koenig: "Blauer König",
  blue_star: "Blauer Star",
  blauer_star: "Blauer Star",
  red_prince: "Roter Prinz",
  roter_prinz: "Roter Prinz",
  red_king: "Roter König",
  roter_koenig: "Roter König",
  red_star: "Roter Star",
  roter_star: "Roter Star",
  black_prince: "Schwarzer Prinz",
  schwarzer_prinz: "Schwarzer Prinz",
  black_king: "Academy",
  academy: "Academy",
};

// ── Helpers ────────────────────────────────────────────────────────

function isAdult(birthDate: string | null): boolean {
  if (!birthDate) return false;
  return differenceInYears(new Date(), new Date(birthDate)) > 16;
}

function resolveSortOrder(participant: SelectedParticipant): GroupedParticipant {
  const adult = isAdult(participant.birth_date);
  const level = participant.level_current_season?.toLowerCase() || "";

  let sortOrder = 1; // default beginner
  let levelLabel = "Nicht angegeben";
  let childTierRange: [number, number] | undefined;

  if (adult) {
    sortOrder = ADULT_COLOR_SORT_ORDER[level] ?? 1;
    levelLabel = LEVEL_LABELS[level] || "Erwachsene";
    childTierRange = ADULT_TO_CHILD_TIER[sortOrder];
  } else {
    sortOrder = CHILD_LEVEL_SORT_ORDER[level] ?? 1;
    levelLabel = LEVEL_LABELS[level] || "Anfänger";
  }

  return {
    participant,
    sortOrder,
    isAdult: adult,
    levelLabel,
    childTierRange,
  };
}

/**
 * Check if a participant can be added to an existing group.
 * Returns { compatible, warning? }
 */
function checkCompatibility(
  candidate: GroupedParticipant,
  group: ParticipantGroup
): { compatible: boolean; warning?: string } {
  // Rule 0: max group size
  if (group.members.length >= MAX_GROUP_SIZE) {
    return { compatible: false };
  }

  const candidateOrder = candidate.sortOrder;
  const isCandidateAdult = candidate.isAdult;

  // Check against each member in the group
  for (const member of group.members) {
    const memberOrder = member.sortOrder;

    // ── Rule D: Adult/Child mix ──
    if (isCandidateAdult !== member.isAdult) {
      // Map both to a common "child tier" space
      const candidateRange = isCandidateAdult
        ? candidate.childTierRange || [1, 2]
        : [candidateOrder, candidateOrder] as [number, number];
      const memberRange = member.isAdult
        ? member.childTierRange || [1, 2]
        : [memberOrder, memberOrder] as [number, number];

      // Check overlap
      const overlaps =
        candidateRange[0] <= memberRange[1] && candidateRange[1] >= memberRange[0];

      if (!overlaps) {
        return { compatible: false };
      }

      // Compatible but with warning
      return {
        compatible: true,
        warning:
          "Mischung von Erwachsenen und Kindern kann die Lerneffektivität reduzieren.",
      };
    }

    // ── Rule A: Beginner lock ──
    const eitherBeginner = candidateOrder === 1 || memberOrder === 1;
    if (eitherBeginner && candidateOrder !== memberOrder) {
      return { compatible: false };
    }

    // ── Rule B: Advanced flex (children only, both sort_order >= 5) ──
    if (
      !isCandidateAdult &&
      !member.isAdult &&
      candidateOrder >= 5 &&
      memberOrder >= 5
    ) {
      if (Math.abs(candidateOrder - memberOrder) > 2) {
        return { compatible: false };
      }
      continue;
    }

    // ── Rule C: Standard ──
    if (Math.abs(candidateOrder - memberOrder) > 1) {
      return { compatible: false };
    }
  }

  return { compatible: true };
}

// ── Main Algorithm ────────────────────────────────────────────────

/**
 * Group participants into compatible instructor groups.
 */
export function groupParticipants(
  participants: SelectedParticipant[]
): GroupingResult {
  if (participants.length <= 1) {
    const resolved = participants.map(resolveSortOrder);
    return {
      groups: resolved.length
        ? [
            {
              id: "group-1",
              members: resolved,
              sortOrderMin: resolved[0].sortOrder,
              sortOrderMax: resolved[0].sortOrder,
            },
          ]
        : [],
      warnings: [],
      needsMultipleGroups: false,
    };
  }

  // Resolve all participants
  const resolved = participants.map(resolveSortOrder);

  // Sort by sortOrder ascending for greedy grouping
  const sorted = [...resolved].sort((a, b) => a.sortOrder - b.sortOrder);

  const groups: ParticipantGroup[] = [];
  const allWarnings: string[] = [];
  let groupCounter = 0;

  for (const candidate of sorted) {
    let placed = false;

    // Try to place in an existing group
    for (const group of groups) {
      const { compatible, warning } = checkCompatibility(candidate, group);
      if (compatible) {
        group.members.push(candidate);
        group.sortOrderMin = Math.min(group.sortOrderMin, candidate.sortOrder);
        group.sortOrderMax = Math.max(group.sortOrderMax, candidate.sortOrder);
        if (warning && !group.warning) {
          group.warning = warning;
          if (!allWarnings.includes(warning)) {
            allWarnings.push(warning);
          }
        }
        placed = true;
        break;
      }
    }

    // Create new group if not placed
    if (!placed) {
      groupCounter++;
      groups.push({
        id: `group-${groupCounter}`,
        members: [candidate],
        sortOrderMin: candidate.sortOrder,
        sortOrderMax: candidate.sortOrder,
      });
    }
  }

  return {
    groups,
    warnings: allWarnings,
    needsMultipleGroups: groups.length > 1,
  };
}

/**
 * Get a display label for a participant's resolved level.
 */
export function getResolvedLevelLabel(participant: SelectedParticipant): string {
  const resolved = resolveSortOrder(participant);
  return resolved.levelLabel;
}

/**
 * Get the resolved sort order for a participant (for external use).
 */
export function getResolvedSortOrder(participant: SelectedParticipant): number {
  return resolveSortOrder(participant).sortOrder;
}
