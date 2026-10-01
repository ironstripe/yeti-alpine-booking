// Pure parser for the Booking-Corner instructor XLSX + photo ZIP (dry-run only).
// Never logs cell values. HR values end up only in `private`.
import * as XLSX from "npm:xlsx@0.18.5";
import { unzipSync } from "npm:fflate@0.8.2";

export const SHEETS = { profiles: "Lehrerdaten", assignments: "Zuordnungen", notes: "Importhinweise" } as const;

export const PROFILE_HEADERS = [
  "BookingCorner_ID", "Archiviert", "Name", "Vorname", "Geburtsdatum", "Nationalität", "Zivilstand", "seit",
  "Kinder", "Student/in", "Schüler/in", "Mobile CH (07...)", "Mobile (ohne 07...)", "Telefon (andere)", "Email",
  "Adresse", "PLZ", "Ort", "Land", "Bewilligung / Status", "Adresse (FL) bei Bewilligung", "AHV Nummer / PEID",
  "Aktiv heute", "Aktiv heute oder in Zukunft", "Aktiv von", "Aktiv bis", "Muttersprache", "Personnal ID",
  "Sichtbar auf Ihre Website", "Sichtbar bei der Auswahl", "Weiblich", "Internet Link", "Internet Texte",
  "Lohn pro Stunde/Monat (CHF)", "Lohn Verbindungskonto", "Bank", "Kontonummer/IBAN", "Bemerkungen", "Saison",
  "Ausbildung", "Kontaktaufnahme", "Jackennummer", "Jacke (neu)", "Hosennummer", "Hose (neu)", "Softshellnummer",
  "Softshell (neu)", "Sprachen", "Lehrergruppe", "Zusatzdaten_Erfassung", "Bilddatei", "Bildstatus",
] as const;

export const ASSIGNMENT_HEADERS = [
  "BookingCorner_ID", "Personnal ID", "Name", "Vorname", "Bereich", "Eintrag", "Quellwert / Erfassungsstatus",
] as const;

// Columns mapped to YETI fields or handled explicitly; everything else is kept privately as "unresolved".
const MAPPED = new Set([
  "BookingCorner_ID", "Archiviert", "Name", "Vorname", "Geburtsdatum", "Mobile CH (07...)", "Mobile (ohne 07...)",
  "Telefon (andere)", "Email", "Adresse", "PLZ", "Ort", "Land", "AHV Nummer / PEID", "Aktiv von", "Aktiv bis",
  "Sichtbar auf Ihre Website", "Weiblich", "Lohn pro Stunde/Monat (CHF)", "Bank", "Kontonummer/IBAN", "Bilddatei",
]);

export const LIMITS = { xlsxBytes: 10 * 1024 * 1024, zipBytes: 60 * 1024 * 1024, imageBytes: 10 * 1024 * 1024, zipTotalBytes: 250 * 1024 * 1024 };

export type Window = { from: string; until: string };
export type SourceProfile = {
  sourceId: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  gender: "female" | "male" | null;
  sourceWebsiteVisible: boolean | null;
  window: Window | null;
  hasCurrentWindow: boolean;
  photoFile: string | null;
  private: { wage_raw: string | null; bank_raw: string | null; ahv_raw: string | null; unresolved: Record<string, unknown> };
  checksum: string;
};
export type AssignmentRow = { area: string | null; entry: string | null; value: string | null; personnel_id: string | null };
export type PhotoInfo = { sourceId: string; entry: string; sha256: string; size: number; verified: boolean };
export type Season = { name: string; start: string; end: string };
export type PhotoIssue = { sourceId: string | null; code: string };
/** Known companion metadata files inside the photo ZIP; never counted as rejected images. */
export const ZIP_METADATA = new Set(["bildzuordnung.json", "pruefergebnis.json", "readme", "readme.txt", "readme.md", "import_readme.txt"]);
export const MANIFEST_NAME = "bildzuordnung.json";
const MANIFEST_MAX_BYTES = 5 * 1024 * 1024;
export type ParseResult = {
  errors: string[];
  warnings: string[];
  profiles: SourceProfile[];
  archivedCount: number;
  assignmentRows: number;
  assignmentOrphans: number;
  /** Every raw assignment row by BookingCorner_ID (unmapped, kept verbatim for private storage). */
  assignments: Record<string, AssignmentRow[]>;
  explicitAbsenceDates: number;
  notes: string[][];
  photos: PhotoInfo[];
  photoMissing: string[];
  zipRejected: string[];
  zipUnused: number;
  zipMetadata: string[];
  manifestEntries: number;
  photoIssues: PhotoIssue[];
  season: Season;
};

