// R1 S2c: step-1 private price comes only from the server quote request (authoritative-server parity, no client math).
// Since the 2026-10-25 correction the server prices 14-16 at 170 and 10-12 at 190; the step shows whatever the server returns.
// Renders the real StepOnePrivateServerQuote + PrivateServerQuote with a stubbed wizard context and a
// controlled query result; captures the exact quote request each render would send.
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as realWizardContext from "../src/contexts/BookingWizardContext";
import * as realQuery from "@tanstack/react-query";

let state: Record<string, unknown> = {};
let result: { data?: unknown; isFetching: boolean; error: unknown } = { isFetching: true, error: null };
const keys: unknown[] = [];
mock.module("@/contexts/BookingWizardContext", () => ({ ...realWizardContext, useBookingWizard: () => ({ state }) }));
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: (o: { queryKey: unknown[]; enabled: boolean }) => { keys.push(o.enabled ? o.queryKey[1] : null); return o.enabled ? result : { isFetching: false, error: null }; },
}));
const { StepOnePrivateServerQuote } = await import("../src/components/bookings/wizard/StepOnePrivateServerQuote");

const D = "2026-12-21";
const base = (over: Record<string, unknown> = {}) => ({
  productType: "private", productId: "prod-ski", sport: "ski", duration: 2, isEditMode: false,
  selectedDates: [D], timeSlot: "14:00 - 16:00", timeSelections: [{ date: D, startTime: "14:00", endTime: "16:00" }],
  appointments: null, dayTimeOverrides: {}, dayInstructorOverrides: {}, instructorId: "t1", instructor: null, assignLater: false,
  privateGroupProposal: null, customerId: "c1", customer: { id: "c1", first_name: "S", last_name: "P" },
  activeCartItemId: "a", cartItems: [{ id: "a", assignedParticipantIds: ["p1"] }],
  selectedParticipants: [{ id: "p1", first_name: "Anna", last_name: "Muster", birth_date: "2015-01-01" }, { id: "p2", first_name: "Ben", last_name: "Muster", birth_date: "2015-01-01" }],
  localParticipants: [], participantBookings: {}, lunchSelections: {}, ...over,
});
const quote = (price: number) => ({ revision: 1, discount_rule_revision: 1, total: price, gross_total: price, discount_total: 0, automatic_discount_total: 0,
  discount_source: "none", discount_rule: { percent: 10, threshold_minutes: 240 }, day_context_digest: "d", existing_appointments: 0,
  items: [{ index: 0, price, mode: "exact_block", persons: 1, eligible: 0, automatic_discount_amount: 0, discount_source: "none", discount_percent: 0, discount_reason: null, discount_amount: 0, net: price }] });
const render = () => { keys.length = 0; return renderToStaticMarkup(<StepOnePrivateServerQuote />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); };
const lastReq = () => keys.filter(Boolean).at(-1) as Record<string, any>;

describe("step-1 private price = server quote", () => {
  test("10-12, 1 person: shows the server 190 (not a legacy client 170)", () => {
    state = base({ timeSelections: [{ date: D, startTime: "10:00", endTime: "12:00" }], timeSlot: "10:00 - 12:00" }); result = { data: quote(190), isFetching: false, error: null };
    const out = render(); expect(out).toContain("CHF 190.00"); expect(out).not.toContain("170");
  });
  test("14-16, 1 person: shows the server 170; request carries product/date/time/persons", () => {
    state = base(); result = { data: quote(170), isFetching: false, error: null };
    const out = render();
    expect(out).toContain("CHF 170.00"); expect(out).not.toContain("190");
    expect(lastReq()).toMatchObject({ product_id: "prod-ski", persons: 1, appointments: [{ date: D, time_start: "14:00", time_end: "16:00" }] });
  });
  test("while loading (or refetching after an edit) no old price is shown", () => {
    state = base(); result = { data: quote(190), isFetching: true, error: null };
    const out = render();
    expect(out).toContain("Preis wird vom Server berechnet"); expect(out).not.toContain("CHF 190.00");
  });
  test("edits change the request key (time, date, persons, product) so an older response cannot be reused", () => {
    state = base(); render(); const a = JSON.stringify(lastReq());
    state = base({ timeSelections: [{ date: D, startTime: "12:00", endTime: "14:00" }], timeSlot: "12:00 - 14:00" }); render(); const b = JSON.stringify(lastReq());
    state = base({ cartItems: [{ id: "a", assignedParticipantIds: ["p1", "p2"] }] }); render(); const c = lastReq();
    state = base({ productId: "prod-snow" }); render(); const d = JSON.stringify(lastReq());
    expect(new Set([a, b, JSON.stringify(c), d]).size).toBe(4); expect(c.persons).toBe(2);
  });
  test("server error / missing product: honest message, no price", () => {
    state = base(); result = { isFetching: false, error: new Error("Tarif nicht verfügbar") };
    expect(render()).toContain("Tarif nicht verfügbar");
    state = base({ productId: null }); result = { isFetching: false, error: null };
    const out = render(); expect(out).toContain("Bitte ein Privatstunden-Produkt wählen"); expect(out).not.toMatch(/CHF \d/);
  });
  test("no participants yet: no request, pending text", () => {
    state = base({ cartItems: [{ id: "a", assignedParticipantIds: [] }] });
    expect(render()).toContain("Preis folgt"); expect(keys.filter(Boolean).length).toBe(0);
  });
});
