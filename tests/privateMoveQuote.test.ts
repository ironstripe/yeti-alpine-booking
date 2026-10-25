import { describe, expect, it, mock } from "bun:test";

// L1 client: a price-changing move is saved only after the user confirmed exactly the server quote.
const calls: Record<string, unknown>[] = [];
let responses: Array<{ data?: unknown; status?: number; payload?: unknown }> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (_name: string, { body }: { body: Record<string, unknown> }) => {
        calls.push(body);
        const r = responses.shift()!;
        if (r.data !== undefined) return { data: r.data, error: null };
        return { data: null, error: { context: { status: r.status, json: async () => r.payload } } };
      },
    },
  },
}));
const { paMove, PrivateAppointmentError } = await import("../src/lib/privateAppointmentsApi");
const { describeMoveQuote, isMoveQuote } = await import("../src/lib/privateMoveQuote");
const { buildEditRequest } = await import("../src/lib/canonicalPrivateEdit");

const D = "0123456789abcdef0123456789abcdef";
const quote = { items: [{ appointment_id: "a", date: "2026-12-08", time_start: "12:00:00", time_end: "14:00:00", gross: 150, discount_percent: 0,
  net: 150, old_gross: 190, old_net: 190, price_changed: true }], old_total: 190, new_total: 150, quote_digest: D, price_changed: true };
const req = { appointment_id: "a", date: "2026-12-08", time_start: "12:00", time_end: "14:00", instructor_id: "i" };

describe("L1 move price acknowledgement", () => {
  it("describes old → new per changed lesson and the booking total", () => {
    expect(isMoveQuote(quote)).toBe(true);
    const text = describeMoveQuote(quote);
    expect(text).toContain("08.12.2026 12:00–14:00: CHF 190.00 → CHF 150.00");
    expect(text).toContain("Total Buchung: CHF 190.00 → CHF 150.00");
  });
  it("confirmed: re-sends bound to the quote digest", async () => {
    calls.length = 0; responses = [{ status: 409, payload: { error: "quote_changed", quote } }, { data: { ok: true, price: 150 } }];
    const r = await paMove(req, () => true);
    expect(r).toEqual({ ok: true, price: 150 } as never);
    expect(calls.map((c) => c.acknowledged_quote_digest)).toEqual([undefined, D]);
  });
  it("declined: nothing is re-sent", async () => {
    calls.length = 0; responses = [{ status: 409, payload: { error: "quote_changed", quote } }];
    await expect(paMove(req, () => false)).rejects.toMatchObject({ code: "price_declined" });
    expect(calls.length).toBe(1);
  });
  it("quote changed again on retry: reported, not retried a third time", async () => {
    calls.length = 0; responses = [{ status: 409, payload: { error: "quote_changed", quote } }, { status: 409, payload: { error: "quote_changed", quote: { ...quote, quote_digest: "f".repeat(32) } } }];
    const err = await paMove(req, () => true).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateAppointmentError); expect(err.code).toBe("quote_changed"); expect(calls.length).toBe(2);
  });
  it("edit apply carries the edit quote digest only for participant changes", () => {
    const s = { ticketId: "t", totalAmount: 190, customerNotes: null, originalCustomerNotes: null,
      appointments: [{ id: "a", participantIds: ["p1"], price: 190, meetingPoint: null, internalNotes: null, instructorNotes: null, original: {} }] } as never;
    const withPeople = buildEditRequest(s, { participantIds: { a: ["p1", "p2"] }, meetingPoints: {}, internalNotes: { a: null }, instructorNotes: { a: null }, customerNotes: null } as never,
      { appointments: [{ appointment_id: "a", old_price: 190, new_price: 230, participants_changed: true }], old_total: 190, new_total: 230, changed: true, quote_digest: D });
    expect(withPeople?.acknowledged_quote_digest).toBe(D);
    const notesOnly = buildEditRequest(s, { participantIds: {}, meetingPoints: {}, internalNotes: { a: "x" }, instructorNotes: { a: null }, customerNotes: null } as never,
      { appointments: [], old_total: 190, new_total: 190, changed: true, quote_digest: D });
    expect(notesOnly?.acknowledged_quote_digest).toBeUndefined();
  });
});
