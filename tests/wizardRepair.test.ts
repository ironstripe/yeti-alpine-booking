import { describe, expect, test } from "bun:test";
import { createEmptyCartItem, type CartItem } from "../src/contexts/BookingWizardContext";
import { buildEffectivePrivatePlan } from "../src/lib/effectivePrivatePlan";
import { cartReadinessIssues } from "../src/lib/wizardReadiness";
import { dayBlocksBeforeAdd } from "../src/lib/privatePlan";

const D1 = "2026-12-09", D2 = "2026-12-11";
const item = (over: Partial<CartItem> = {}): CartItem => ({
  ...createEmptyCartItem(), productType: "private", sport: "ski", selectedDates: [D1],
  timeSlot: "10:00 - 11:00", duration: 1, assignLater: true, assignedParticipantIds: ["local-1"], ...over,
});
const fields = (items: CartItem[]) => cartReadinessIssues(items).map((i) => `${i.itemIndex}:${i.field}`);

describe("step-1 readiness", () => {
  test("assign-later + applied participant is ready (no teacher needed)", () => {
    expect(fields([item()])).toEqual([]);
  });
  test("created but unapplied participant blocks with a named reason", () => {
    expect(fields([item({ assignedParticipantIds: [] })])).toEqual(["0:participants"]);
  });
  test("neither teacher nor assign-later is named", () => {
    expect(fields([item({ assignLater: false })])).toEqual(["0:teacher"]);
  });
  test("per-day blocks without shared slot are ready", () => {
    const it = item({ selectedDates: [D1, D2], timeSlot: null, duration: null,
      dayTimeOverrides: { [D1]: [{ id: "a", startTime: "10:00", endTime: "11:00" }, { id: "b", startTime: "13:00", endTime: "14:00" }],
        [D2]: [{ id: "c", startTime: "09:00", endTime: "11:00" }] } });
    expect(fields([it])).toEqual([]);
    const plan = buildEffectivePrivatePlan(it);
    expect(plan.status === "ready" && plan.intervals.map((i) => `${i.date} ${i.startTime}-${i.endTime}`))
      .toEqual([`${D1} 10:00-11:00`, `${D1} 13:00-14:00`, `${D2} 09:00-11:00`]);
  });
  test("missing time is reported, never defaulted", () => {
    expect(fields([item({ timeSlot: null })])).toEqual(["0:time"]);
  });
  test("overlap / out of range stays invalid", () => {
    expect(fields([item({ dayTimeOverrides: { [D1]: [{ id: "a", startTime: "10:00", endTime: "12:00" }, { id: "b", startTime: "11:00", endTime: "13:00" }] } })])).toEqual(["0:time"]);
    expect(fields([item({ timeSlot: "15:00 - 17:00" })])).toEqual(["0:time"]);
  });
  test("empty second item blocks with item-specific reasons", () => {
    expect(fields([item(), createEmptyCartItem()])).toEqual(["1:product", "1:dates", "1:participants"]);
  });
});

describe("first extra block", () => {
  const id = () => "new";
  test("keeps shared window as first block", () => {
    expect(dayBlocksBeforeAdd(undefined, undefined, "10:00 - 11:00", id)).toEqual([{ id: "new", startTime: "10:00", endTime: "11:00" }]);
  });
  test("prefers per-day selection, keeps existing blocks, invents nothing", () => {
    expect(dayBlocksBeforeAdd([], { startTime: "09:00", endTime: "10:00" }, "10:00 - 11:00", id)[0].startTime).toBe("09:00");
    const ex = [{ id: "x", startTime: "13:00", endTime: "14:00" }];
    expect(dayBlocksBeforeAdd(ex, undefined, "10:00 - 11:00", id)).toBe(ex);
    expect(dayBlocksBeforeAdd(undefined, undefined, null, id)).toEqual([]);
  });
});
