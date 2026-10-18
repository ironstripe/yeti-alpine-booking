import { describe, it, expect } from "bun:test";
import {
  buildTariffSavePayload, cellKey, toCellMap, validateTariffPrice,
} from "@/lib/privateTariffMatrix";

const persisted = toCellMap([
  { duration_minutes: 60, persons_per_lesson: 1, price_chf: 85 },
  { duration_minutes: 120, persons_per_lesson: 3, price_chf: 200 },
]);

describe("buildTariffSavePayload", () => {
  it("returns null when nothing changed", () => {
    const edited = new Map(persisted);
    expect(buildTariffSavePayload(persisted, edited)).toBeNull();
  });

  it("sends only the changed cell (2h / 3 persons)", () => {
    const edited = new Map(persisted);
    edited.set(cellKey(120, 3), 210);
    expect(buildTariffSavePayload(persisted, edited)).toEqual([
      { duration_minutes: 120, persons_per_lesson: 3, price_chf: 210 },
    ]);
  });

  it("adds a previously empty cell", () => {
    const edited = new Map(persisted);
    edited.set(cellKey(180, 2), 260);
    expect(buildTariffSavePayload(persisted, edited)).toEqual([
      { duration_minutes: 180, persons_per_lesson: 2, price_chf: 260 },
    ]);
  });

  it("clears a blanked previously-set cell with null price", () => {
    const edited = new Map(persisted);
    edited.set(cellKey(60, 1), null);
    expect(buildTariffSavePayload(persisted, edited)).toEqual([
      { duration_minutes: 60, persons_per_lesson: 1, price_chf: null },
    ]);
  });

  it("ignores blank cells that were never set", () => {
    const edited = new Map(persisted);
    edited.set(cellKey(420, 5), null);
    expect(buildTariffSavePayload(persisted, edited)).toBeNull();
  });
});

describe("validateTariffPrice", () => {
  it("accepts blank (null) and positive prices", () => {
    expect(validateTariffPrice(null)).toBeNull();
    expect(validateTariffPrice(85)).toBeNull();
  });
  it("rejects zero, negative and non-finite prices", () => {
    expect(validateTariffPrice(0)).toBeTruthy();
    expect(validateTariffPrice(-5)).toBeTruthy();
    expect(validateTariffPrice(NaN)).toBeTruthy();
  });
});
