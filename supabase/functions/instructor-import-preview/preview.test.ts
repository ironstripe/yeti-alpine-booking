// Synthetic-only tests (no real HR data).
// Run: deno test --node-modules-dir=none --no-check --allow-net --allow-env supabase/functions/instructor-import-preview/preview.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { zipSync } from "npm:fflate@0.8.2";
import { parseImport, PROFILE_HEADERS, ASSIGNMENT_HEADERS, isSafeZipPath, parseBool, normHeader } from "./parse.ts";
import { classify, type YetiInstructor } from "./match.ts";

const TODAY = "2026-09-30";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

type P = Record<string, unknown>;
function book(profiles: P[], assignments: P[] = [], opts: { dropSheet?: string; newlineHeader?: boolean } = {}) {
  const wb = XLSX.utils.book_new();
  const headers = PROFILE_HEADERS.map((h) => (opts.newlineHeader && h === "Sichtbar bei der Auswahl" ? "Sichtbar bei der \nAuswahl" : h));
  const prof = [headers, ...profiles.map((p) => PROFILE_HEADERS.map((h) => p[h] ?? null))];
  if (opts.dropSheet !== "Lehrerdaten") XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prof), "Lehrerdaten");
  const asg = [[...ASSIGNMENT_HEADERS], ...assignments.map((a) => ASSIGNMENT_HEADERS.map((h) => a[h] ?? null))];
  if (opts.dropSheet !== "Zuordnungen") XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(asg), "Zuordnungen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["YETI | Lehrerübernahme", "", ""], ["Hinweis", "x", ""]]), "Importhinweise");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
const prof = (id: string, extra: P = {}): P => ({
  BookingCorner_ID: id, Archiviert: "Falsch", Name: "Muster" + "abcdefghij"[Number(id)], Vorname: "Test", "Mobile CH (07...)": "079 000 00 " + id.padStart(2, "0"),
  Email: `t${id}@example.invalid`, "Aktiv von": "01.12.2026", "Aktiv bis": "15.04.2027", "Sichtbar auf Ihre Website": "Falsch",
  "Lohn pro Stunde/Monat (CHF)": "35/40 alt", Bank: "Synth Bank", "Kontonummer/IBAN": "CH00 SYNTH", "AHV Nummer / PEID": "756.0000.0000.00",
  Bilddatei: `${id}.jpg`, Jackennummer: "J" + id, ...extra,
});

Deno.test("parse: counts, archived skipped, windows, photos, notes, newline header", async () => {
  const x = book([
    prof("1"), prof("2", { "Aktiv von": "01.12.2020", "Aktiv bis": "15.04.2021" }), prof("3", { Archiviert: "Wahr" }),
    prof("4", { Email: null, "Mobile CH (07...)": null, "Lohn pro Stunde/Monat (CHF)": null, Bilddatei: null }),
  ], [
    { BookingCorner_ID: "1", Bereich: "Sprachen", Eintrag: 1, "Quellwert / Erfassungsstatus": "Deutsch" },
    { BookingCorner_ID: "1", Bereich: "Ausnahmen", Eintrag: 2, "Quellwert / Erfassungsstatus": "keine erfasst" },
    { BookingCorner_ID: "9", Bereich: "Sprachen", Eintrag: 1, "Quellwert / Erfassungsstatus": "Englisch" },
  ], { newlineHeader: true });
  const z = zipSync({ "fotos/1.jpg": JPEG, "fotos/2.JPG": JPEG, "fotos/extra.jpg": JPEG });
  const r = await parseImport(x, z, TODAY);
  assertEquals(r.errors, []);
  assertEquals(r.profiles.length, 3);
  assertEquals(r.archivedCount, 1);
  assertEquals(r.profiles.filter((p) => p.hasCurrentWindow).length, 2); // historic window of #2 not current
  assertEquals(r.photos.map((p) => p.sourceId).sort(), ["1", "2"]);
  assertEquals(r.photoMissing, ["4"]);
  assertEquals(r.zipUnused, 1);
  assertEquals(r.assignmentRows, 3);
  assertEquals(r.assignmentOrphans, 1);
  assertEquals(r.explicitAbsenceDates, 0);
  assertEquals(r.notes[0][0], "YETI | Lehrerübernahme");
  const p4 = r.profiles.find((p) => p.sourceId === "4")!;
  assertEquals([p4.email, p4.phone, p4.private.wage_raw, p4.country], [null, null, null, null]); // no fabricated values
  const p1 = r.profiles.find((p) => p.sourceId === "1")!;
  assertEquals(p1.window, { from: "2026-12-01", until: "2027-04-15" });
  assertEquals(p1.private.wage_raw, "35/40 alt");
  assertEquals(p1.private.unresolved["Jackennummer"], "J1");
  assert(!("wage_raw" in (p1 as unknown as Record<string, unknown>)));
});

