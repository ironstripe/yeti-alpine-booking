// B09: season-aware lunch resolution (pure) + payload carries the per-line season product id.
import { describe, expect, test } from "bun:test";
import { lunchContextKey, pickSeasonLunch } from "../src/hooks/useLunchProduct";
import { buildStaffGroupLines } from "../src/lib/staffGroupPayload";

const S2627 = { id: "s26", start_date: "2026-12-01", end_date: "2027-04-15" };
const S2526 = { id: "s25", start_date: "2025-12-20", end_date: "2026-04-06" };
const row = (id: string, price = 30) => ({ id, price });

describe("pickSeasonLunch", () => {
  test("each season resolves its own row, independent of today", () => {
    expect(pickSeasonLunch(S2627, ["2026-12-21"], [row("l26")])).toEqual({ ok: true, product: { id: "l26", price: 30, seasonId: "s26" } });
    expect(pickSeasonLunch(S2526, ["2026-01-05"], [row("l25")])).toEqual({ ok: true, product: { id: "l25", price: 30, seasonId: "s25" } });
  });
  test("missing, duplicate, wrong price, no season, date outside season fail explicitly", () => {
    expect(pickSeasonLunch(S2627, ["2026-12-21"], [])).toEqual({ ok: false, reason: "missing" });
    expect(pickSeasonLunch(S2627, ["2026-12-21"], [row("a"), row("b")])).toEqual({ ok: false, reason: "ambiguous" });
    expect(pickSeasonLunch(S2627, ["2026-12-21"], [row("a", 25)])).toEqual({ ok: false, reason: "price" });
    expect(pickSeasonLunch(null, ["2026-12-21"], [row("a")])).toEqual({ ok: false, reason: "season" });
    expect(pickSeasonLunch(S2627, ["2026-11-30"], [row("a")])).toEqual({ ok: false, reason: "dates" });
  });
  test("cache key separates booked product and dates", () => {
    const a = lunchContextKey({ productId: "p1", dates: ["2026-12-22", "2026-12-21"] });
    expect(a).toEqual(lunchContextKey({ productId: "p1", dates: ["2026-12-21", "2026-12-22"] }));
    expect(a).not.toEqual(lunchContextKey({ productId: "p2", dates: ["2026-12-21", "2026-12-22"] }));
    expect(a).not.toEqual(lunchContextKey({ productId: "p1", dates: ["2026-12-21"] }));
  });
});

const D = ["2026-12-21", "2026-12-22"];
const blocks = D.flatMap((date) => [{ date, startTime: "10:00", endTime: "12:00" }, { date, startTime: "14:00", endTime: "16:00" }]);
const state = (lunch: Record<string, string[]>) => ({
  productType: "group", sport: "ski", selectedDates: D, cartItems: [{ id: "i", assignedParticipantIds: ["pa", "pb"] }], activeCartItemId: "i",
  selectedParticipants: [{ id: "pa", first_name: "Anna" }, { id: "pb", first_name: "Ben" }],
  useParticipantSpecificBooking: false, participantBookings: {}, lunchSelections: lunch, vegetarianSelections: { pb: true }, meetingPoint: null,
  groupPlan: { courseId: "c", courseName: "K", meetingPoint: "Täli", blocks, server: { courseId: "c", productId: "p26", block: null, unitPrice: 200 } },
}) as never;

describe("buildStaffGroupLines with season lookup", () => {
  test("lookup receives booked product + dates; each lunch line carries the resolved id", () => {
    const seen: string[] = [];
    const r = buildStaffGroupLines(state({ pa: D, pb: [D[1]] }), (pid, dates) => { seen.push(pid + ":" + dates.join()); return { id: "l26", price: 30 }; });
    expect(r.kind).toBe("server");
    if (r.kind !== "server") return;
    expect(seen.every((x) => x === "p26:" + D.join())).toBe(true);
    expect(r.lines.map((l) => [l.lunch_dates, l.lunch_product_id, l.vegetarian])).toEqual([[D, "l26", false], [[D[1]], "l26", true]]);
  });
  test("unresolved season lunch blocks save; no-lunch booking never consults lookup", () => {
    expect(buildStaffGroupLines(state({ pa: D }), () => null).kind).toBe("error");
    let called = false;
    const r = buildStaffGroupLines(state({}), () => { called = true; return null; });
    expect(r.kind).toBe("server"); expect(called).toBe(false);
  });
});
