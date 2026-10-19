import { describe, it, expect } from "bun:test";
import { itemSessions } from "@/lib/ticketItemSchedule";
import { effectiveBlockMinutes, offeringPreview, validateOffering, type ProductOffering } from "@/lib/productPublicOffering";

const priv = (s: string, e: string, actual: number | null = null) => ({ item_type: "private", date: "2026-12-14", time_start: s, time_end: e, instructor_id: "i1", actual_duration_minutes: actual });
const sum = (items: any[]) => { const m = new Map<string, number>(); items.forEach((i) => itemSessions(i, "2026-12-01", "2026-12-31").forEach((x) => !m.has(x.key) && m.set(x.key, x.minutes))); return [...m.values()].reduce((a, b) => a + b, 0); };

describe("clock vs effective duration", () => {
  it("09–10 = 55 effective", () => expect(effectiveBlockMinutes({ start: "09:00", end: "10:00" })).toBe(55));
  it("10–12 = 115 effective", () => expect(effectiveBlockMinutes({ start: "10:00", end: "12:00" })).toBe(115));
  it("manual 55 on 09–10 still pays 60", () => expect(sum([priv("09:00", "10:00", 55)])).toBe(60));
  it("10–12 pays 120", () => expect(sum([priv("10:00", "12:00", 115)])).toBe(120));
  it("two 120-min blocks pay 240, display 2 × 115", () => {
    expect(sum([priv("10:00", "12:00"), priv("14:00", "16:00")])).toBe(240);
    const o: ProductOffering = { schedule_kind: "weekly", weekdays: [1], dates: [], time_blocks: [{ start: "10:00", end: "12:00" }, { start: "14:00", end: "16:00" }] };
    expect(o.time_blocks.reduce((a, b) => a + effectiveBlockMinutes(b), 0)).toBe(230);
    expect(offeringPreview(o)).toContain("2 × 115 Min. Unterricht");
  });
  it("same session on two participant lines is not duplicated", () => expect(sum([priv("10:00", "12:00"), priv("10:00", "12:00")])).toBe(120));
  it("115-min product with a 14–16 block is not rejected", () => {
    const o: ProductOffering = { schedule_kind: "weekly", weekdays: [1], dates: [], time_blocks: [{ start: "14:00", end: "16:00" }] };
    expect(validateOffering(o, { type: "group", duration_minutes: 115 })).toBeNull();
  });
});
