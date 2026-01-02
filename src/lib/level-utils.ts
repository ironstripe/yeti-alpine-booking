// Level hierarchy for ski/snowboard progression
export const LEVEL_HIERARCHY = [
  "anfaenger",
  "blue_prince",
  "blue_king",
  "red_prince",
  "red_king",
  "black_prince",
  "black_king",
] as const;

export type LevelValue = (typeof LEVEL_HIERARCHY)[number];

export const LEVEL_OPTIONS = [
  { value: "anfaenger", label: "Anfänger" },
  { value: "blue_prince", label: "Blue Prince" },
  { value: "blue_king", label: "Blue King" },
  { value: "red_prince", label: "Red Prince" },
  { value: "red_king", label: "Red King" },
  { value: "black_prince", label: "Black Prince" },
  { value: "black_king", label: "Black King" },
] as const;

export function getNextLevel(currentLevel: string | null): string | null {
  if (!currentLevel) return null;
  const currentIndex = LEVEL_HIERARCHY.indexOf(currentLevel as LevelValue);
  if (currentIndex === -1 || currentIndex === LEVEL_HIERARCHY.length - 1) {
    return null;
  }
  return LEVEL_HIERARCHY[currentIndex + 1];
}

export function getLevelLabel(levelValue: string | null): string {
  if (!levelValue) return "Nicht angegeben";
  const found = LEVEL_OPTIONS.find((l) => l.value === levelValue);
  return found?.label ?? levelValue;
}

export function getLevelBadgeColor(levelValue: string | null): string {
  switch (levelValue) {
    case "anfaenger":
      return "bg-gray-100 text-gray-800";
    case "blue_prince":
      return "bg-blue-100 text-blue-800";
    case "blue_king":
      return "bg-blue-200 text-blue-900";
    case "red_prince":
      return "bg-red-100 text-red-800";
    case "red_king":
      return "bg-red-200 text-red-900";
    case "black_prince":
      return "bg-gray-700 text-gray-100";
    case "black_king":
      return "bg-gray-900 text-gray-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function isLevelUpgrade(lastSeason: string | null, currentSeason: string | null): boolean {
  if (!lastSeason || !currentSeason) return false;
  const lastIndex = LEVEL_HIERARCHY.indexOf(lastSeason as LevelValue);
  const currentIndex = LEVEL_HIERARCHY.indexOf(currentSeason as LevelValue);
  return currentIndex > lastIndex;
}
