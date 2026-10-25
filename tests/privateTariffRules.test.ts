// B07-P editor validation mirrors the SQL save checks; prices here are fixture data only.
import { describe, expect, test } from "bun:test";
import { validateTariffRules, PRODUCT_PRIVATE_TARIFFS_LIVE, type TariffRule } from "../src/lib/privateTariffRules";

const r = (o: Partial<TariffRule>): TariffRule => ({ rule_kind: "hourly", window_start: "09:00", window_end: "10:00", price_chf: 75,
  extra_person_chf: 20, max_persons: 4, max_block_minutes: null, office_only: false, provenance: "fixture", ...o });

describe("validateTariffRules", () => {
  test("accepts exact 10-12 block next to rush hourly window", () => {
    expect(validateTariffRules([r({ window_start: "10:00", window_end: "12:00", price_chf: 85, max_block_minutes: 60, office_only: true }),
      r({ rule_kind: "exact_block", window_start: "10:00", window_end: "12:00", price_chf: 190 })]).size).toBe(0);
  });
  test("rejects overlapping hourly windows", () => {
    expect(validateTariffRules([r({}), r({ window_start: "09:00", window_end: "11:00" })]).get(1)).toBe("Überschneidet anderen Stundentarif");
  });
  test("rejects duplicate exact block, half-hour hourly, zero price, missing provenance", () => {
    const e = validateTariffRules([r({ rule_kind: "exact_block", window_start: "10:00", window_end: "12:00" }), r({ rule_kind: "exact_block", window_start: "10:00", window_end: "12:00" }),
      r({ window_start: "12:30", window_end: "13:30" }), r({ window_start: "14:00", window_end: "15:00", price_chf: 0 }), r({ window_start: "15:00", window_end: "16:00", provenance: " " })]);
    expect([e.get(1), e.get(2), e.get(3), e.get(4)]).toEqual(["Gleicher Block doppelt", "Stundentarif nur zu vollen Stunden", "Preis muss grösser als 0 sein", "Quelle angeben"]);
  });
  test("max duration only for hourly rules", () => {
    expect(validateTariffRules([r({ rule_kind: "exact_block", max_block_minutes: 60 })]).size).toBe(1);
  });
  test("release switch is on for the coordinated B07 release", () => {
    expect(PRODUCT_PRIVATE_TARIFFS_LIVE).toBe(true);
  });
});
