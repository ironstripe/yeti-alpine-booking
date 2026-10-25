// Pure helpers for optional public instructor detail fields (languages, expertise).
// Only explicit stored values are exposed; nothing is inferred or defaulted.

export const PUBLIC_EXPERTISE_CATEGORIES = ["Ski", "Snowboard"] as const;
export type PublicExpertise = { category: string; name: string };

export function publicLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

type CapRow = { instructor_id: string; capabilities: { name?: unknown; category?: unknown } | null };

/** Groups canonical capability rows by instructor, keeping only Ski/Snowboard, deduped, stable sorted. */
export function publicExpertiseByInstructor(rows: CapRow[]): Map<string, PublicExpertise[]> {
  const map = new Map<string, PublicExpertise[]>();
  for (const r of rows ?? []) {
    const c = r?.capabilities;
    if (!c || typeof c.name !== "string" || typeof c.category !== "string") continue;
    if (!(PUBLIC_EXPERTISE_CATEGORIES as readonly string[]).includes(c.category)) continue;
    const name = c.name.trim();
    if (!name) continue;
    const list = map.get(r.instructor_id) ?? [];
    if (!list.some((e) => e.category === c.category && e.name === name)) list.push({ category: c.category, name });
    map.set(r.instructor_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      PUBLIC_EXPERTISE_CATEGORIES.indexOf(a.category as never) - PUBLIC_EXPERTISE_CATEGORIES.indexOf(b.category as never) ||
      a.name.localeCompare(b.name, "de"));
  }
  return map;
}
