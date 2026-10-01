// Synthetic-only tests for the Booking-Corner apply helpers (no real HR data).
// Run: deno test --node-modules-dir=none --no-check --allow-net --allow-env supabase/functions/instructor-import-apply/apply.test.ts
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import jpeg from "npm:jpeg-js@0.4.4";
import * as XLSX from "npm:xlsx@0.18.5";
import { makeRendition, readOrientation, hasMetadataSegments } from "../_shared/bcImport/image.ts";
import { buildPayload, formatPhone, mapCountry, validateDecisions, duplicateSourceEmails, snapshotOf } from "../_shared/bcImport/apply.ts";
import { parseImport, PROFILE_HEADERS, ASSIGNMENT_HEADERS, type SourceProfile } from "../_shared/bcImport/parse.ts";

const SEASON = { name: "Winter 26/27", start: "2026-12-01", end: "2027-04-15" };

/** w x h JPEG, left half red / right half blue, optional EXIF APP1 with orientation + GPS pointer. */
function synthJpeg(w: number, h: number, orientation?: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; const left = x < w / 2;
    data[o] = left ? 255 : 0; data[o + 2] = left ? 0 : 255; data[o + 3] = 255;
  }
  const enc = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 95).data);
  if (!orientation) return enc;
  const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 2, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
    0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0,
    0x47, 0x50, 0x53, 0x5f, 0x34, 0x37, 0x2e, 0x31]; // "GPS_47.1"
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  const app1 = [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
  return new Uint8Array([...enc.slice(0, 2), ...app1, ...enc.slice(2)]);
}
const hasAscii = (b: Uint8Array, s: string) => new TextDecoder("latin1").decode(b).includes(s);

Deno.test("image: EXIF/GPS removed, orientation 6 applied (portrait), no upscaling", () => {
  const src = synthJpeg(80, 40, 6);
  assertEquals(readOrientation(src), 6);
  assert(hasMetadataSegments(src));
  assert(hasAscii(src, "GPS_47.1"));
  const r = makeRendition(src);
  assertEquals([r.width, r.height], [40, 80]); // rotated, not enlarged
  assert(!hasMetadataSegments(r.bytes));
  assert(!hasAscii(r.bytes, "Exif") && !hasAscii(r.bytes, "GPS_47.1"));
  // After 90° CW rotation the red (left) half becomes the top half.
  const d = jpeg.decode(r.bytes, { useTArray: true });
  const top = ((5 * 40) + 20) * 4, bottom = ((75 * 40) + 20) * 4;
  assert(d.data[top] > 200 && d.data[top + 2] < 60, "top is red");
  assert(d.data[bottom + 2] > 200 && d.data[bottom] < 60, "bottom is blue");
});

Deno.test("image: large photo downscaled to max edge, aspect kept; garbage rejected", () => {
  const r = makeRendition(synthJpeg(400, 200), 100);
  assertEquals([r.width, r.height], [100, 50]);
  assertThrows(() => makeRendition(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2])));
});

const profile = (o: Partial<SourceProfile> = {}): SourceProfile => ({
  sourceId: "1", firstName: "Test", lastName: "Muster", birthDate: null, email: null, phone: null, street: null, zip: null,
  city: null, country: null, gender: null, sourceWebsiteVisible: false, window: null, hasCurrentWindow: false, photoFile: null,
  private: { wage_raw: null, bank_raw: null, ahv_raw: null, unresolved: {} }, checksum: "x", ...o,
});

Deno.test("payload: missing email/phone/pay/country stay empty; no wage, skills or website flag written", () => {
  const p = buildPayload(profile());
  assertEquals([p.email, p.phone, p.country, p.birth_date], [null, null, null, null]);
  assertEquals(p.windows, []);
  for (const k of ["hourly_rate", "languages", "specialization", "show_on_website", "notes"]) assert(!(k in p));
});

