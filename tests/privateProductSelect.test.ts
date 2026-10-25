import { expect, test } from "bun:test";
import { selectPrivateProduct } from "../src/lib/privateProductSelect";
// Live 26/27 shape: Ski 55 min, Snowboard 60 min (duration is not the tariff basis).
const SKI = { id: "3646f155-8a66-53e3-b512-749f3a42c1ae", type: "private", name: "Privatunterricht Ski", duration_minutes: 55 };
const SB = { id: "0e8e8669-d8f4-5b19-8e6d-36ff588fdee1", type: "private", name: "Privatunterricht Snowboard", duration_minutes: 60 };
const G = { id: "g", type: "group", name: "Ski Kids", duration_minutes: 120 };

test("legacy duration match cannot reach the 26/27 Ski product (demonstrated blocker)", () => {
  expect(selectPrivateProduct([SKI, SB, G], "ski", 2, false).kind).toBe("none");
  expect(selectPrivateProduct([SKI, SB, G], "ski", 1, false).kind).toBe("none");
});
test("tariff path: concrete product per sport for any duration", () => {
  for (const d of [1, 2, 3, 4]) {
    expect(selectPrivateProduct([SKI, SB, G], "ski", d, true)).toEqual({ kind: "product", product: SKI });
    expect(selectPrivateProduct([SKI, SB, G], "snowboard", d, true)).toEqual({ kind: "product", product: SB });
  }
});
test("tariff path fails closed: none or several per sport, no sport", () => {
  expect(selectPrivateProduct([SB, G], "ski", 2, true)).toEqual({ kind: "none", reason: "missing" });
  expect(selectPrivateProduct([SKI, { ...SKI, id: "x" }], "ski", 2, true)).toEqual({ kind: "none", reason: "ambiguous" });
  expect(selectPrivateProduct([SKI], null, 2, true)).toEqual({ kind: "none", reason: "incomplete" });
});
test("legacy path unchanged for matching durations", () => {
  const old = { id: "o", type: "private", name: "Private Lektion Ski 2h", duration_minutes: 120 };
  expect(selectPrivateProduct([old], "ski", 2, false)).toEqual({ kind: "product", product: old });
});
