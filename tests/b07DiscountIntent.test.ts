import { describe, expect, it } from "vitest";
import { discountOverrideFor } from "@/lib/serverPrivateSlots";

describe("B07-P2 discount intent (explicit manual override replaces automatic)", () => {
  it("untouched default 0 is not an override", () => {
    expect(discountOverrideFor({ discountExplicit: false, discountPercent: 0, discountReason: "" })).toBeUndefined();
  });
  it("explicit 0 is an override, distinguishable from none", () => {
    expect(discountOverrideFor({ discountExplicit: true, discountPercent: 0, discountReason: "Kein Rabatt" })).toEqual({ percent: 0, reason: "Kein Rabatt" });
  });
  it("cleared override (explicit false) returns to automatic even with a stale percent", () => {
    expect(discountOverrideFor({ discountExplicit: false, discountPercent: 15, discountReason: "x" })).toBeUndefined();
  });
});
