import { describe, it, expect } from "bun:test";
import { formatDurationLabel } from "@/lib/productDurationLabel";

describe("product duration suffix", () => {
  it("shows whole clock hours for effective teaching minutes", () => {
    expect(formatDurationLabel(55)).toBe("1h");
    expect(formatDurationLabel(115)).toBe("2h");
    expect(formatDurationLabel(230)).toBe("4h");
  });
  it("keeps exact clock durations", () => {
    expect(formatDurationLabel(60)).toBe("1h");
    expect(formatDurationLabel(120)).toBe("2h");
    expect(formatDurationLabel(240)).toBe("4h");
  });
  it("shows minutes only for short durations", () => {
    expect(formatDurationLabel(30)).toBe("30min");
    expect(formatDurationLabel(44)).toBe("44min");
  });
  it("never renders fractional hours", () => {
    for (let m = 1; m <= 600; m++) {
      const label = formatDurationLabel(m);
      expect(label).toMatch(/^\d+(h|min)$/);
    }
  });
  it("renders nothing when no duration is stored", () => {
    for (const value of [null, undefined, 0, NaN, -10, "115"]) {
      expect(formatDurationLabel(value as any)).toBe("");
    }
  });
});
