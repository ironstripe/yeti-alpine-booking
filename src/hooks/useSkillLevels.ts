import { useQuery } from '@tanstack/react-query';
import { 
  getSkillLevels, 
  getAllSkillLevels, 
  getSkillLevelById 
} from '@/lib/skill-levels';
import type { Discipline, TargetGroup, SkillLevel } from '@/types/skill-levels';

/**
 * Hook to fetch skill levels for a specific discipline and target group
 * NOTE: For children, use trainings (group_courses) directly instead of skill_levels
 * This is now primarily for adult self-assessment in private lessons
 */
export function useSkillLevels(discipline: Discipline, targetGroup: TargetGroup) {
  return useQuery({
    queryKey: ['skill-levels', discipline, targetGroup],
    queryFn: () => getSkillLevels(discipline, targetGroup),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (skill levels rarely change)
  });
}

/**
 * Hook to fetch all skill levels
 * NOTE: Primarily for adult levels now - children use trainings directly
 */
export function useAllSkillLevels() {
  return useQuery({
    queryKey: ['skill-levels', 'all'],
    queryFn: getAllSkillLevels,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Hook to fetch a single skill level by ID
 */
export function useSkillLevel(levelId: string | null) {
  return useQuery({
    queryKey: ['skill-level', levelId],
    queryFn: () => getSkillLevelById(levelId!),
    enabled: !!levelId,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Hook to fetch adult ski levels (for private lesson self-assessment)
 */
export function useAdultSkiLevels() {
  return useSkillLevels('ski', 'adult');
}

/**
 * Hook to fetch adult snowboard levels (for private lesson self-assessment)
 */
export function useAdultSnowboardLevels() {
  return useSkillLevels('snowboard', 'adult');
}

/**
 * Get skill levels grouped by discipline and target group
 * Primarily used for adult levels now
 */
export function useGroupedSkillLevels() {
  const { data: allLevels, ...rest } = useAllSkillLevels();

  const grouped = allLevels?.reduce((acc, level) => {
    const key = `${level.discipline}_${level.target_group}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(level);
    return acc;
  }, {} as Record<string, SkillLevel[]>);

  return {
    ...rest,
    data: allLevels,
    grouped: grouped || {},
    skiAdult: grouped?.['ski_adult'] || [],
    snowboardAdult: grouped?.['snowboard_adult'] || [],
  };
}
