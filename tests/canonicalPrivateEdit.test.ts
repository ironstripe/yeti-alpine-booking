import { describe, expect, it } from "bun:test";
import { buildEditRequest, draftFromSnapshot, hydrateCanonicalEdit, needsQuote } from "../src/lib/canonicalPrivateEdit";
import { legacySaveChangesTotal, legacyTicketTotal } from "../src/hooks/useUpdateBooking";

const T = "00000000-0000-4000-8000-0000000000t1", A1 = "a1", A2 = "a2", P1 = "p1", P2 = "p2", P3 = "p3";
const base = () => hydrateCanonicalEdit({
  ticket: { id: T, ticket_number: "T-SYN-1", customer_id: "c1", total_amount: 105, paid_amount: 0, notes: "" },
  items: [{ appointment_id: A1, participant_id: null, unit_price: 105, discount_percent: 0, internal_notes: "i", instructor_notes: "" }],
  appointments: [{ id: A1, date: "2026-12-26", time_start: "10:00:00", time_end: "11:00:00", instructor_id: "x", meeting_point: "sammelplatz_gorfion", status: "booked", price: 105 }],
  links: [{ appointment_id: A1, participant_id: P2 }, { appointment_id: A1, participant_id: P1 }],
  participants: [{ id: P1, first_name: "Lea" }, { id: P2, first_name: "Tom" }, { id: P3, first_name: "Mia" }],
  instructors: [{ id: "x", first_name: "Anna", last_name: "Eins" }],
});

describe("canonical private edit hydration", () => {
  it("review: distinct per-lesson notes and exact original scheduler/line values survive hydration", () => {
    const s = hydrateCanonicalEdit({ticket:{id:T,total_amount:777},items:[
      {id:'i1',appointment_id:A1,internal_notes:'one',instructor_notes:'teacher one',quantity:1,unit_price:105,line_total:94.5,discount_percent:10,discount_reason:'keep'},
      {id:'i2',appointment_id:A2,internal_notes:'two',instructor_notes:'teacher two',quantity:1,unit_price:105,line_total:105,discount_percent:0}],
      appointments:[{id:A1,date:'2026-12-26',time_start:'10:00:00',time_end:'11:00:00',instructor_id:'x',price:105,status:'booked'},
        {id:A2,date:'2026-12-27',time_start:'13:00:00',time_end:'14:00:00',instructor_id:'y',price:105,status:'booked'}],links:[],participants:[],instructors:[]});
    expect(s.appointments.map(a=>[a.internalNotes,a.instructorNotes])).toEqual([['one','teacher one'],['two','teacher two']]);
    const d=draftFromSnapshot(s); d.internalNotes[A1]='edited';
    const r=buildEditRequest(s,d);
    expect(r?.appointments).toHaveLength(1);
    expect(r?.appointments[0]).toMatchObject({appointment_id:A1,internal_notes:'edited',expected:{date:'2026-12-26',time_start:'10:00:00',time_end:'11:00:00',instructor_id:'x',line:{id:'i1',internal_notes:'one',instructor_notes:'teacher one',discount_reason:'keep',line_total:94.5}}});
  });
  it("2 people / 105 with NULL line participant", () => {
    const s = base();
    expect(s.appointments[0].participantIds).toEqual([P1, P2]);
    expect(s.appointments[0].price).toBe(105);
    expect(s.totalAmount).toBe(105);
    expect(s.appointments[0].instructorName).toBe("Anna Eins");
  });
  it("multiday keeps per-appointment people, teachers and times (no first-line homogenization)", () => {
    const s = hydrateCanonicalEdit({
      ticket: { id: T, total_amount: 300 }, items: [],
      appointments: [
        { id: A2, date: "2026-12-28", time_start: "13:00", time_end: "15:00", instructor_id: "y", status: "booked", price: 190 },
        { id: A1, date: "2026-12-27", time_start: "09:00", time_end: "10:00", instructor_id: "x", status: "booked", price: 85 },
        { id: "a3", date: "2026-12-29", time_start: "09:00", time_end: "10:00", instructor_id: "x", status: "cancelled", price: 85 },
      ],
      links: [{ appointment_id: A1, participant_id: P1 }, { appointment_id: A2, participant_id: P1 }, { appointment_id: A2, participant_id: P2 }],
      participants: [], instructors: [],
    });
    expect(s.appointments.map((a) => [a.id, a.timeStart, a.instructorId, a.participantIds])).toEqual([
      [A1, "09:00", "x", [P1]], [A2, "13:00", "y", [P1, P2]],
    ]);
  });
});

describe("canonical edit request", () => {
  it("unchanged save sends nothing", () => { const s = base(); expect(buildEditRequest(s, draftFromSnapshot(s))).toBeNull(); });
  it("notes-only does not need a quote and carries no participants", () => {
    const s = base(); const r = buildEditRequest(s, { ...draftFromSnapshot(s), internalNotes: { [A1]: "neu" } })!;
    expect(r.appointments).toHaveLength(1); expect(r.appointments[0].internal_notes).toBe("neu"); expect(needsQuote(r)).toBe(false);
  });
  it("adding a person needs a quote and acknowledges exactly the quoted prices", () => {
    const s = base(); const d = { ...draftFromSnapshot(s), participantIds: { [A1]: [P1, P2, P3] } };
    const r = buildEditRequest(s, d)!;
    expect(needsQuote(r)).toBe(true);
    expect(r.appointments[0]).toMatchObject({ expected_participant_ids: [P1, P2], expected_price: 105, participant_ids: [P1, P2, P3] });
    expect(r.acknowledged_total).toBeUndefined();
    const q = { appointments: [{ appointment_id: A1, old_price: 105, new_price: 125, participants_changed: true }], old_total: 105, new_total: 125, changed: true };
    const ack = buildEditRequest(s, d, q)!;
    expect(ack.appointments[0].acknowledged_price).toBe(125); expect(ack.acknowledged_total).toBe(125); expect(ack.expected_total).toBe(105);
  });
});

describe("legacy financial guard", () => {
  it("notes-only save keeps the stored total", () => expect(legacySaveChangesTotal({ addedParticipants: [], removedParticipantIds: [] })).toBe(false));
  it("recalculation keeps discounts and skips cancelled lines", () =>
    expect(legacyTicketTotal([{ unit_price: 100, quantity: 2, discount_percent: 10 }, { unit_price: 50, quantity: 1, line_total: 45 }, { unit_price: 99, quantity: 1, status: "cancelled" }])).toBe(225));
});
