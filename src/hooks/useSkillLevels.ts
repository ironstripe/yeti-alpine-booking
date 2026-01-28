import { useQuery } from '@tanstack/react-query';
import { 
  getSkillLevels, 
  getAllSkillLevels, 
  getLevelsForBooking,
  getSkillLevelById 
} from '@/lib/skill-levels';
import type { Discipline, TargetGroup, ParticipantWithLevels, SkillLevel } from '@/types/skill-levels';

/**
 * Hook to fetch skill levels for a specific discipline and target group
 */
export function useSkillLevels(discipline: Discipline, targetGroup: TargetGroup) {
  return useQuery({
    queryKey: ['skill-levels', discipline, targetGroup],
    queryFn: () => getSkillLevels(discipline, targetGroup),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (skill levels rarely change)
  });
}

/**
 * Hook to fetch all skill levels (for admin or comprehensive dropdowns)
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
 * Hook to get appropriate levels for a booking scenario
 */
export function useBookingLevels(
  participant: ParticipantWithLevels | null,
  discipline: Discipline,
  isGroupCourse: boolean
) {
  return useQuery({
    queryKey: ['booking-levels', participant?.id, discipline, isGroupCourse],
    queryFn: () => getLevelsForBooking(participant!, discipline, isGroupCourse),
    enabled: !!participant,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Hook to fetch child ski levels (commonly used in booking wizard)
 */
export function useChildSkiLevels() {
  return useSkillLevels('ski', 'child');
}

/**
 * Hook to fetch child snowboard levels
 */
export function useChildSnowboardLevels() {
  return useSkillLevels('snowboard', 'child');
}

/**
 * Hook to fetch adult ski levels
 */
export function useAdultSkiLevels() {
  return useSkillLevels('ski', 'adult');
}

/**
 * Hook to fetch adult snowboard levels
 */
export function useAdultSnowboardLevels() {
  return useSkillLevels('snowboard', 'adult');
}

/**
 * Get skill levels grouped by discipline and target group
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
    skiChild: grouped?.['ski_child'] || [],
    skiAdult: grouped?.['ski_adult'] || [],
    snowboardChild: grouped?.['snowboard_child'] || [],
    snowboardAdult: grouped?.['snowboard_adult'] || [],
  };
}
