import { describe, expect, it } from "bun:test";
import { swissVatPercent, includedVat, formatVatPercent } from "../src/lib/vat";

describe("summary VAT", () => {
  it("uses 8.1 % for 26/27 service dates and 7.7 % before 2024", () => {
    expect(swissVatPercent("2026-12-14")).toBe(8.1);
    expect(swissVatPercent("2023-12-31")).toBe(7.7);
    expect(swissVatPercent("2024-01-01")).toBe(8.1);
    expect(formatVatPercent(8.1)).toBe("8.1%");
  });
  it("shows the VAT contained in the gross total (gross unchanged)", () => {
    expect(includedVat(657, 8.1)).toBe(49.25); // 657*8.1/108.1 = 49.23 -> 5 Rappen
    expect(includedVat(730, 8.1)).toBe(54.7);
    expect(includedVat(0, 8.1)).toBe(0);
  });
});
