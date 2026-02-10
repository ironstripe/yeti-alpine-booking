// =============================================
// LEVEL UTILITIES
// Provides backward-compatible level functions
// alongside new database-backed skill level system
// =============================================

import { 
  mapLegacyLevelToSkillLevelId,
  getSkillLevelLabel
} from "./skill-levels";
import { differenceInYears } from "date-fns";
import type { Discipline } from "@/types/skill-levels";

// =============================================
// LEGACY LEVEL CONSTANTS (kept for backward compatibility)
// =============================================

export const LEVEL_HIERARCHY = [
  "anfaenger",
  "blue_prince",
  "blue_king",
  "blue_star",
  "red_prince",
  "red_king",
  "red_star",
  "black_prince",
  "black_king",
] as const;

export type LevelValue = (typeof LEVEL_HIERARCHY)[number];

export const LEVEL_OPTIONS = [
  { value: "anfaenger", label: "Anfänger" },
  { value: "blue_prince", label: "Blauer Prinz/Prinzessin" },
  { value: "blue_king", label: "Blauer König/Königin" },
  { value: "blue_star", label: "Blauer Star" },
  { value: "red_prince", label: "Roter Prinz/Prinzessin" },
  { value: "red_king", label: "Roter König/Königin" },
  { value: "red_star", label: "Roter Star" },
  { value: "black_prince", label: "Schwarzer Prinz/Prinzessin" },
  { value: "black_king", label: "Academy" },
] as const;

// =============================================
// ADULT LEVEL CONSTANTS (color-based, age > 16)
// =============================================

export const ADULT_LEVEL_HIERARCHY = [
  "green",
  "blue",
  "red",
  "black",
] as const;

export type AdultLevelValue = (typeof ADULT_LEVEL_HIERARCHY)[number];

export const ADULT_LEVEL_OPTIONS = [
  { value: "green", label: "Anfänger (Grüne Piste)" },
  { value: "blue", label: "Blaue Piste" },
  { value: "red", label: "Rote Piste" },
  { value: "black", label: "Experte (Schwarze Piste)" },
] as const;

/**
 * Get appropriate level options based on participant age
 * Adults (>16) get color-based levels, children get training-based levels
 */
export function getLevelOptionsForAge(birthDate: string | Date | null): readonly { value: string; label: string }[] {
  if (!birthDate) return LEVEL_OPTIONS;
  const age = differenceInYears(new Date(), new Date(birthDate));
  return age > 16 ? ADULT_LEVEL_OPTIONS : LEVEL_OPTIONS;
}

// =============================================
// LEVEL UTILITY FUNCTIONS
// =============================================

/**
 * Get next level in progression (supports both child and adult hierarchies)
 */
export function getNextLevel(currentLevel: string | null): string | null {
  if (!currentLevel) return null;
  
  // Check adult hierarchy first
  const adultIndex = ADULT_LEVEL_HIERARCHY.indexOf(currentLevel as AdultLevelValue);
  if (adultIndex !== -1) {
    return adultIndex < ADULT_LEVEL_HIERARCHY.length - 1 ? ADULT_LEVEL_HIERARCHY[adultIndex + 1] : null;
  }
  
  // Fall back to child hierarchy
  const currentIndex = LEVEL_HIERARCHY.indexOf(currentLevel as LevelValue);
  if (currentIndex === -1 || currentIndex === LEVEL_HIERARCHY.length - 1) {
    return null;
  }
  return LEVEL_HIERARCHY[currentIndex + 1];
}

/**
 * Get display label for a level value
 * Supports both legacy string values and new skill_level IDs
 */
export function getLevelLabel(levelValue: string | null): string {
  if (!levelValue) return "Nicht angegeben";
  
  // Check if it's a new skill_level ID (starts with 'ski_' or 'sb_')
  if (levelValue.startsWith('ski_') || levelValue.startsWith('sb_')) {
    return getSkillLevelLabel(levelValue);
  }
  
  // Check adult level options
  const adultFound = ADULT_LEVEL_OPTIONS.find((l) => l.value === levelValue);
  if (adultFound) return adultFound.label;
  
  // Legacy level lookup
  const found = LEVEL_OPTIONS.find((l) => l.value === levelValue);
  return found?.label ?? levelValue;
}

/**
 * Get badge color class for a level
 */
