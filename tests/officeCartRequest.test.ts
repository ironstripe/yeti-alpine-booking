// B07b: whole-cart mapping wizard -> office-booking request (pure). Also writes the captured request
// used by tests/b07bActivationCart.integration.mjs so SQL persistence runs on the real builder output.
import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { createEmptyCartItem, type BookingWizardState, type CartItem } from "../src/contexts/BookingWizardContext";
import { buildOfficeCart, currentCartItems, officeSubmissionKey, clearOfficeSubmissionKey } from "../src/lib/officeCartRequest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const SKI = "3646f155-8a66-53e3-b512-749f3a42c1ae", SB = "0e8e8669-d8f4-5b19-8e6d-36ff588fdee1";
const CUST = id(0xc1), ANNA = id(0xe1), BEN = id(0xe2), T1 = id(0xf001), T2 = id(0xf002), COURSE = id(0x150), P4 = id(0xa4), LUNCH = id(0xa5);
const WEEK = ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];

const priv = (iid: string, product: string, parts: string[], slots: Array<[string, string, number, string?]>, more: Partial<CartItem> = {}): CartItem => ({
  ...createEmptyCartItem(), id: iid, productType: "private", productId: product, sport: "ski", assignedParticipantIds: parts,
  selectedDates: [...new Set(slots.map((s) => s[0]))], meetingPoint: "malbipark", instructorId: T1,
  appointments: slots.map(([date, startTime, durationMinutes, instructorId]) => ({ date, startTime, durationMinutes, ...(instructorId ? { instructorId } : {}) })),
  ...more,
});
const group = (iid: string, parts: string[], lunch: Record<string, string[]> = {}): CartItem => ({
  ...createEmptyCartItem(), id: iid, productType: "group", productId: P4, sport: "ski", assignedParticipantIds: parts,
  selectedDates: WEEK, meetingPoint: "malbipark", lunchSelections: lunch,
  groupPlan: {
    courseId: COURSE, courseName: "Kids", productName: "26/27", meetingPoint: null, persistenceBlocker: null,
    blocks: WEEK.flatMap((date) => [{ date, startTime: "10:00", endTime: "12:00" }, { date, startTime: "14:00", endTime: "16:00" }]),
    server: { courseId: COURSE, productId: P4, block: null, unitPrice: 320 } as never,
  },
});
const people = [
  { id: ANNA, first_name: "Anna", last_name: "Synth", birth_date: "2016-02-02" },
  { id: BEN, first_name: "Ben", last_name: "Synth", birth_date: "2017-03-03" },
  { id: "guest-1", first_name: "Gast", last_name: "Neu", birth_date: "2016-01-01", isGuest: true },
];
const stateOf = (items: CartItem[], active: CartItem, more: Partial<BookingWizardState> = {}): BookingWizardState => ({
  ...(active as unknown as BookingWizardState), customerId: CUST, selectedParticipants: people as never,
  cartItems: items, activeCartItemId: active.id, discountExplicit: false, discountPercent: 0, discountReason: "",
  customerNotes: "", assignLater: false, ...more,
} as BookingWizardState);
const lunch = () => ({ id: LUNCH, price: 30 });

test("active unsaved item is taken from live fields, other items stay as stored", () => {
  const a = priv("a", SKI, [ANNA], [["2026-12-21", "10:00", 120]]);
  const b = priv("b", SB, [ANNA], [["2026-12-21", "14:00", 120, T2]]);
  const stale = { ...b, appointments: [{ date: "2026-12-21", startTime: "12:00", durationMinutes: 120 }] };
  const st = stateOf([a, stale], b); // root fields = live b
  const items = currentCartItems(st);
  expect(items[0]).toBe(a);
  expect(items[1].appointments?.[0].startTime).toBe("14:00");
});

