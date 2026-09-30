// Pure identity matching for the Booking-Corner preview. Never merges on names alone.
import { normPhone, type SourceProfile } from "./parse.ts";

export type YetiInstructor = {
  id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null;
  birth_date: string | null; street: string | null; zip: string | null; city: string | null; country: string | null;
};
export type Link = { source_id: string; instructor_id: string; source_checksum: string };
export type Classification = "create" | "update" | "no_op" | "candidate" | "review";
export type DiffEntry = { field: string; source: string | null; yeti: string | null };
export type Classified = {
  sourceId: string; classification: Classification; confidence: "high" | "medium" | "low";
  targetInstructorId: string | null; reasons: string[]; diff: DiffEntry[];
};

export const normName = (s: string | null) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const fullName = (f: string | null, l: string | null) => `${normName(f)}|${normName(l)}`;

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const FIELDS: Array<[keyof SourceProfile, keyof YetiInstructor]> = [
  ["firstName", "first_name"], ["lastName", "last_name"], ["email", "email"], ["phone", "phone"],
  ["birthDate", "birth_date"], ["street", "street"], ["zip", "zip"], ["city", "city"], ["country", "country"],
];
export function diffFields(p: SourceProfile, y: YetiInstructor): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const [s, t] of FIELDS) {
    const sv = (p[s] as string | null) ?? null;
    const tv = (y[t] as string | null) ?? null;
    if (sv === null) continue; // missing source value never overwrites
    const same = s === "phone" ? normPhone(sv) === normPhone(tv) : (sv ?? "").toLowerCase() === (tv ?? "").toLowerCase();
    if (!same) out.push({ field: String(t), source: sv, yeti: tv });
  }
  return out;
}

export function classify(profiles: SourceProfile[], yeti: YetiInstructor[], links: Link[]) {
  const byLink = new Map(links.map((l) => [l.source_id, l]));
  const linkedYeti = new Set(links.map((l) => l.instructor_id));
  const byId = new Map(yeti.map((y) => [y.id, y]));
  const touched = new Set<string>();
  const results: Classified[] = [];

  for (const p of profiles) {
    const link = byLink.get(p.sourceId);
    if (link && byId.has(link.instructor_id)) {
      const y = byId.get(link.instructor_id)!;
      touched.add(y.id);
      const same = link.source_checksum === p.checksum;
      results.push({
        sourceId: p.sourceId, classification: same ? "no_op" : "update", confidence: "high",
        targetInstructorId: y.id, reasons: ["source_link"], diff: same ? [] : diffFields(p, y),
      });
      continue;
    }
    const key = fullName(p.firstName, p.lastName);
    const pPhone = normPhone(p.phone);
    const exact = yeti.filter((y) => !linkedYeti.has(y.id) && fullName(y.first_name, y.last_name) === key);
    if (exact.length === 1) {
      const y = exact[0];
      touched.add(y.id);
      const phoneOk = !!pPhone && pPhone === normPhone(y.phone);
      const dobOk = !!p.birthDate && p.birthDate === y.birth_date;
      const dobConflict = !!p.birthDate && !!y.birth_date && p.birthDate !== y.birth_date;
      if (phoneOk && !dobConflict) {
        results.push({
          sourceId: p.sourceId, classification: "candidate", confidence: dobOk ? "high" : "medium",
          targetInstructorId: y.id, reasons: ["exact_name", "phone_match", ...(dobOk ? ["dob_match"] : [])], diff: diffFields(p, y),
        });
      } else {
        results.push({
          sourceId: p.sourceId, classification: "review", confidence: "low", targetInstructorId: y.id,
          reasons: ["exact_name", pPhone && y.phone ? "phone_differs" : "phone_missing", ...(dobConflict ? ["dob_differs"] : [])],
          diff: diffFields(p, y),
        });
      }
      continue;
    }
    if (exact.length > 1) {
      exact.forEach((y) => touched.add(y.id));
      results.push({ sourceId: p.sourceId, classification: "review", confidence: "low", targetInstructorId: null, reasons: ["multiple_name_matches"], diff: [] });
      continue;
    }
    const similar = yeti.filter((y) => {
      if (linkedYeti.has(y.id)) return false;
      const k = fullName(y.first_name, y.last_name);
      if (k === key) return false;
      if (levenshtein(k, key) <= 1) return true;
      return normName(y.last_name) === normName(p.lastName) && levenshtein(normName(y.first_name), normName(p.firstName)) <= 2;
    });
    if (similar.length) {
      similar.forEach((y) => touched.add(y.id));
      const y = similar[0];
      const phoneOk = !!pPhone && pPhone === normPhone(y.phone);
      results.push({
        sourceId: p.sourceId, classification: "review", confidence: "low", targetInstructorId: y.id,
        reasons: ["similar_name", ...(phoneOk ? ["phone_match"] : [])], diff: diffFields(p, y),
      });
      continue;
    }
    results.push({ sourceId: p.sourceId, classification: "create", confidence: "high", targetInstructorId: null, reasons: ["no_match"], diff: [] });
  }

  const yetiOnly = yeti.filter((y) => !touched.has(y.id) && !linkedYeti.has(y.id)).map((y) => y.id);
  return { results, yetiOnly };
}