Deno.test("parse: explicit absence date is counted, never mapped", async () => {
  const x = book([prof("1")], [{ BookingCorner_ID: "1", Bereich: "Ausnahmen", Eintrag: 1, "Quellwert / Erfassungsstatus": "24.12.2026" }]);
  const r = await parseImport(x, null, TODAY);
  assertEquals(r.explicitAbsenceDates, 1);
});

Deno.test("parse: missing sheet, duplicate ID, bad format", async () => {
  assert((await parseImport(book([prof("1")], [], { dropSheet: "Zuordnungen" }), null, TODAY)).errors.includes("sheet_missing:Zuordnungen"));
  assert((await parseImport(book([prof("1"), prof("1")]), null, TODAY)).errors.includes("duplicate_id:1"));
  assertEquals((await parseImport(new TextEncoder().encode("a,b"), null, TODAY)).errors, ["xlsx_invalid_format"]);
});

Deno.test("zip: unsafe paths and non-JPEG content rejected", async () => {
  assertEquals([isSafeZipPath("../x.jpg"), isSafeZipPath("/x.jpg"), isSafeZipPath("a\\b.jpg"), isSafeZipPath("C:x.jpg"), isSafeZipPath("a/b.jpg")], [false, false, false, false, true]);
  const z = zipSync({ "1.jpg": new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "a/../2.jpg": JPEG, "x.png": JPEG });
  const r = await parseImport(book([prof("1"), prof("2")]), z, TODAY);
  assertEquals(r.photos.length, 0);
  assertEquals(r.zipRejected.sort(), ["not_jpeg_content", "not_jpeg_name", "unsafe_path"]);
});

Deno.test("helpers: German booleans and header whitespace", () => {
  assertEquals([parseBool("Wahr"), parseBool("Falsch"), parseBool(""), parseBool("x")], [true, false, null, null]);
  assertEquals(normHeader("Sichtbar bei der \nAuswahl"), "Sichtbar bei der Auswahl");
});

const y = (id: string, f: string, l: string, phone: string | null, extra: Partial<YetiInstructor> = {}): YetiInstructor =>
  ({ id, first_name: f, last_name: l, phone, email: null, birth_date: null, street: null, zip: null, city: null, country: null, ...extra });

Deno.test("match: link, candidate, review, create, yeti-only, similar spelling", async () => {
  const r = await parseImport(book([
    prof("1"), prof("2"), prof("3"), prof("4", { Vorname: "Viktoria", Name: "Beispiel" }), prof("5"),
  ]), null, TODAY);
  const p = Object.fromEntries(r.profiles.map((x) => [x.sourceId, x]));
  const yeti = [
    y("L", "Test", "Musterb", "000"),                       // linked
    y("C", "Test", "Musterc", "+41 79 000 00 02"),          // name + phone -> candidate
    y("R", "Test", "Musterd", "079 111 11 11"),             // name, phone differs -> review
    y("V", "Victoria", "Beispiel", "079 000 00 04"),        // similar spelling -> review
    y("O", "Nur", "Yeti", null),                            // yeti-only
  ];
  const links = [{ source_id: "1", instructor_id: "L", source_checksum: p["1"].checksum }];
  const { results, yetiOnly } = classify(r.profiles, yeti, links);
  const c = Object.fromEntries(results.map((x) => [x.sourceId, x]));
  assertEquals(c["1"].classification, "no_op");
  assertEquals(c["2"].classification, "candidate");
  assertEquals(c["3"].classification, "review");
  assert(c["3"].reasons.includes("phone_differs"));
  assertEquals(c["4"].classification, "review");
  assert(c["4"].reasons.includes("similar_name"));
  assertEquals(c["5"].classification, "create");
  assertEquals(yetiOnly, ["O"]);
});

Deno.test("reimport: identical file with all links yields zero creates", async () => {
  const x = book([prof("1"), prof("2")]);
  const r1 = await parseImport(x, null, TODAY);
  const r2 = await parseImport(x, null, TODAY);
  const links = r1.profiles.map((p, i) => ({ source_id: p.sourceId, instructor_id: "Y" + i, source_checksum: p.checksum }));
  const yeti = r1.profiles.map((p, i) => y("Y" + i, p.firstName!, p.lastName!, p.phone));
  const { results } = classify(r2.profiles, yeti, links);
  assertEquals(results.filter((r) => r.classification === "create").length, 0);
  assert(results.every((r) => r.classification === "no_op"));
});

Deno.test("diff: missing source values never overwrite YETI values", async () => {
  const r = await parseImport(book([prof("1", { Email: null })]), null, TODAY);
  const links = [{ source_id: "1", instructor_id: "A", source_checksum: "old" }];
  const { results } = classify(r.profiles, [y("A", "Test", "Musterb", "079 000 00 01", { email: "keep@example.invalid" })], links);
  assertEquals(results[0].classification, "update");
  assert(!results[0].diff.some((d) => d.field === "email"));
});