test("private+private+group: one ref per person across items, actual teachers/dates, lunch, no prices", () => {
  const a = priv("a", SKI, [ANNA, "guest-1"], [["2026-12-21", "10:00", 120]]);
  const b = priv("b", SB, [ANNA], [["2026-12-21", "14:00", 120, T2]]);
  const g = group("g", ["guest-1", BEN], { [BEN]: [WEEK[0]] });
  const r = buildOfficeCart(stateOf([a, b, g], g), lunch, { payment_method: "invoice", settlement: "pay_later", billing_partner_id: null, payment_due_date: "2026-12-01" });
  expect(r.kind).toBe("ready");
  if (r.kind !== "ready") return;
  const c = r.cart;
  expect(c.participants).toEqual([
    { ref: "p1", participant_id: ANNA },
    { ref: "p2", guest: { first_name: "Gast", last_name: "Neu", birth_date: "2016-01-01" } },
    { ref: "p3", participant_id: BEN },
  ]);
  expect(c.items[0]).toEqual({ kind: "private", product_id: SKI, participants: ["p1", "p2"],
    appointments: [{ date: "2026-12-21", time_start: "10:00", time_end: "12:00", instructor_id: T1, meeting_point: "malbipark" }] });
  expect((c.items[1] as { appointments: Array<{ instructor_id: string }> }).appointments[0].instructor_id).toBe(T2);
  const gl = (c.items[2] as { lines: Array<Record<string, unknown>> }).lines;
  expect(gl.map((l) => l.participant)).toEqual(["p2", "p3"]);
  expect(gl[1].lunch_dates).toEqual([WEEK[0]]); expect(gl[1].lunch_product_id).toBe(LUNCH);
  expect(gl[0]).not.toHaveProperty("participant_id"); expect(gl[0]).not.toHaveProperty("guest");
  expect(JSON.stringify(c)).not.toContain("total");
  writeFileSync(new URL("./fixtures/b07b_captured_cart.json", import.meta.url), JSON.stringify(c, null, 2));
});

test("explicit manual 0 is sent per private item and as group discount only when > 0", () => {
  const a = priv("a", SKI, [ANNA], [["2026-12-21", "10:00", 120]]);
  const g = group("g", [BEN]);
  const r0 = buildOfficeCart(stateOf([a, g], a, { discountExplicit: true, discountPercent: 0, discountReason: "Kulanz" }), lunch);
  expect(r0.kind === "ready" && (r0.cart.items[0] as { discount_override?: unknown }).discount_override).toEqual({ percent: 0, reason: "Kulanz" });
  expect(r0.kind === "ready" && r0.cart.group_discount).toBeUndefined();
  const r10 = buildOfficeCart(stateOf([a, g], a, { discountExplicit: true, discountPercent: 10, discountReason: "Stammkunde" }), lunch);
  expect(r10.kind === "ready" && r10.cart.group_discount).toEqual({ percent: 10, reason: "Stammkunde" });
  const auto = buildOfficeCart(stateOf([a], a, { discountPercent: 0 }), lunch);
  expect(auto.kind === "ready" && "discount_override" in auto.cart.items[0]).toBe(false);
  expect(buildOfficeCart(stateOf([a], a, { discountExplicit: true, discountPercent: 5, discountReason: " " }), lunch).kind).toBe("error");
});

test("fails closed: missing product, no people, missing teacher, non-26/27 group, lunch unresolved", () => {
  const ok = priv("a", SKI, [ANNA], [["2026-12-21", "10:00", 120]]);
  expect(buildOfficeCart(stateOf([ok, priv("b", "", [ANNA], [["2026-12-22", "10:00", 120]], { productId: null })], ok), lunch)).toMatchObject({ kind: "error", item: "b" });
  expect(buildOfficeCart(stateOf([ok, priv("b", SB, [], [["2026-12-22", "10:00", 120]])], ok), lunch)).toMatchObject({ kind: "error", item: "b" });
  expect(buildOfficeCart(stateOf([ok, priv("b", SB, [BEN], [["2026-12-22", "10:00", 120]], { instructorId: null })], ok), lunch)).toMatchObject({ kind: "error", item: "b" });
  const legacy = { ...group("g", [BEN]), groupPlan: { ...group("g", [BEN]).groupPlan!, server: null } };
  expect(buildOfficeCart(stateOf([ok, legacy], ok), lunch)).toMatchObject({ kind: "error", item: "g" });
  expect(buildOfficeCart(stateOf([ok, group("g", [BEN], { [BEN]: [WEEK[0]] })], ok), () => null)).toMatchObject({ kind: "error", item: "g" });
  expect(buildOfficeCart(stateOf([ok], ok, { customerId: null }), lunch).kind).toBe("error");
});

test("explicit assign-later per item is the only way to omit a teacher", () => {
  const a = priv("a", SKI, [ANNA], [["2026-12-21", "10:00", 120]], { instructorId: null, assignLater: true });
  const r = buildOfficeCart(stateOf([a], a, { assignLater: true }), lunch);
  expect(r.kind === "ready" && (r.cart.items[0] as { appointments: Array<Record<string, unknown>> }).appointments[0]).toMatchObject({ assign_later: true });
});

test("submission key: stable per cart across payload changes, cleared only after success", () => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  const st = { cartItems: [{ id: "x" }] } as never;
  const k1 = officeSubmissionKey(st, s); expect(officeSubmissionKey(st, s)).toBe(k1);
  clearOfficeSubmissionKey(st, s); expect(officeSubmissionKey(st, s)).not.toBe(k1);
});