export const normHeader = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};
export function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = str(v)?.toLowerCase();
  if (s === "wahr" || s === "true" || s === "1") return true;
  if (s === "falsch" || s === "false" || s === "0") return false;
  return null;
}
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS returns local-midnight dates; round to nearest day to avoid TZ drift.
    return iso(new Date(Math.round(v.getTime() / 86400000) * 86400000));
  }
  if (typeof v === "number" && v > 0 && v < 100000) return iso(new Date(Math.round((v - 25569) * 86400000)));
  const s = str(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
export function normPhone(v: string | null): string | null {
  if (!v) return null;
  let d = v.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.slice(-9); // compare national significant number
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const src = typeof data === "string" ? new TextEncoder().encode(data) : data;
  // Copy into a fresh ArrayBuffer-backed view (full bytes, same digest) so it satisfies BufferSource typing.
  const bytes = new Uint8Array(new ArrayBuffer(src.byteLength));
  bytes.set(src);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export { sha256Hex };

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
}

export function isSafeZipPath(name: string): boolean {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return false;
  if (name.split("/").some((p) => p === ".." || p === ".")) return false;
  return true;
}
const baseName = (p: string) => p.split("/").pop()!.toLowerCase();
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Window overlaps the season range (inclusive ISO dates). */
export const overlapsSeason = (w: Window | null, s: Season) => !!w && w.from <= s.end && w.until >= s.start;

type ManifestEntry = { id: string; file: string; sha: string; bytes: number | null };
export function parseManifest(bytes: Uint8Array): ManifestEntry[] | null {
  try {
    const j = JSON.parse(new TextDecoder().decode(bytes));
    const arr: unknown[] = Array.isArray(j) ? j : (Object.values(j ?? {}).find(Array.isArray) as unknown[] | undefined) ?? [];
    if (!arr.length) return null;
    return arr.map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const b = Number(o.Bytes);
      return { id: str(o.BookingCorner_ID) ?? "", file: str(o.Bilddatei) ?? "", sha: (str(o.SHA256) ?? "").toLowerCase(), bytes: Number.isFinite(b) ? b : null };
    });
  } catch { return null; }
}

