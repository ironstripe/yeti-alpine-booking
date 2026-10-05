import { describe, expect, it, mock } from "bun:test";

let response: { data: unknown; error: unknown } | Error = { data: null, error: null };
const calls: Array<[string, string]> = [];
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          calls.push([col, val]);
          return {
            maybeSingle: async () => {
              if (response instanceof Error) throw response;
              return response;
            },
          };
        },
      }),
    }),
  },
}));

const { isCustomerEmailUniqueViolation, lookupCustomerByExactEmail } = await import(
  "../src/lib/customerEmailConflict"
);

const base = { id: "c1", first_name: "Test", last_name: "Kunde", email: "a@test.invalid", customer_number: "KD-T1", is_archived: false, merged_into_id: null };

describe("isCustomerEmailUniqueViolation", () => {
  it("detects exact email constraint", () => {
    expect(isCustomerEmailUniqueViolation({ code: "23505", message: 'duplicate key value violates unique constraint "customers_email_key"' })).toBe(true);
    expect(isCustomerEmailUniqueViolation({ code: "23505", message: "x", details: "customers_email_key" })).toBe(true);
  });
  it("does not mislabel other conflicts", () => {
    expect(isCustomerEmailUniqueViolation({ code: "23505", message: 'violates unique constraint "customers_customer_number_key"' })).toBe(false);
    expect(isCustomerEmailUniqueViolation({ code: "42501", message: "customers_email_key" })).toBe(false);
    expect(isCustomerEmailUniqueViolation(new Error("network"))).toBe(false);
    expect(isCustomerEmailUniqueViolation(null)).toBe(false);
  });
});

describe("lookupCustomerByExactEmail", () => {
  it("exact eq lookup, found", async () => {
    response = { data: base, error: null };
    const r = await lookupCustomerByExactEmail("a@test.invalid");
    expect(r.status).toBe("found");
    expect(calls.at(-1)).toEqual(["email", "a@test.invalid"]);
  });
  it("archived / merged / not found are unavailable", async () => {
    response = { data: { ...base, is_archived: true }, error: null };
    expect(await lookupCustomerByExactEmail("a")).toEqual({ status: "unavailable", reason: "archived" });
    response = { data: { ...base, merged_into_id: "c2" }, error: null };
    expect(await lookupCustomerByExactEmail("a")).toEqual({ status: "unavailable", reason: "merged" });
    response = { data: null, error: null };
    expect(await lookupCustomerByExactEmail("a")).toEqual({ status: "unavailable", reason: "not_found" });
  });
  it("errors are lookup_failed, not 'no duplicate'", async () => {
    response = { data: null, error: { code: "42501" } };
    expect((await lookupCustomerByExactEmail("a")).status).toBe("lookup_failed");
    response = new Error("network");
    expect((await lookupCustomerByExactEmail("a")).status).toBe("lookup_failed");
  });
});
