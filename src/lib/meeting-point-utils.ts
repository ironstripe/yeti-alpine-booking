import { Hotel, Mountain, Ticket, MapPin, Snowflake } from "lucide-react";

export const MEETING_POINTS = [
  {
    id: "sammelplatz_gorfion",
    name: "Sammelplatz Gorfion",
    icon: Hotel,
    description: "Vor dem Haupteingang Hotel Gorfion",
    location: "47.1234, 9.5678",
  },
  {
    id: "malbipark",
    name: "Malbipark",
    icon: Mountain,
    description: "Beim Zauberteppich",
    location: "47.1256, 9.5701",
  },
  {
    id: "kasse_taeli",
    name: "Kasse Täli",
    icon: Ticket,
    description: "Talstation Sesselbahn",
    location: "47.1189, 9.5623",
  },
  {
    id: "schneeflucht",
    name: "Schneeflucht",
    icon: Snowflake,
    description: "Bergstation Schneeflucht",
    location: "47.1301, 9.5745",
  },
];

// Levels that are considered "beginner" and locked to Sammelplatz Gorfion
export const BEGINNER_LEVELS = ["anfaenger", null, undefined, ""];

// Levels that unlock all meeting points (Blue Prince and above)
export const ADVANCED_LEVELS = [
  "snow_kids_village",
  "blue_prince",
  "blue_star",
  "blue_king",
  "red_prince",
  "red_star",
  "red_king",
];

export function isBeginnerLevel(level: string | null | undefined): boolean {
  return !level || BEGINNER_LEVELS.includes(level as string);
}

export function canSelectAlternativeMeetingPoint(levels: (string | null)[]): boolean {
  // If any participant has an advanced level, allow alternative meeting points
  return levels.some((level) => ADVANCED_LEVELS.includes(level as string));
}

export function getMeetingPointById(id: string | null) {
  return MEETING_POINTS.find((p) => p.id === id) || MEETING_POINTS[0];
}
