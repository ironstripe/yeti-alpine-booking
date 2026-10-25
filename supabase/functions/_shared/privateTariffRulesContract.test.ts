import { RequestSchema, statusFor, publicBody } from "./privateAppointmentsContract.ts";
import { SaveRulesBodySchema } from "./privateTariffRulesContract.ts";
const U = "00000000-0000-4000-8000-000000000001";
const ok = (b: boolean, m: string) => { if (!b) throw new Error(m); };
Deno.test("quote action + create quote_revision accepted; unknown keys in quote rejected", () => {
  ok(RequestSchema.safeParse({ action: "quote", product_id: U, persons: 2, appointments: [{ date: "2026-12-14", time_start: "10:00", time_end: "12:00" }] }).success, "quote");
  ok(!RequestSchema.safeParse({ action: "quote", product_id: U, persons: 5, appointments: [{ date: "2026-12-14", time_start: "10:00", time_end: "12:00" }] }).success, "5 persons");
  ok(!RequestSchema.safeParse({ action: "quote", product_id: U, persons: 1, price: 1, appointments: [{ date: "2026-12-14", time_start: "10:00", time_end: "12:00" }] }).success, "client price");
  ok(RequestSchema.safeParse({ action: "create", submission_key: "abcdefgh", customer_id: U, product_id: U, quote_revision: 3,
    appointments: [{ date: "2026-12-14", time_start: "10:00", time_end: "12:00", assign_later: true }], participants: [{ participant_id: U }] }).success, "create");
});
Deno.test("tariff_unavailable -> 422 with reason only", () => {
  const r = { error: "tariff_unavailable", reason: "no_rule", index: 0, secret: 1 };
  ok(statusFor(r) === 422, "422");
  ok(JSON.stringify(publicBody(r)) === JSON.stringify({ error: "tariff_unavailable", reason: "no_rule", index: 0 }), "body");
});
Deno.test("rules save schema", () => {
  ok(SaveRulesBodySchema.safeParse({ product_id: U, expected_revision: 0, rules: [{ rule_kind: "exact_block", window_start: "10:00", window_end: "12:00", price_chf: 190, extra_person_chf: 0, max_persons: 4, provenance: "x" }] }).success, "ok");
  ok(!SaveRulesBodySchema.safeParse({ product_id: U, expected_revision: 0, rules: [{ rule_kind: "hourly", window_start: "10:00", window_end: "12:00", price_chf: 0, extra_person_chf: 0, max_persons: 4, provenance: "x" }] }).success, "zero");
});
