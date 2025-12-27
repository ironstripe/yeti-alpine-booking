import { differenceInYears } from "date-fns";

export function calculateAge(birthDate: string): number {
  return differenceInYears(new Date(), new Date(birthDate));
}

export function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName ? lastName.charAt(0).toUpperCase() : "";
  return first + last;
}

export function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-rose-500",
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export const LEVEL_OPTIONS = [
  { value: "snow_kids_village", label: "Snow Kids Village", color: "bg-sky-200 text-sky-800" },
  { value: "blue_prince", label: "Blue Prince", color: "bg-blue-200 text-blue-800" },
  { value: "blue_star", label: "Blue Star", color: "bg-blue-300 text-blue-900" },
  { value: "blue_king", label: "Blue King", color: "bg-blue-400 text-blue-900" },
  { value: "red_prince", label: "Red Prince", color: "bg-red-200 text-red-800" },
  { value: "red_star", label: "Red Star", color: "bg-red-300 text-red-900" },
  { value: "red_king", label: "Red King", color: "bg-red-400 text-red-900" },
] as const;

export function getLevelInfo(level: string | null): { label: string; color: string } {
  const found = LEVEL_OPTIONS.find((l) => l.value === level);
  return found || { label: level || "Nicht angegeben", color: "bg-muted text-muted-foreground" };
}

export const COUNTRY_FLAGS: Record<string, string> = {
  LI: "🇱🇮",
  CH: "🇨🇭",
  AT: "🇦🇹",
  DE: "🇩🇪",
};

export const LANGUAGE_OPTIONS: Record<string, { label: string; flag: string }> = {
  de: { label: "Deutsch", flag: "🇩🇪" },
  en: { label: "English", flag: "🇬🇧" },
  fr: { label: "Français", flag: "🇫🇷" },
  it: { label: "Italiano", flag: "🇮🇹" },
};
