import { describe, expect, it } from "bun:test";
import { projectBookingLines, storedLineAmount } from "../src/lib/bookingReadProjection";
import { loadBookingReadProjection } from "../src/hooks/useBookingReadProjection";
import { scheduleByDay } from "../src/lib/ticketItemSchedule";

const a = { id: "a", date: "2026-12-26", time_start: "10:00", time_end: "11:00", instructor_id: "t", meeting_point: "Park" };
const people = [{ id: "p", first_name: "Lea", last_name: "S" }, { id: "q", first_name: "Tom", last_name: "S" }];
const links = [{ appointment_id: "a", participant_id: "p" }, { appointment_id: "a", participant_id: "q" }];
const lines = [{ id: "i", appointment_id: "a", participant: null, line_total: 105, unit_price: 105 }];
const project = (ls = lines) => projectBookingLines(ls, [a], links, people, [{ id: "t", first_name: "Anna" }]);
describe("B03b read-only projection", () => {
  it("R1 two people/NULL legacy person/one CHF105 line", () => {
    const r = project(); expect(Object.keys(r)).toEqual(["i"]); expect(r.i.people.map(p => p.name)).toEqual(["Lea S", "Tom S"]);
    expect(r.i.amount).toBe(105); expect(r.i.appointment).toEqual(a);
  });
  it("R2 per-lesson teacher, people and two separate daily blocks", () => {
    const b = { ...a, id: "b", time_start: "14:00", time_end: "16:00", instructor_id: "u" };
    const r = projectBookingLines([...lines, { ...lines[0], id: "j", appointment_id: "b" }], [a, b], [...links, { appointment_id: "b", participant_id: "p" }], people, [{ id: "t", first_name: "Anna" }, { id: "u", first_name: "Ben" }]);
    expect(r.j.people.map(p => p.id)).toEqual(["p"]); expect(r.i.instructorName).toBe("Anna"); expect(r.j.instructorName).toBe("Ben"); expect(r.j.appointment?.time_start).toBe("14:00");
  });
  it("R3 zero, discounted and NULL stored amounts; inputs unchanged", () => {
    const values = [0, 94.5, null]; const ls = values.map((v, i) => ({ id: String(i), line_total: v, unit_price: 105 }));
    const before = JSON.stringify(ls); expect(Object.values(projectBookingLines(ls, [], [], [], [])).map(r => r.amount)).toEqual([0, 94.5, 105]); expect(JSON.stringify(ls)).toBe(before);
    expect(storedLineAmount({ id: "z", line_total: null, unit_price: null })).toBe(0);
  });
  it("R4 mixed legacy/group/lunch preserve line counts and real group AM/PM", () => {
    const ls = [...lines, { id: "group", participant: people[0], line_total: 200, unit_price: 200 }, { id: "lunch", participant: people[0], line_total: 30, unit_price: 30 }];
    expect(Object.values(project(ls)).map(r => r.amount)).toEqual([105, 200, 30]);
    const group = { date: a.date, time_start: "10:00", time_end: "16:00", enrollments: [{ instance: { date: a.date, start_time: "10:00", end_time: "12:00" } }, { instance: { date: a.date, start_time: "14:00", end_time: "16:00" } }] };
    expect(scheduleByDay(group)).toEqual([{ date: a.date, times: ["10:00–12:00", "14:00–16:00"] }]);
  });
  it("R5 distinct same names, repeated person and unknown historical identity", () => {
    const r = projectBookingLines(lines, [a], [...links, { appointment_id: "a", participant_id: "missing" }], [{ id: "p", first_name: "Alex" }, { id: "q", first_name: "Alex" }], []);
    expect(r.i.people.map(p => p.id)).toEqual(["missing", "p", "q"]); expect(r.i.people.map(p => p.name)).toEqual(["Name nicht hinterlegt", "Alex", "Alex"]);
  });
  it("R7 canonical missing appointment never falls back to unrelated line person", () => {
    const r = projectBookingLines([{ ...lines[0], participant: people[0] }], [], [], [], []);
    expect(r.i.people).toEqual([]); expect(r.i.problem).toBe("Termindaten konnten nicht geladen werden");
  });
  it("R7 batch participant read error rejects; no reader writes", async () => {
    const reads: string[] = [];
    const client = { from: (table: string) => { reads.push(table); const q: any = { select: () => q, eq: () => q, in: () => q, then: (resolve: any) => resolve(table === "private_appointments" ? { data: [a], error: null } : { data: null, error: { message: "denied" } }) }; return q; } };
    await expect(loadBookingReadProjection(client as any, "ticket", lines)).rejects.toThrow("Unterrichts- und Teilnehmerdaten"); expect(reads).toEqual(["private_appointments", "private_appointment_participants"]);
  });
});