export function getLevelBadgeColor(levelValue: string | null): string {
  if (!levelValue) return "bg-muted text-muted-foreground";
  
  // Direct adult color level matches
  if (levelValue === "green") return "bg-green-100 text-green-800";
  if (levelValue === "blue") return "bg-blue-100 text-blue-800";
  if (levelValue === "red") return "bg-red-100 text-red-800";
  if (levelValue === "black") return "bg-gray-800 text-gray-100";
  
  // Handle new skill_level IDs
  if (levelValue.includes('_green') || levelValue === 'ski_adult_green' || levelValue === 'sb_adult_green') {
    return "bg-green-100 text-green-800";
  }
  if (levelValue.includes('blauer') || levelValue.includes('blue') || 
      levelValue === 'ski_adult_blue' || levelValue === 'sb_adult_blue') {
    return "bg-blue-100 text-blue-800";
  }
  if (levelValue.includes('roter') || levelValue.includes('red') ||
      levelValue === 'ski_adult_red' || levelValue === 'sb_adult_red') {
    return "bg-red-100 text-red-800";
  }
  if (levelValue.includes('schwarzer') || levelValue.includes('black') || 
      levelValue.includes('academy') ||
      levelValue === 'ski_adult_black' || levelValue === 'sb_adult_black') {
    return "bg-gray-800 text-gray-100";
  }
  
  // Legacy level colors
  switch (levelValue) {
    case "anfaenger":
      return "bg-gray-100 text-gray-800";
    case "blue_prince":
      return "bg-blue-100 text-blue-800";
    case "blue_king":
    case "blue_star":
      return "bg-blue-200 text-blue-900";
    case "red_prince":
      return "bg-red-100 text-red-800";
    case "red_king":
    case "red_star":
      return "bg-red-200 text-red-900";
    case "black_prince":
      return "bg-gray-700 text-gray-100";
    case "black_king":
      return "bg-gray-900 text-gray-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Check if current level is an upgrade from last season
 */
export function isLevelUpgrade(lastSeason: string | null, currentSeason: string | null): boolean {
  if (!lastSeason || !currentSeason) return false;
  const lastIndex = LEVEL_HIERARCHY.indexOf(lastSeason as LevelValue);
  const currentIndex = LEVEL_HIERARCHY.indexOf(currentSeason as LevelValue);
  return currentIndex > lastIndex;
}

// =============================================
// INSTRUCTOR DISCIPLINE UTILITIES
// =============================================

export function formatDisciplines(specialization: string | null): string {
  switch (specialization) {
    case "ski": return "Ski";
    case "snowboard": return "Snowboard";
    case "both": return "Ski & Snowboard";
    default: return "Nicht angegeben";
  }
}

export function formatInstructorLevel(level: string | null): string {
  switch (level) {
    case "hilfslehrer": return "Hilfslehrer";
    case "skilehrer": return "Skilehrer";
    case "schneesportlehrer": return "Schneesportlehrer";
    default: return level || "Nicht angegeben";
  }
}

export function getDisciplineBadges(specialization: string | null): { label: string; title: string }[] {
  const badges: { label: string; title: string }[] = [];
  if (specialization === "ski" || specialization === "both") {
    badges.push({ label: "K", title: "Ski" });
  }
  if (specialization === "snowboard" || specialization === "both") {
    badges.push({ label: "S", title: "Snowboard" });
  }
  return badges;
}

export function matchesCapabilityFilter(
  specialization: string | null,
  filter: string | null
): boolean {
  if (!filter) return true;
  return specialization === filter || specialization === "both";
}

export function isCrossDiscipline(
  instructorSpecialization: string | null,
  participantSport: string | null
): boolean {
  if (!participantSport) return false;
  if (instructorSpecialization === "both") return false;
  return instructorSpecialization !== participantSport;
}

// =============================================
// GROUP COURSE SKILL MAPPING (DEPRECATED)
// With direct FK relationship, this is no longer needed for exact matching
// Kept for backward compatibility with legacy level strings
// =============================================

/**
 * Map participant skill level to group course skill level
 * @deprecated Use direct skill_level_id matching instead of category mapping
 * This is used for backwards compatibility with legacy level strings only
 */
export function mapLevelToCourseSkill(participantLevel: string | null): string {
  if (!participantLevel) return "beginner";
  
  // Legacy level mapping (used when we only have legacy level strings)
  const normalizedLevel = participantLevel.toLowerCase();
  
  const levelMap: Record<string, string> = {
    // Beginners (Anfänger, no prior experience)
    anfaenger: "beginner",
    unknown: "beginner",
    snow_kids_village: "beginner",
    
    // Intermediate (Blue Star = "Blauer Star" course)
    blue_star: "intermediate",
    blue_king: "intermediate",
    
    // Advanced (Prince and higher levels)
    blue_prince: "beginner", // Still learning basics
    red_prince: "advanced",
    red_king: "advanced",
    red_star: "advanced",
    black_prince: "advanced",
    black_king: "advanced",
    intermediate: "intermediate",
    advanced: "advanced",
  };
  
  return levelMap[normalizedLevel] || "beginner";
}

/**
 * Convert legacy level string to new skill_level ID
 */
export function convertToSkillLevelId(
  legacyLevel: string | null, 
  discipline: Discipline = 'ski'
): string | null {
  return mapLegacyLevelToSkillLevelId(legacyLevel, discipline);
}

/**
 * Get effective level ID (handles both old and new formats)
 * Prioritizes new skill_level_id columns, falls back to legacy
 */
export function getEffectiveLevelId(
  skillLevelId: string | null,
  legacyLevel: string | null,
  discipline: Discipline = 'ski'
): string | null {
  // If we have a new skill_level_id, use it
  if (skillLevelId) return skillLevelId;
  
  // Otherwise, convert legacy level
  return mapLegacyLevelToSkillLevelId(legacyLevel, discipline);
}
