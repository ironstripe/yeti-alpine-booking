// Pure helpers for the Booking-Corner apply step (no I/O).
import type { SourceProfile } from "./parse.ts";

export const APPLY_FIELDS = ["first_name", "last_name", "email", "phone", "birth_date", "gender", "street", "zip", "city", "country"] as const;
export type ApplyField = typeof APPLY_FIELDS[number];

const COUNTRY: Record<string, string> = {
  ch: "CH", schweiz: "CH", switzerland: "CH", suisse: "CH",
  li: "LI", fl: "LI", liechtenstein: "LI",
  de: "DE", deutschland: "DE", germany: "DE",
  at: "AT", "österreich": "AT", oesterreich: "AT", austria: "AT",
  it: "IT", italien: "IT", italy: "IT", fr: "FR", frankreich: "FR", france: "FR",
  nl: "NL", niederlande: "NL", netherlands: "NL",
};
/** Explicit mapping only; unknown text becomes null (the raw value stays private). */
export const mapCountry = (v: string | null) => (v ? COUNTRY[v.trim().toLowerCase()] ?? null : null);

/** +41 XX XXX XX XX for Swiss numbers; other formats kept as given (never invented). */
export function formatPhone(v: string | null): string | null {
  if (!v) return null;
  let d = v.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (/^0\d{9}$/.test(d)) d = "+41" + d.slice(1);
  const m = d.match(/^\+41(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (m) return `+41 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return v.trim();
}

export type ApplyPayload = Record<ApplyField, string | null> & { windows: { from: string; until: string }[] };

export function buildPayload(p: SourceProfile): ApplyPayload {
  return {
    first_name: p.firstName, last_name: p.lastName, email: p.email, phone: formatPhone(p.phone),
    birth_date: p.birthDate, gender: p.gender, street: p.street, zip: p.zip, city: p.city, country: mapCountry(p.country),
    windows: p.hasCurrentWindow && p.window ? [p.window] : [],
  };
}

/** Current YETI values of every field the apply may overwrite (DB re-checks this at commit). */
export function snapshotOf(y: Record<string, unknown>): Record<ApplyField, string | null> {
  const out = {} as Record<ApplyField, string | null>;
  for (const f of APPLY_FIELDS) out[f] = y[f] === null || y[f] === undefined ? null : String(y[f]);
  return out;
}

export type Decision = "create" | "link" | "skip";
export type StagedRow = { source_id: string; classification: string; target_instructor_id: string | null };

/** Every row needs an explicit decision; links only to the reviewed target; targets distinct. */
export function validateDecisions(rows: StagedRow[], decisions: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const targets = new Set<string>();
  for (const r of rows) {
    const d = decisions[r.source_id];
    if (d !== "create" && d !== "link" && d !== "skip") { errs.push(`decision_missing:${r.source_id}`); continue; }
    if (d === "link") {
      if (!r.target_instructor_id) { errs.push(`link_without_target:${r.source_id}`); continue; }
      if (targets.has(r.target_instructor_id)) errs.push(`target_duplicate:${r.source_id}`);
      targets.add(r.target_instructor_id);
    }
    if ((r.classification === "update" || r.classification === "no_op") && d === "create") errs.push(`linked_cannot_create:${r.source_id}`);
  }
  const known = new Set(rows.map((r) => r.source_id));
  for (const k of Object.keys(decisions)) if (!known.has(k)) errs.push(`decision_unknown:${k}`);
  return errs;
}

/** Emails that appear on more than one source row that will be written. */
export function duplicateSourceEmails(payloads: { source_id: string; email: string | null }[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const p of payloads) if (p.email) seen.set(p.email.toLowerCase(), [...(seen.get(p.email.toLowerCase()) ?? []), p.source_id]);
  return new Set([...seen.values()].filter((v) => v.length > 1).flat());
}

/** Canonical JSON: object keys sorted recursively, array order preserved, null kept distinct. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
/** Semantic diff equality: JSONB key reordering is ignored; values, field names and item order are not. */
export const diffEqual = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);
