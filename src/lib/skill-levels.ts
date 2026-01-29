import { supabase } from "@/integrations/supabase/client";
import type { SkillLevel, Discipline, TargetGroup } from "@/types/skill-levels";

/**
 * Get all skill levels for a specific discipline and target group
 * NOTE: For children, trainings (group_courses) ARE the skill levels
 * This function is primarily for adult self-assessment levels
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
 * NOTE: Primarily for adult levels - children use trainings directly
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
 * Get display label for a skill level ID (for quick lookup without DB call)
 * NOTE: For children, the training name IS the level - use training.name directly
 * This is primarily for adult self-assessment levels
 */
export function getSkillLevelLabel(levelId: string | null): string {
  if (!levelId) return 'Nicht angegeben';

  const labels: Record<string, string> = {
    // Adults - these are the only ones still using skill_levels table
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

/**
 * Map legacy level string to new skill level ID
 * @deprecated - Legacy levels should be migrated to training IDs for children
 */
export function mapLegacyLevelToSkillLevelId(
  legacyLevel: string | null,
  discipline: Discipline = 'ski'
): string | null {
  if (!legacyLevel) return null;

  // This mapping is deprecated - children now use training IDs directly
  // Kept only for backward compatibility during migration
  const mapping: Record<string, { ski: string; snowboard: string }> = {
    'anfaenger': { ski: 'ski_snow_kids', snowboard: 'sb_snow_kids' },
    'snow_kids_village': { ski: 'ski_snow_kids', snowboard: 'sb_snow_kids' },
    'blue_prince': { ski: 'ski_blauer_prinz', snowboard: 'sb_blauer_prinz' },
    'blue_star': { ski: 'ski_blauer_star', snowboard: 'sb_blauer_star' },
    'blue_king': { ski: 'ski_blauer_koenig', snowboard: 'sb_blauer_koenig' },
    'red_prince': { ski: 'ski_roter_prinz', snowboard: 'sb_roter_prinz' },
    'red_star': { ski: 'ski_roter_star', snowboard: 'sb_roter_star' },
    'red_king': { ski: 'ski_roter_koenig', snowboard: 'sb_roter_koenig' },
    'black_prince': { ski: 'ski_schwarzer_prinz', snowboard: 'sb_roter_star' },
    'black_king': { ski: 'ski_academy', snowboard: 'sb_academy' },
  };

  const levelMapping = mapping[legacyLevel];
  if (!levelMapping) return null;

  return discipline === 'ski' ? levelMapping.ski : levelMapping.snowboard;
}
