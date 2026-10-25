// Final release safety rules: replay recovery proof and tariff editor split.
import { describe, expect, test, mock } from "bun:test";
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { OfficeBookingError, replayProvesNotStored } = await import("../src/lib/officeBookingApi");
const { privateTariffEditors } = await import("../src/lib/privateTariffEditors");

describe("replay of an unknown office create", () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [503, "unavailable"], [400, "invalid"], [409, "submission_mismatch"], [0, "network"]] as const)
    test(`${status} ${code} does not prove the original was not stored`, () => {
      expect(replayProvesNotStored(new OfficeBookingError(status, code, {}, false))).toBe(false);
    });
  test("unknown 5xx proves nothing", () => expect(replayProvesNotStored(new OfficeBookingError(502, "internal_error", {}, true))).toBe(false));
  test("non-office error proves nothing", () => expect(replayProvesNotStored(new Error("x"))).toBe(false));
  test("quote_changed (after the key-serialized lookup) proves it was not stored", () =>
    expect(replayProvesNotStored(new OfficeBookingError(409, "quote_changed", {}, false))).toBe(true));
});

describe("private tariff editors", () => {
  test("old matrix stays off; rules editor shown for an edited private product after release", () => {
    expect(privateTariffEditors(true, "private")).toEqual({ matrix: false, rules: true });
  });
  test("not for new or non-private products", () => {
    expect(privateTariffEditors(false, "private").rules).toBe(false);
    expect(privateTariffEditors(true, "group").rules).toBe(false);
  });
});
