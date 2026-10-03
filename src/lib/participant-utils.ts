import { differenceInYears } from "date-fns";
import { getLevelBadgeColor, getLevelLabel as getBookingLevelLabel } from "@/lib/level-utils";

/** Unknown birth date (NULL, e.g. imported participants) yields null - never an invented age. */
export function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (isNaN(date.getTime())) return null;
  return differenceInYears(new Date(), date);
}

export function getAgeDisplay(age: number | null | undefined): string {
  if (age === null || age === undefined) return "Alter unbekannt";
  return age === 1 ? "1 Jahr" : `${age} Jahre`;
}

/**
 * Birth date to persist when editing an existing participant. An empty form field means
 * "unchanged": a known date is never erased and an unknown (NULL) date is never invented.
 */
export function resolveBirthDateForSave(
  formDate: Date | null | undefined,
  existing: string | null | undefined
): string | null {
  if (formDate && !isNaN(formDate.getTime())) {
    const y = formDate.getFullYear();
    const m = String(formDate.getMonth() + 1).padStart(2, "0");
    const d = String(formDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return existing ?? null;
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

export function getLevelInfo(level: string | null): { label: string; color: string } {
  return { label: getBookingLevelLabel(level), color: getLevelBadgeColor(level) };
}

export function getLevelLabel(level: string | null): string {
  return getLevelInfo(level).label;
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