export async function parseImport(xlsxBytes: Uint8Array, zipBytes: Uint8Array | null, season: Season): Promise<ParseResult> {
  const r: ParseResult = {
    errors: [], warnings: [], profiles: [], archivedCount: 0, assignmentRows: 0, assignmentOrphans: 0, assignments: {},
    explicitAbsenceDates: 0, notes: [], photos: [], photoMissing: [], zipRejected: [], zipUnused: 0,
    zipMetadata: [], manifestEntries: 0, photoIssues: [], season,
  };
  if (xlsxBytes.length > LIMITS.xlsxBytes) { r.errors.push("xlsx_too_large"); return r; }
  if (!(xlsxBytes[0] === 0x50 && xlsxBytes[1] === 0x4b)) { r.errors.push("xlsx_invalid_format"); return r; }

  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(xlsxBytes, { type: "array", cellDates: true }); }
  catch { r.errors.push("xlsx_unreadable"); return r; }
  for (const s of Object.values(SHEETS)) if (!wb.Sheets[s]) r.errors.push(`sheet_missing:${s}`);
  if (r.errors.length) return r;

  // Profiles
  const pr = rows(wb.Sheets[SHEETS.profiles]);
  const header = (pr[0] ?? []).map(normHeader);
  const missing = PROFILE_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) { r.errors.push(`profile_headers_missing:${missing.join("|")}`); return r; }
  const col = (h: string) => header.indexOf(h);

  const seen = new Set<string>();
  const activeIds = new Set<string>();
  for (const row of pr.slice(1)) {
    const get = (h: string) => row[col(h)];
    const id = str(get("BookingCorner_ID"));
    if (!id) { if (row.some((c) => str(c))) r.errors.push("profile_without_id"); continue; }
    if (seen.has(id)) { r.errors.push(`duplicate_id:${id}`); continue; }
    seen.add(id);
    if (parseBool(get("Archiviert")) === true) { r.archivedCount++; continue; }
    activeIds.add(id);

    const from = parseDate(get("Aktiv von"));
    const until = parseDate(get("Aktiv bis"));
    const window = from && until && until >= from ? { from, until } : null;
    if ((get("Aktiv von") || get("Aktiv bis")) && !window) r.warnings.push(`window_invalid:${id}`);
    const bank = [str(get("Bank")), str(get("Kontonummer/IBAN"))].filter(Boolean).join(" | ") || null;
    const unresolved: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (!MAPPED.has(h)) {
        const v = row[i];
        const val = v instanceof Date ? parseDate(v) : str(v);
        if (val !== null) unresolved[h] = val;
      }
    });
    const w = parseBool(get("Weiblich"));
    const p: Omit<SourceProfile, "checksum"> = {
      sourceId: id,
      firstName: str(get("Vorname")),
      lastName: str(get("Name")),
      birthDate: parseDate(get("Geburtsdatum")),
      email: str(get("Email"))?.toLowerCase() ?? null,
      phone: str(get("Mobile CH (07...)")) ?? str(get("Mobile (ohne 07...)")) ?? str(get("Telefon (andere)")),
      street: str(get("Adresse")),
      zip: str(get("PLZ")),
      city: str(get("Ort")),
      country: str(get("Land")),
      gender: w === true ? "female" : w === false ? "male" : null,
      sourceWebsiteVisible: parseBool(get("Sichtbar auf Ihre Website")),
      window,
      hasCurrentWindow: overlapsSeason(window, season),
      photoFile: str(get("Bilddatei")),
      private: {
        wage_raw: str(get("Lohn pro Stunde/Monat (CHF)")),
        bank_raw: bank,
        ahv_raw: str(get("AHV Nummer / PEID")),
        unresolved,
      },
    };
    r.profiles.push({ ...p, checksum: await sha256Hex(JSON.stringify(p)) });
  }

  // Assignments
  const ar = rows(wb.Sheets[SHEETS.assignments]);
  const ah = (ar[0] ?? []).map(normHeader);
  const amiss = ASSIGNMENT_HEADERS.filter((h) => !ah.includes(h));
  if (amiss.length) r.errors.push(`assignment_headers_missing:${amiss.join("|")}`);
  else {
    const ai = (h: string) => ah.indexOf(h);
    for (const row of ar.slice(1)) {
      const id = str(row[ai("BookingCorner_ID")]);
      if (!id) continue;
      r.assignmentRows++;
      if (!activeIds.has(id)) { r.assignmentOrphans++; continue; }
      const cell = (h: string) => { const v = row[ai(h)]; return v instanceof Date ? parseDate(v) : str(v); };
      (r.assignments[id] ??= []).push({ area: cell("Bereich"), entry: cell("Eintrag"), value: cell("Quellwert / Erfassungsstatus"), personnel_id: cell("Personnal ID") });
      const area = str(row[ai("Bereich")])?.toLowerCase() ?? "";
      if (area.startsWith("ausnahme") && parseDate(row[ai("Quellwert / Erfassungsstatus")])) r.explicitAbsenceDates++;
    }
  }

  // Notes sheet: metadata only.
  r.notes = rows(wb.Sheets[SHEETS.notes]).map((row) => row.map((c) => str(c) ?? "")).filter((row) => row.some(Boolean)).slice(0, 50);

  // Photos
  const wanted = new Map<string, string>(); // basename -> sourceId
  const excelFile = new Map<string, string>(); // sourceId -> Excel Bilddatei basename
  for (const p of r.profiles) if (p.photoFile) { wanted.set(baseName(p.photoFile), p.sourceId); excelFile.set(p.sourceId, baseName(p.photoFile)); }
  if (zipBytes) {
    if (zipBytes.length > LIMITS.zipBytes) { r.errors.push("zip_too_large"); return r; }
    let total = 0;
    let files: Record<string, Uint8Array> = {};
    try {
      files = unzipSync(zipBytes, {
        filter: (f) => {
          if (f.name.endsWith("/")) return false;
          if (!isSafeZipPath(f.name)) { r.zipRejected.push("unsafe_path"); return false; }
          if (baseName(f.name).startsWith(".") || f.name.startsWith("__MACOSX/")) return false;
          if (ZIP_METADATA.has(baseName(f.name))) {
            r.zipMetadata.push(baseName(f.name));
            // Only the manifest is decompressed (bounded); other metadata is recognised, not read.
            if (baseName(f.name) !== MANIFEST_NAME) return false;
            if (f.originalSize > MANIFEST_MAX_BYTES) { r.zipRejected.push("manifest_too_large"); return false; }
            return true;
          }
          if (!/\.jpe?g$/i.test(f.name)) { r.zipRejected.push("not_jpeg_name"); return false; }
          if (f.originalSize > LIMITS.imageBytes) { r.zipRejected.push("image_too_large"); return false; }
          total += f.originalSize;
          if (total > LIMITS.zipTotalBytes) { r.zipRejected.push("zip_total_too_large"); return false; }
          return true;
        },
      });
    } catch { r.errors.push("zip_unreadable"); return r; }

    const manifestKeys = Object.keys(files).filter((n) => baseName(n) === MANIFEST_NAME);
    let manifest: Map<string, ManifestEntry> | null = null;
    if (manifestKeys.length !== 1) r.photoIssues.push({ sourceId: null, code: manifestKeys.length ? "manifest_duplicate_file" : "manifest_missing" });
    else {
      const entries = parseManifest(files[manifestKeys[0]]);
      if (!entries) r.photoIssues.push({ sourceId: null, code: "manifest_invalid" });
      else {
        r.manifestEntries = entries.length;
        manifest = new Map();
        const dup = new Set<string>();
        for (const e of entries) {
          if (!e.id) { r.photoIssues.push({ sourceId: null, code: "manifest_entry_without_id" }); continue; }
          if (manifest.has(e.id)) dup.add(e.id); else manifest.set(e.id, e);
        }
        for (const id of dup) if (excelFile.has(id)) r.photoIssues.push({ sourceId: id, code: "manifest_duplicate_id" });
        for (const id of dup) manifest.delete(id);
      }
    }
    for (const n of manifestKeys) delete files[n];

    const used = new Set<string>();
    for (const [name, bytes] of Object.entries(files)) {
      if (!isJpeg(bytes)) { r.zipRejected.push("not_jpeg_content"); continue; }
      const sid = wanted.get(baseName(name));
      if (!sid || used.has(sid)) { r.zipUnused++; continue; }
      used.add(sid);
      const sha = await sha256Hex(bytes);
      const issues: string[] = [];
      if (manifest) {
        const m = manifest.get(sid);
        if (!m) issues.push("manifest_entry_missing");
        else {
          if (baseName(m.file) !== excelFile.get(sid)) issues.push("manifest_excel_file_mismatch");
          if (baseName(m.file) !== baseName(name)) issues.push("manifest_zip_path_mismatch");
          if (m.sha !== sha) issues.push("sha256_mismatch");
          if (m.bytes !== null && m.bytes !== bytes.length) issues.push("size_mismatch");
        }
      }
      for (const code of issues) r.photoIssues.push({ sourceId: sid, code });
      r.photos.push({ sourceId: sid, entry: name, sha256: sha, size: bytes.length, verified: !!manifest && issues.length === 0 });
    }
    // Excel names a photo, manifest lists it, but the ZIP lacks the file.
    if (manifest) for (const [sid] of excelFile) if (!used.has(sid) && manifest.has(sid)) r.photoIssues.push({ sourceId: sid, code: "zip_file_missing" });
  }
  const withPhoto = new Set(r.photos.map((p) => p.sourceId));
  r.photoMissing = r.profiles.filter((p) => !withPhoto.has(p.sourceId)).map((p) => p.sourceId);
  return r;
}
