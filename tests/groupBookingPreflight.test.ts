import { describe, test as it, expect } from "bun:test";
import { preflightGroupLines, type PreflightInput } from "../src/lib/groupBookingPreflight";

const seasons = [
  { id: "s25", name: "Winter 25/26", start_date: "2025-12-01", end_date: "2026-04-15" },
  { id: "s26", name: "Winter 26/27", start_date: "2026-12-01", end_date: "2027-04-15" },
];
const products = [
  { id: "p-legacy", name: "Gruppe", is_active: true, season_id: "s25", price: 80, type: "group" },
  { id: "p-zero", name: "Gruppe 0", is_active: true, season_id: "s25", price: 0, type: "group" },
  { id: "p-off", name: "Alt", is_active: false, season_id: "s25", price: 80, type: "group" },
  { id: "p-2627", name: "Carving", is_active: true, season_id: "s26", price: 90, type: "group" },
  { id: "p-src", name: "Quelle", is_active: true, season_id: "s25", price: 90, type: "group" },
];
const courses = [
  { id: "c-ok", name: "Kids", product_id: "p-legacy", price_per_day: 70, is_active: true },
  { id: "c-prodprice", name: "Kids2", product_id: "p-legacy", price_per_day: 0, is_active: true },
  { id: "c-zero", name: "Null", product_id: "p-zero", price_per_day: 0, is_active: true },
  { id: "c-nan", name: "NaN", product_id: "p-zero", price_per_day: Number.NaN, is_active: true },
  { id: "c-nolink", name: "Ohne", product_id: null, price_per_day: 70, is_active: true },
  { id: "c-off", name: "Off", product_id: "p-off", price_per_day: 70, is_active: true },
  { id: "c-2627", name: "Carving Mi", product_id: "p-2627", price_per_day: 70, is_active: true },
  { id: "c-src", name: "Quelle", product_id: "p-src", price_per_day: 70, is_active: true },
];
const base = (lines: PreflightInput["lines"]): PreflightInput => ({
  lines, courses, products, seasons, sourceBoundProductIds: new Set(["p-src"]),
});
const one = (courseId: string | null, dates = ["2026-01-10"]) => base([{ label: "Anna", courseId, dates }]);

describe("group booking preflight (#15)", () => {
  it("prices a correctly configured legacy course", () => {
    const r = preflightGroupLines(one("c-ok"));
    expect(r.ok && r.priced.get("c-ok")).toEqual({ productId: "p-legacy", unitPrice: 70 });
  });
  it("keeps the legacy product-price fallback for supported legacy products", () => {
    const r = preflightGroupLines(one("c-prodprice"));
    expect(r.ok && r.priced.get("c-prodprice")?.unitPrice).toBe(80);
  });
  it.each(["c-zero", "c-nan", "c-nolink", "c-off", null, "missing"])("rejects %s", (id) => {
    expect(preflightGroupLines(one(id as string | null)).ok).toBe(false);
  });
  it("rejects 26/27 source-bound products without legacy fallback", () => {
    const r = preflightGroupLines(one("c-2627", ["2027-01-13"]));
    expect(r.ok).toBe(false);
    if ("errors" in r) expect(r.errors[0]).toContain("Booking-Corner");
  });
  it("rejects products with tariff source evidence even in older seasons", () => {
    expect(preflightGroupLines(one("c-src")).ok).toBe(false);
  });
  it("requires the season to cover ALL dates", () => {
    expect(preflightGroupLines(one("c-ok", ["2026-04-15", "2026-04-16"])).ok).toBe(false);
  });
  it("mixed family booking: one bad participant blocks the whole booking", () => {
    const r = preflightGroupLines(base([
      { label: "Anna", courseId: "c-ok", dates: ["2026-01-10"] },
      { label: "Ben", courseId: "c-zero", dates: ["2026-01-10"] },
    ]));
    expect(r.ok).toBe(false);
    if ("errors" in r) expect(r.errors).toHaveLength(1);
  });
});
