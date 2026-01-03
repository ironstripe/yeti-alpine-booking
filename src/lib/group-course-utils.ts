import { differenceInYears } from "date-fns";
import { LEVEL_HIERARCHY, type LevelValue } from "./level-utils";

// Group course types
export type GroupCourseType = "windel_wedelkurs" | "kids_village" | "standard" | null;

export interface GroupCourseRecommendation {
  courseType: GroupCourseType;
  times: {
    morning: string;
    afternoon: string | null;
  } | null;
  hint: string | null;
  isAdultOnly: boolean;
  productType: string | null;
}

// Time blocks for different course types
export const GROUP_COURSE_TIMES = {
  windel_wedelkurs: {
    morning: "10:00 - 12:00",
    afternoon: null,
  },
  kids_village: {
    morning: "10:00 - 12:00",
    afternoon: "14:00 - 16:00",
  },
  standard: {
    morning: "10:00 - 12:00",
    afternoon: "14:00 - 16:00",
  },
};

/**
 * Check if a level is at or above a threshold
 */
function isLevelAtOrAbove(level: string | null, threshold: LevelValue): boolean {
  if (!level) return false;
  const levelIndex = LEVEL_HIERARCHY.indexOf(level as LevelValue);
  const thresholdIndex = LEVEL_HIERARCHY.indexOf(threshold);
  if (levelIndex === -1 || thresholdIndex === -1) return false;
  return levelIndex >= thresholdIndex;
}

/**
 * Calculate age from birth date
 */
export function getAge(birthDate: string): number {
  return differenceInYears(new Date(), new Date(birthDate));
}

/**
 * Get recommended group course based on participant age and level
 */
export function getRecommendedGroupCourse(
  age: number,
  level: string | null
): GroupCourseRecommendation {
  // Adults (16+): No group courses available
  if (age >= 16) {
    return {
      courseType: null,
      times: null,
      hint: "Nur Privatstunden verfügbar",
      isAdultOnly: true,
      productType: null,
    };
  }

  // 3-4 years: Windel-Wedelkurs only (2 hours morning)
  if (age >= 3 && age < 4) {
    return {
      courseType: "windel_wedelkurs",
      times: GROUP_COURSE_TIMES.windel_wedelkurs,
      hint: "Für Kleinkinder nur 2h vormittags",
      isAdultOnly: false,
      productType: "group_toddler",
    };
  }

  // 4+ years, total beginner (no level or "anfaenger"): Swiss Snow Kids Village
  if (age >= 4 && (!level || level === "anfaenger")) {
    return {
      courseType: "kids_village",
      times: GROUP_COURSE_TIMES.kids_village,
      hint: null,
      isAdultOnly: false,
      productType: "group_beginner",
    };
  }

  // Has "blue_prince" or higher: Standard group courses
  if (isLevelAtOrAbove(level, "blue_prince")) {
    return {
      courseType: "standard",
      times: GROUP_COURSE_TIMES.standard,
      hint: "Kann Pizza, Kurven und Bremsen",
      isAdultOnly: false,
      productType: "group",
    };
  }

  // Default: Standard group with full day
  return {
    courseType: "standard",
    times: GROUP_COURSE_TIMES.standard,
    hint: null,
    isAdultOnly: false,
    productType: "group",
  };
}

/**
 * Get combined recommendation for multiple participants
 * Returns the most restrictive recommendation (e.g., if any is adult-only, all are)
 */
export function getGroupRecommendationForParticipants(
  participants: Array<{ birth_date: string; level_current_season: string | null }>
): GroupCourseRecommendation & { hasAdults: boolean; hasToddlers: boolean } {
  let hasAdults = false;
  let hasToddlers = false;
  let mostRestrictiveCourse: GroupCourseType = "standard";
  let hints: string[] = [];

  for (const p of participants) {
    const age = getAge(p.birth_date);
    const recommendation = getRecommendedGroupCourse(age, p.level_current_season);

    if (recommendation.isAdultOnly) {
      hasAdults = true;
    }

    if (recommendation.courseType === "windel_wedelkurs") {
      hasToddlers = true;
      mostRestrictiveCourse = "windel_wedelkurs";
    }

    if (recommendation.hint && !hints.includes(recommendation.hint)) {
      hints.push(recommendation.hint);
    }
  }

  // If any adults, group booking not possible
  if (hasAdults) {
    return {
      courseType: null,
      times: null,
      hint: "Erwachsene Teilnehmer: Nur Privatstunden verfügbar",
      isAdultOnly: true,
      productType: null,
      hasAdults,
      hasToddlers,
    };
  }

  // If toddlers present, restrict to windel course
  if (hasToddlers) {
    return {
      courseType: "windel_wedelkurs",
      times: GROUP_COURSE_TIMES.windel_wedelkurs,
      hint: "Teilnehmer 3-4J: Nur Windel-Wedelkurs (10:00-12:00)",
      isAdultOnly: false,
      productType: "group_toddler",
      hasAdults,
      hasToddlers,
    };
  }

  // Standard recommendation
  return {
    courseType: mostRestrictiveCourse,
    times: GROUP_COURSE_TIMES[mostRestrictiveCourse] || GROUP_COURSE_TIMES.standard,
    hint: hints.length > 0 ? hints.join(" • ") : null,
    isAdultOnly: false,
    productType: mostRestrictiveCourse === "windel_wedelkurs" ? "group_toddler" : "group",
    hasAdults,
    hasToddlers,
  };
}

/**
 * Format group course time display
 */
export function formatGroupTimes(courseType: GroupCourseType): string {
  if (!courseType) return "";
  const times = GROUP_COURSE_TIMES[courseType];
  if (!times) return "";
  
  if (times.afternoon) {
    return `${times.morning} + ${times.afternoon}`;
  }
  return times.morning;
}
