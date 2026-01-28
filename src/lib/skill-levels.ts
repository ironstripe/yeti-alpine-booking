import { supabase } from "@/integrations/supabase/client";
import type { SkillLevel, Discipline, TargetGroup, ParticipantWithLevels } from "@/types/skill-levels";
import { isChild } from "@/types/skill-levels";

/**
 * Get all skill levels for a specific discipline and target group
 */
export async function getSkillLevels(
  discipline: Discipline,
  targetGroup: TargetGroup
): Promise<SkillLevel[]> {
  const { data, error } = await supabase
    .from('skill_levels')
    .select('*')
    .eq('discipline', discipline)
    .eq('target_group', targetGroup)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as SkillLevel[];
}

/**
 * Get all skill levels (for dropdowns that need all options)
 */
export async function getAllSkillLevels(): Promise<SkillLevel[]> {
  const { data, error } = await supabase
    .from('skill_levels')
    .select('*')
    .eq('is_active', true)
    .order('discipline', { ascending: true })
    .order('target_group', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as SkillLevel[];
}

/**
 * Get a single skill level by ID
 */
export async function getSkillLevelById(id: string): Promise<SkillLevel | null> {
  const { data, error } = await supabase
    .from('skill_levels')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as SkillLevel | null;
}

/**
 * Get suggested next level for a participant based on current level
 */
export async function getSuggestedLevel(
  currentLevelId: string | null,
  discipline: Discipline
): Promise<{ suggested: SkillLevel | null; fallback: SkillLevel | null }> {
  if (!currentLevelId) {
    return { suggested: null, fallback: null };
  }

  // Get current level
  const { data: currentLevel, error } = await supabase
    .from('skill_levels')
    .select('*')
    .eq('id', currentLevelId)
    .single();

  if (error || !currentLevel) {
    return { suggested: null, fallback: null };
  }

  // If next level exists, get it
  if (currentLevel.next_level_id) {
    const { data: nextLevel, error: nextError } = await supabase
      .from('skill_levels')
      .select('*')
      .eq('id', currentLevel.next_level_id)
      .single();

    if (!nextError && nextLevel) {
      return {
        suggested: nextLevel as SkillLevel,
        fallback: currentLevel as SkillLevel,
      };
    }
  }

  // Already at highest level or no next level defined
  return {
    suggested: currentLevel as SkillLevel,
    fallback: null,
  };
}

/**
 * Get appropriate levels for booking based on participant and course type
 */
export async function getLevelsForBooking(
  participant: ParticipantWithLevels,
  discipline: Discipline,
  isGroupCourse: boolean
): Promise<{
  availableLevels: SkillLevel[];
  suggestedLevel: SkillLevel | null;
  fallbackLevel: SkillLevel | null;
}> {
  const isChildParticipant = isChild(participant.birth_date);

  // Adults can only book private lessons, use adult levels
  if (!isChildParticipant) {
    const levels = await getSkillLevels(discipline, 'adult');
    const selfAssessed = discipline === 'ski' 
      ? participant.self_assessed_ski_level 
      : participant.self_assessed_snowboard_level;
    
    const suggestedLevel = selfAssessed 
      ? levels.find(l => l.color === selfAssessed) || levels[0]
      : levels[0];

    return {
      availableLevels: levels,
      suggestedLevel: suggestedLevel || null,
      fallbackLevel: null,
    };
  }

  // Children: use child levels for both group and private
  const levels = await getSkillLevels(discipline, 'child');
  const currentLevelId = discipline === 'ski'
    ? participant.current_ski_level_id
    : participant.current_snowboard_level_id;

  const { suggested, fallback } = await getSuggestedLevel(currentLevelId, discipline);

  return {
    availableLevels: levels,
    suggestedLevel: suggested,
    fallbackLevel: fallback,
  };
}

/**
 * Map new skill level ID to group course skill level (beginner/intermediate/advanced)
 * Used for matching participants to appropriate group courses
 */
export function mapSkillLevelToGroupCourseSkill(levelId: string | null): string {
  if (!levelId) return 'beginner';

  const beginnerLevels = [
    'ski_windel_wedel', 'ski_snow_kids', 'ski_blauer_prinz',
    'sb_snow_kids', 'sb_blauer_prinz',
    'ski_adult_green', 'sb_adult_green'
  ];
  
  const intermediateLevels = [
    'ski_blauer_koenig', 'ski_blauer_star',
    'sb_blauer_koenig', 'sb_blauer_star',
    'ski_adult_blue', 'sb_adult_blue'
  ];
  
  if (beginnerLevels.includes(levelId)) return 'beginner';
  if (intermediateLevels.includes(levelId)) return 'intermediate';
  return 'advanced';
}

/**
 * Map legacy level string to new skill level ID
 * Used for backward compatibility with existing data
 */
export function mapLegacyLevelToSkillLevelId(
  legacyLevel: string | null,
  discipline: Discipline = 'ski'
): string | null {
  if (!legacyLevel) return null;

  const mapping: Record<string, { ski: string; snowboard: string }> = {
    'anfaenger': { ski: 'ski_snow_kids', snowboard: 'sb_snow_kids' },
    'snow_kids_village': { ski: 'ski_snow_kids', snowboard: 'sb_snow_kids' },
    'blue_prince': { ski: 'ski_blauer_prinz', snowboard: 'sb_blauer_prinz' },
    'blue_star': { ski: 'ski_blauer_star', snowboard: 'sb_blauer_star' },
    'blue_king': { ski: 'ski_blauer_koenig', snowboard: 'sb_blauer_koenig' },
    'red_prince': { ski: 'ski_roter_prinz', snowboard: 'sb_roter_prinz' },
    'red_star': { ski: 'ski_roter_star', snowboard: 'sb_roter_star' },
    'red_king': { ski: 'ski_roter_koenig', snowboard: 'sb_roter_koenig' },
    'black_prince': { ski: 'ski_schwarzer_prinz', snowboard: 'sb_roter_star' }, // No direct equivalent for snowboard
    'black_king': { ski: 'ski_academy', snowboard: 'sb_academy' },
  };

  const levelMapping = mapping[legacyLevel];
  if (!levelMapping) return null;

  return discipline === 'ski' ? levelMapping.ski : levelMapping.snowboard;
}

/**
 * Get display label for a skill level ID (for quick lookup without DB call)
 * Returns the ID itself if not found in the quick lookup table
 */
export function getSkillLevelLabel(levelId: string | null): string {
  if (!levelId) return 'Nicht angegeben';

  const labels: Record<string, string> = {
    // Ski Children
    'ski_windel_wedel': 'Windel Wedel Kurs',
    'ski_snow_kids': 'Swiss Snow Kids',
    'ski_blauer_prinz': 'Blauer Prinz/Prinzessin',
    'ski_blauer_koenig': 'Blauer König/Königin',
    'ski_blauer_star': 'Blauer Star',
    'ski_roter_prinz': 'Roter Prinz/Prinzessin',
    'ski_roter_koenig': 'Roter König/Königin',
    'ski_roter_star': 'Roter Star',
    'ski_schwarzer_prinz': 'Schwarzer Prinz/Prinzessin',
    'ski_academy': 'Academy Ski',
    // Snowboard Children
    'sb_snow_kids': 'Swiss Snow Kids',
    'sb_blauer_prinz': 'Blauer Prinz/Prinzessin',
    'sb_blauer_koenig': 'Blauer König/Königin',
    'sb_blauer_star': 'Blauer Star',
    'sb_roter_prinz': 'Roter Prinz/Prinzessin',
    'sb_roter_koenig': 'Roter König/Königin',
    'sb_roter_star': 'Roter Star',
    'sb_academy': 'Academy Snowboard',
    // Adults
    'ski_adult_green': 'Anfänger',
    'ski_adult_blue': 'Fortgeschritten',
    'ski_adult_red': 'Geübt',
    'ski_adult_black': 'Experte',
    'sb_adult_green': 'Anfänger',
    'sb_adult_blue': 'Fortgeschritten',
    'sb_adult_red': 'Geübt',
    'sb_adult_black': 'Experte',
  };

  return labels[levelId] || levelId;
}
