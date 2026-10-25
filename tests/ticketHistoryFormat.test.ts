// B11: history texts use only each event's own persisted amounts; missing != 0; readable private changes.
import { describe, expect, test } from "bun:test";
import { compareHistory, historyEventLabel, historyEventText } from "../src/lib/ticketHistoryFormat";

const ev = (event_type: string, details: Record<string, unknown> | null, id = "e1", created_at = "2026-10-25T10:00:00Z") => ({ id, created_at, event_type, details });
const ids = ["a1", "a2"];

describe("B11 history texts", () => {
  test("initial 0 labelled as ticket-creation amount, final positive from created event", () => {
    expect(historyEventText(ev("BOOKING_CREATED", { ticket_number: "T-1", total_amount: 0 }))).toBe("Ticket T-1 erstellt · Betrag bei Anlage des Tickets: CHF 0.00");
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "created", appointment_ids: ids, persons: 2, unassigned: 0, ticket_total_after_create: 190 })))
      .toBe("2 Lektionen · 2 Personen · Buchungsbetrag nach Anlage der Lektionen: CHF 190.00");
  });
  test("true final zero stays zero; missing amount is 'nicht protokolliert' (old history)", () => {
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "created", appointment_ids: ["a"], ticket_total_after_create: 0 }))).toContain("CHF 0.00");
    const old = historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "created", appointment_ids: ["a"], persons: 1, unassigned: 1 }));
    expect(old).toContain("nicht protokolliert"); expect(old).not.toContain("CHF"); expect(old).toContain("1 ohne Lehrperson");
    expect(historyEventText(ev("BOOKING_CREATED", { ticket_number: "T-2" }))).toContain("nicht protokolliert");
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "created", appointment_ids: ["a"], ticket_total_after_create: null }))).toContain("nicht protokolliert");
  });
  test("later price edit shows that event's own old/new amounts", () => {
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "edited", appointments: [{}, {}], old_total: 190, new_total: 250, notes_changed: true })))
      .toBe("2 Lektionen · Betrag CHF 190.00 → CHF 250.00 · Notizen geändert");
  });
  test("move / assignment labels", () => {
    const from = { date: "2026-12-21", time_start: "10:00:00", time_end: "12:00:00", instructor_id: null };
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "moved", appointment_ids: ["a"], from, to: { ...from, time_start: "13:00:00", time_end: "15:00:00", instructor_id: "t" } })))
      .toBe("21.12.2026 10:00–12:00 → 21.12.2026 13:00–15:00 · Lehrperson zugewiesen");
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "moved", from: { ...from, instructor_id: "t" }, to: { ...from, instructor_id: "u" } }))).toContain("Lehrperson gewechselt");
    expect(historyEventLabel(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "moved" }))).toBe("Privatlektion verschoben");
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "confirmed", appointment_ids: ["a"], reason: "privat" }))).toBe("1 Lektion von der Lehrperson bestätigt");
  });
  test("unknown events: neutral label, raw type kept, no payload leaked", () => {
    expect(historyEventLabel(ev("SOMETHING_NEW", { email: "x@y" }))).toBe("Ereignis (SOMETHING_NEW)");
    expect(historyEventText(ev("SOMETHING_NEW", { email: "x@y" }))).toBe("Systemereignis");
    expect(historyEventText(ev("PRIVATE_APPOINTMENT_CHANGED", { change: "weird", appointment_ids: ["a"] }))).toBe("Änderung an 1 Lektion (Typ: weird)");
    expect(historyEventText(ev("BOOKING_CREATED", null))).toContain("nicht protokolliert");
  });
  test("same-transaction tie keeps ticket creation first, otherwise chronological", () => {
    const list = [{ timestamp: "2026-10-25T10:00:00Z", id: "b", rank: 1 }, { timestamp: "2026-10-25T10:00:00Z", id: "z", rank: 0 }, { timestamp: "2026-10-25T09:00:00Z", id: "c", rank: 1 }];
    expect([...list].sort(compareHistory).map((x) => x.id)).toEqual(["c", "z", "b"]);
  });
});