Deno.test("payload: window only when it overlaps the season; phone/country explicit mapping", () => {
  const w = { from: "2026-12-01", until: "2027-04-15" };
  assertEquals(buildPayload(profile({ window: w, hasCurrentWindow: true })).windows, [w]);
  assertEquals(buildPayload(profile({ window: { from: "2020-12-01", until: "2021-04-15" }, hasCurrentWindow: false })).windows, []);
  assertEquals(formatPhone("079 123 45 67"), "+41 79 123 45 67");
  assertEquals(formatPhone("0041791234567"), "+41 79 123 45 67");
  assertEquals(formatPhone("+423 777 12 34"), "+423 777 12 34");
  assertEquals([mapCountry("Schweiz"), mapCountry("Liechtenstein"), mapCountry("Atlantis"), mapCountry(null)], ["CH", "LI", null, null]);
});

Deno.test("decisions: explicit per row, link only to reviewed target, distinct targets", () => {
  const rows = [
    { source_id: "1", classification: "create", target_instructor_id: null },
    { source_id: "2", classification: "candidate", target_instructor_id: "t1" },
    { source_id: "3", classification: "review", target_instructor_id: "t1" },
  ];
  assertEquals(validateDecisions(rows, { "1": "create", "2": "link", "3": "skip" }), []);
  assert(validateDecisions(rows, { "1": "create", "2": "link" }).includes("decision_missing:3"));
  assert(validateDecisions(rows, { "1": "link", "2": "link", "3": "skip" }).includes("link_without_target:1"));
  assert(validateDecisions(rows, { "1": "create", "2": "link", "3": "link" }).includes("target_duplicate:3"));
  assert(validateDecisions(rows, { "1": "create", "2": "create", "3": "create", "9": "create" }).includes("decision_unknown:9"));
});

Deno.test("email uniqueness inside the source and snapshot shape", () => {
  const d = duplicateSourceEmails([{ source_id: "1", email: "A@x.invalid" }, { source_id: "2", email: "a@x.invalid" }, { source_id: "3", email: null }]);
  assertEquals([...d].sort(), ["1", "2"]);
  const s = snapshotOf({ first_name: "A", birth_date: "2000-01-02", email: null });
  assertEquals([s.first_name, s.birth_date, s.email, s.city], ["A", "2000-01-02", null, null]);
});

Deno.test("parse: every assignment row kept per ID (unmapped), orphans not attached", async () => {
  const wb = XLSX.utils.book_new();
  const p = (id: string) => PROFILE_HEADERS.map((h) => ({ BookingCorner_ID: id, Archiviert: "Falsch", Name: "M" + id, Vorname: "T" } as Record<string, string>)[h] ?? null);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...PROFILE_HEADERS], p("1"), p("2")]), "Lehrerdaten");
  const a = (id: string, area: string, n: number, v: string) => ASSIGNMENT_HEADERS.map((h) => ({ BookingCorner_ID: id, Bereich: area, Eintrag: n, "Quellwert / Erfassungsstatus": v } as Record<string, unknown>)[h] ?? null);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...ASSIGNMENT_HEADERS], a("1", "Sprachen", 1, "Deutsch"), a("1", "Treffpunkt", 2, "Talstation"), a("2", "Kompetenzen", 1, "Ski"), a("9", "Sprachen", 1, "Englisch")]), "Zuordnungen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["YETI | Lehrerübernahme", "", ""]]), "Importhinweise");
  const r = await parseImport(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), null, SEASON);
  assertEquals(r.errors, []);
  assertEquals(r.assignmentRows, 4);
  assertEquals(r.assignmentOrphans, 1);
  assertEquals(r.assignments["1"].map((x) => [x.area, x.entry, x.value]), [["Sprachen", "1", "Deutsch"], ["Treffpunkt", "2", "Talstation"]]);
  assertEquals(r.assignments["2"].length, 1);
  assertEquals(r.assignments["9"], undefined);
});
