import { differenceInYears } from "date-fns";

export type Discipline = 'ski' | 'snowboard';
export type TargetGroup = 'child' | 'adult';
export type SkillColor = 'green' | 'blue' | 'red' | 'black';
export type AdultSelfAssessment = 'green' | 'blue' | 'red' | 'black';

/**
 * Skill level - NOW ONLY USED FOR ADULT SELF-ASSESSMENT IN PRIVATE LESSONS
 * Children's levels are defined by the trainings (group_courses) themselves
 */
export interface SkillLevel {
  id: string;
  name: string;
  discipline: Discipline;
  target_group: TargetGroup;
  color: SkillColor | null;
  sort_order: number;
  description: string | null;
  short_description: string | null;
  next_level_id: string | null;
  min_age: number | null;
  max_age: number | null;
  is_active: boolean;
  created_at?: string;
}

/**
 * Participant with training-based levels for children and self-assessment for adults
 */
export interface ParticipantWithLevels {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  // NEW: Training-based levels for children (FK to group_courses)
  current_ski_training_id: string | null;
  current_snowboard_training_id: string | null;
  // Adult self-assessment (only for private lessons)
  self_assessed_ski_level: AdultSelfAssessment | null;
  self_assessed_snowboard_level: AdultSelfAssessment | null;
  // Legacy fields (kept for backward compatibility during migration)
  current_ski_level_id?: string | null;
  current_snowboard_level_id?: string | null;
  level_current_season?: string | null;
  level_last_season?: string | null;
  sport?: string | null;
}

export interface ParticipantLevelHistory {
  id: string;
  participant_id: string;
  skill_level_id: string;
  discipline: Discipline;
  season: string;
  assessed_at: string;
  assessed_by: string | null;
  source: 'booking' | 'assessment' | 'manual' | 'migration';
  notes: string | null;
  created_at: string;
}

/**
 * Determine if participant is a child (< 16 years)
 */
export function isChild(birthDate: string | null): boolean {
  if (!birthDate) return true; // Default to child if no birth date
  const age = differenceInYears(new Date(), new Date(birthDate));
  return age < 16;
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  return differenceInYears(new Date(), new Date(birthDate));
}

/**
 * Get display color class for skill level color
 */
export function getSkillColorClass(color: SkillColor | null): string {
  switch (color) {
    case 'green': return 'bg-green-500';
    case 'blue': return 'bg-blue-500';
    case 'red': return 'bg-red-500';
    case 'black': return 'bg-gray-900';
    default: return 'bg-gray-300';
  }
}

/**
 * Get badge variant class for skill level color
 */
export function getSkillBadgeClass(color: SkillColor | null): string {
  switch (color) {
    case 'green': return 'bg-green-100 text-green-800 border-green-300';
    case 'blue': return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'red': return 'bg-red-100 text-red-800 border-red-300';
    case 'black': return 'bg-gray-800 text-gray-100 border-gray-600';
    default: return 'bg-muted text-muted-foreground';
  }
}

/**
 * Adult self-assessment options - ONLY FOR PRIVATE LESSONS
 * Children use trainings (group_courses) directly for their levels
 */
export const ADULT_LEVEL_OPTIONS: { value: AdultSelfAssessment; label: string; description: string }[] = [
  { value: 'green', label: 'Anfänger', description: 'Kompletter Anfänger, keine Erfahrung' },
  { value: 'blue', label: 'Fortgeschritten', description: 'Fährt blaue Pisten sicher' },
  { value: 'red', label: 'Geübt', description: 'Fährt rote Pisten sicher' },
  { value: 'black', label: 'Experte', description: 'Fährt schwarze Pisten sicher' },
];
