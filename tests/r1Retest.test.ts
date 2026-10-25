// R1 retest follow-up: pure rules for S2 unassigned edit, S2 DOB, S2 group audit text and S3 history diff.
import { describe, expect, test } from "bun:test";
import { planCanonicalMove } from "../src/lib/ticketItemEditPlan";
import { historyEventLabel, historyEventText } from "../src/lib/ticketHistoryFormat";
import { birthDateChangeError } from "../src/lib/birthDate";

const cur = (instructor_id: string | null) => ({ date: "2026-12-21", time_start: "10:00:00", time_end: "12:00:00", instructor_id });
const ev = (details: Record<string, unknown>, event_type = "PRIVATE_APPOINTMENT_CHANGED") => ({ id: "e", created_at: "2026-10-25T10:00:00Z", event_type, details });
const slot = { date: "2026-12-21", time_start: "10:00:00", time_end: "12:00:00" };

describe("S2 position edit of an unassigned private lesson", () => {
  test("notes-only save (card resends unchanged fields) needs no move and no teacher", () => {
    expect(planCanonicalMove(cur(null), { date: "2026-12-21", timeStart: "10:00", timeEnd: "12:00", instructorId: null })).toEqual({ kind: "none" });
  });
  test("null -> null time move is sent as explicit assign_later", () => {
    expect(planCanonicalMove(cur(null), { date: "2026-12-21", timeStart: "14:00", timeEnd: "16:00", instructorId: null }))
      .toEqual({ kind: "move", body: { date: "2026-12-21", time_start: "14:00", time_end: "16:00", assign_later: true } });
  });
  test("explicit assignment sends the teacher", () => {
    expect(planCanonicalMove(cur(null), { instructorId: "t1" })).toEqual({ kind: "move", body: { ...{ date: "2026-12-21", time_start: "10:00", time_end: "12:00" }, instructor_id: "t1" } });
  });
  test("clearing an assigned teacher is refused (never treated as assign_later)", () => {
    expect(planCanonicalMove(cur("t1"), { instructorId: null })).toEqual({ kind: "error", message: "Bitte eine Lehrperson wählen." });
  });
  test("assigned lesson, notes only: no move", () => {
    expect(planCanonicalMove(cur("t1"), { date: "2026-12-21", timeStart: "10:00", timeEnd: "12:00", instructorId: "t1" })).toEqual({ kind: "none" });
  });
});

describe("S2 birth date (school day, Europe/Zurich)", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  test("tomorrow and 2030 are refused, today and a real past date are valid", () => {
    expect(birthDateChangeError("2026-10-26", null, now)).toBe("Das Geburtsdatum darf nicht in der Zukunft liegen.");
    expect(birthDateChangeError("2030-01-01", null, now)).toBe("Das Geburtsdatum darf nicht in der Zukunft liegen.");
    expect(birthDateChangeError("2026-10-25", null, now)).toBeNull();
    expect(birthDateChangeError("2016-02-29", null, now)).toBeNull();
  });
  test("invalid calendar date refused; unchanged historical value and NULL never re-judged", () => {
    expect(birthDateChangeError("2027-02-30", null, now)).toBe("Ungültiges Geburtsdatum.");
    expect(birthDateChangeError("2030-01-01", "2030-01-01", now)).toBeNull();
    expect(birthDateChangeError(null, null, now)).toBeNull();
  });
});

describe("S3 'moved' history shows actual payload differences", () => {
  test("assignment only: no 'verschoben', no fake time change", () => {
    const e = ev({ change: "moved", from: { ...slot, instructor_id: null }, to: { ...slot, instructor_id: "t" } });
    expect(historyEventLabel(e)).toBe("Lehrperson zugewiesen");
    expect(historyEventText(e)).toBe("Termin unverändert: 21.12.2026 10:00–12:00 · Lehrperson zugewiesen");
  });
  test("identical payload (e.g. notes-only legacy save): neutral label", () => {
    const e = ev({ change: "moved", from: { ...slot, instructor_id: "t" }, to: { ...slot, instructor_id: "t" } });
    expect(historyEventLabel(e)).toBe("Privatlektion gespeichert (ohne Termin- oder Lehrpersonänderung)");
  });
  test("real move keeps 'verschoben' and shows from → to", () => {
    const e = ev({ change: "moved", from: { ...slot, instructor_id: "t" }, to: { ...slot, time_start: "14:00:00", time_end: "16:00:00", instructor_id: "t" } });
    expect(historyEventLabel(e)).toBe("Privatlektion verschoben");
    expect(historyEventText(e)).toBe("21.12.2026 10:00–12:00 → 21.12.2026 14:00–16:00");
  });
  test("combined move + teacher change + acknowledged price", () => {
    const e = ev({ change: "moved", from: { ...slot, instructor_id: "t" }, to: { ...slot, time_start: "12:00:00", time_end: "14:00:00", instructor_id: "u" }, pricing: {}, old_total: 190, new_total: 150 });
    expect(historyEventLabel(e)).toBe("Privatlektion verschoben");
    expect(historyEventText(e)).toBe("21.12.2026 10:00–12:00 → 21.12.2026 12:00–14:00 · Lehrperson gewechselt · Betrag CHF 190.00 → CHF 150.00");
  });
  test("legacy/unknown shape: stored values shown, label unchanged", () => {
    expect(historyEventLabel(ev({ change: "moved" }))).toBe("Privatlektion verschoben");
    expect(historyEventText(ev({ change: "moved", from: "x" }))).toBe("– → –");
  });
});

describe("S2 group final booking value", () => {
  test("own payload amount; missing stays 'nicht protokolliert'", () => {
    expect(historyEventLabel(ev({}, "GROUP_BOOKING_CREATED"))).toBe("Gruppenbuchung angelegt");
    expect(historyEventText(ev({ ticket_total_after_create: 490, persons: 2, lines: 3 }, "GROUP_BOOKING_CREATED")))
      .toBe("2 Personen · 3 Positionen · Buchungsbetrag nach Anlage: CHF 490.00");
    expect(historyEventText(ev({}, "GROUP_BOOKING_CREATED"))).toBe("Buchungsbetrag nicht protokolliert");
  });
});
