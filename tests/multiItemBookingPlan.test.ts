import { expect, test } from "bun:test";
import { createEmptyCartItem, type CartItem } from "../src/contexts/BookingWizardContext";
import { canonicalPayloadString, classifyMultiItemCart } from "../src/lib/multiItemBookingPlan";

const priv = (id: string, parts: string[], slots: Array<[string, string, number]>, sport: "ski" | "snowboard" = "ski"): CartItem => ({
  ...createEmptyCartItem(), id, productType: "private", productId: `p-${id}`, sport, assignedParticipantIds: parts,
  appointments: slots.map(([date, startTime, durationMinutes]) => ({ date, startTime, durationMinutes })),
});
const group = (id: string, parts: string[], server = true): CartItem => ({
  ...createEmptyCartItem(), id, productType: "group", productId: `g-${id}`, assignedParticipantIds: parts,
  groupPlan: (server ? { server: { course_id: "c" } } : {}) as never,
});

test("mixed private + group, three items, draft reused once", () => {
  const r = classifyMultiItemCart([
    priv("a", ["draft-1"], [["2027-01-02", "09:00", 60]]),
    priv("b", ["draft-1", "p2"], [["2027-01-02", "10:00", 120]], "snowboard"),
    group("c", ["draft-1"]),
  ]);
  expect(r.kind).toBe("supported");
  if (r.kind === "supported") { expect(r.positions.length).toBe(3); expect(r.draftParticipants).toEqual(["draft-1"]); }
});

test("same person overlap rejected, different people parallel and adjacent ok", () => {
  const over = classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "10:00", 120]]), priv("b", ["x"], [["2027-01-02", "11:00", 60]])]);
  expect(over.kind === "unsupported" && over.issues.some((i) => i.code === "same_person_overlap")).toBe(true);
  expect(classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "10:00", 120]]), priv("b", ["y"], [["2027-01-02", "10:00", 120]])]).kind).toBe("supported");
  expect(classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "10:00", 60]]), priv("b", ["x"], [["2027-01-02", "11:00", 60]])]).kind).toBe("supported");
});

test(">=4h same person same day is an explicit pricing blocker; split days or people are not", () => {
  const r = classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "09:00", 120]]), priv("b", ["x"], [["2027-01-02", "14:00", 120]], "snowboard")]);
  expect(r.kind === "unsupported" && r.issues[0]).toEqual({ code: "discount_decision_required", participant: "x", date: "2027-01-02", minutes: 240 });
  expect(classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "09:00", 120]]), priv("b", ["x"], [["2027-01-03", "09:00", 120]])]).kind).toBe("supported");
  expect(classifyMultiItemCart([priv("a", ["x"], [["2027-01-02", "09:00", 120]]), priv("b", ["y"], [["2027-01-02", "14:00", 120]])]).kind).toBe("supported");
});

test("unsupported shapes reported, never dropped", () => {
  const r = classifyMultiItemCart([{ ...createEmptyCartItem(), id: "u" }, group("g", ["x"], false), priv("p", [], [])]);
  expect(r.kind).toBe("unsupported");
  if (r.kind === "unsupported") expect(r.issues.map((i) => i.code).sort()).toEqual(
    ["group_without_source", "no_participants", "private_without_slots", "unknown_type"]);
});

test("payload fingerprint is key-order independent and detects changes", () => {
  expect(canonicalPayloadString({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe(canonicalPayloadString({ a: [2, { c: 0, d: 1 }], b: 1 }));
  expect(canonicalPayloadString({ a: 1 })).not.toBe(canonicalPayloadString({ a: 2 }));
});
